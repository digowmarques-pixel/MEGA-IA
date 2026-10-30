// Servidor do MEGA HUB AI para rodar no computador da produtora.
//
// - http://localhost:3100        → o hub no próprio computador
// - https://<ip-da-rede>:3443    → o mesmo hub para o celular na mesma rede Wi-Fi.
//   O celular só libera giroscópio e WebXR em HTTPS, por isso esta porta usa um certificado
//   gerado aqui mesmo (o celular mostra um aviso uma vez; é só tocar em "Avançado → continuar").
// - MEGA_TUNNEL=1 (opcional)     → abre um túnel cloudflared com HTTPS válido, para quando o
//   celular não aceitar o certificado local ou estiver em outra rede.
//
// No servidor (VPS) use o mesmo arquivo atrás de um proxy HTTPS, ou `npm run start:next`.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const dir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(dir);

// ---------- .env: cria na primeira execução, com uma chave de sessão aleatória ----------
const envFile = path.join(dir, ".env");
if (!fs.existsSync(envFile)) {
  const example = fs.existsSync(path.join(dir, ".env.example")) ? fs.readFileSync(path.join(dir, ".env.example"), "utf8") : "";
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(envFile, example.replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET=${secret}`) || `AUTH_SECRET=${secret}\nHIGGSFIELD_MODE=mock\n`);
  console.log("• Arquivo .env criado (modo simulação). Coloque as chaves do Higgsfield, Claude e ElevenLabs nele quando tiver.");
}
nextEnv.loadEnvConfig(dir, false);

const PORT = Number(process.env.PORT) || 3100;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const HOST = process.env.HOST || "0.0.0.0";

if (!fs.existsSync(path.join(dir, ".next", "BUILD_ID"))) {
  console.error("✖ O hub ainda não foi compilado. Rode INSTALAR.bat (Windows) ou ./instalar.sh antes.");
  process.exit(1);
}

// ---------- IPs da rede local, do mais provável (Wi-Fi/cabo) ao menos provável (VPN, WSL, VM) ----------
function lanAddresses() {
  const virtual = /vethernet|wsl|virtualbox|vmware|hyper-v|docker|loopback|tailscale|zerotier|vpn|utun|bridge|br-/i;
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      let score = a.address.startsWith("192.168.") ? 0 : a.address.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 2 : 3;
      if (virtual.test(name)) score += 10;
      out.push({ ip: a.address, name, score });
    }
  }
  return out.sort((a, b) => a.score - b.score);
}

// ---------- certificado local (refeito quando o IP da máquina muda ou perto de vencer) ----------
async function localCertificate(ips) {
  const certDir = path.join(dir, "data", "certs");
  const file = path.join(certDir, "local-https.json");
  fs.mkdirSync(certDir, { recursive: true });
  const want = [...ips].sort().join(",");
  try {
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    if (c.ips === want && new Date(c.notAfter).getTime() > Date.now() + 7 * 864e5) return c;
  } catch { /* gera um novo */ }
  const { default: selfsigned } = await import("selfsigned");
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + 2);
  const pems = await selfsigned.generate([{ name: "commonName", value: "MEGA HUB AI (local)" }], {
    keySize: 2048, algorithm: "sha256", notAfterDate: notAfter,
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 2, value: os.hostname() }, { type: 7, ip: "127.0.0.1" }, ...ips.map((ip) => ({ type: 7, ip }))] },
    ],
  });
  const c = { ips: want, key: pems.private, cert: pems.cert, notAfter: notAfter.toISOString() };
  fs.writeFileSync(file, JSON.stringify(c));
  return c;
}

// ---------- túnel opcional (HTTPS válido, acessível de qualquer rede) ----------
function startTunnel() {
  const local = path.join(dir, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  const bin = fs.existsSync(local) ? local : "cloudflared";
  return new Promise((resolve) => {
    let done = false;
    const finish = (url) => { if (!done) { done = true; resolve(url); } };
    let p;
    try {
      p = spawn(bin, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
    } catch { return finish(null); }
    p.on("error", () => { console.warn("⚠ cloudflared não encontrado. Coloque o cloudflared.exe na pasta do hub ou instale com: winget install Cloudflare.cloudflared"); finish(null); });
    const onData = (b) => { const m = String(b).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m) finish(m[0]); };
    p.stdout.on("data", onData);
    p.stderr.on("data", onData);
    setTimeout(() => finish(null), 30_000);
    process.on("exit", () => p.kill());
  });
}

const { default: next } = await import("next");
const app = next({ dev: false, dir, hostname: "localhost", port: PORT });
const handle = app.getRequestHandler();
await app.prepare();

const lan = lanAddresses();
const phoneUrls = [];

http.createServer((req, res) => handle(req, res)).listen(PORT, HOST);

let httpsOk = false;
if (process.env.LOCAL_HTTPS !== "0") {
  try {
    const cert = await localCertificate(lan.map((a) => a.ip));
    https.createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
      req.headers["x-forwarded-proto"] = "https";
      handle(req, res);
    }).listen(HTTPS_PORT, HOST);
    httpsOk = true;
    for (const a of lan) phoneUrls.push(`https://${a.ip}:${HTTPS_PORT}`);
  } catch (e) {
    console.warn("⚠ Não foi possível abrir o HTTPS local:", e instanceof Error ? e.message : e);
  }
}

if (process.env.MEGA_TUNNEL === "1" || process.argv.includes("--tunnel")) {
  console.log("• Abrindo túnel HTTPS (cloudflared)…");
  const url = await startTunnel();
  if (url) phoneUrls.unshift(url);
}

// A rota do QR code lê esta lista (mesmo processo) para montar o link do celular.
process.env.MEGA_PHONE_URLS = JSON.stringify(phoneUrls);

console.log("\n  MEGA HUB AI rodando\n");
console.log(`  Neste computador:   http://localhost:${PORT}`);
if (httpsOk && lan.length) {
  console.log(`  Celular / rede:     ${phoneUrls.filter((u) => !u.includes("trycloudflare")).join("\n                      ")}`);
}
if (phoneUrls[0]?.includes("trycloudflare")) console.log(`  Túnel (qualquer rede): ${phoneUrls[0]}`);
console.log("\n  Deixe esta janela aberta. Para parar: Ctrl+C.\n");
