// Placeholders do modo simulação (mock): SVG com gradiente e um WAV curto.
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function esc(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function placeholderSvg(opts: { seed: string; w: number; h: number; kind: string; model: string; label: string }) {
  const h = hash(opts.seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + (h % 80)) % 360;
  const w = Math.min(Math.max(opts.w, 64), 4096);
  const ht = Math.min(Math.max(opts.h, 64), 4096);
  const fs = Math.round(Math.min(w, ht) / 22);
  const label = esc(opts.label.slice(0, 70));
  const play = opts.kind === "video"
    ? `<circle cx="${w / 2}" cy="${ht / 2}" r="${fs * 2.2}" fill="rgba(0,0,0,.45)" stroke="#FFD400" stroke-width="3"/><path d="M${w / 2 - fs * 0.7},${ht / 2 - fs} L${w / 2 + fs * 1.1},${ht / 2} L${w / 2 - fs * 0.7},${ht / 2 + fs} Z" fill="#FFD400"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue1},35%,22%)"/><stop offset="1" stop-color="hsl(${hue2},30%,8%)"/></linearGradient>
<radialGradient id="r" cx="${30 + (h % 40)}%" cy="${30 + (h % 30)}%" r="70%"><stop offset="0" stop-color="hsla(48,100%,60%,.28)"/><stop offset="1" stop-color="transparent"/></radialGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#r)"/>
${play}
<text x="${fs}" y="${fs * 1.8}" fill="#FFD400" font-family="Inter,Arial" font-weight="700" font-size="${fs}">SIMULAÇÃO · ${esc(opts.model)}</text>
<text x="${fs}" y="${ht - fs * 1.2}" fill="#fff" fill-opacity=".85" font-family="Inter,Arial" font-size="${Math.round(fs * 0.8)}">${label}</text>
</svg>`;
}

export function placeholderWav(seed: string) {
  const rate = 22050, secs = 2, n = rate * secs;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  const f = 220 + (hash(seed) % 440);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 2000, (n - i) / 4000);
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * f * i) / rate) * 6000 * env), 44 + i * 2);
  }
  return buf;
}

export function parsePlaceholderUrl(url: string) {
  const u = new URL(url, "http://x");
  const q = u.searchParams;
  if (u.pathname.endsWith("/audio")) return { audio: placeholderWav(q.get("seed") || "0") };
  return {
    svg: placeholderSvg({ seed: q.get("seed") || "0", w: Number(q.get("w") || 1280), h: Number(q.get("h") || 720), kind: q.get("kind") || "image", model: q.get("model") || "", label: q.get("label") || "" }),
  };
}
