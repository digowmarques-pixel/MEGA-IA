import crypto from "crypto";

// Pareamento computador ↔ celular para a câmera virtual do Blocking 3D.
// Memória do processo Node (um servidor). O código de 6 caracteres funciona como senha temporária.

type Sub = { role: "desktop" | "phone"; send: (event: string, data: unknown) => void };
type Link = { code: string; ownerId: number; scene: unknown; state: Record<string, unknown>; subs: Set<Sub>; expires: number; lastPhoneSeen: number };

declare global {
  // eslint-disable-next-line no-var
  var __camLinks: Map<string, Link> | undefined;
}
const links = (global.__camLinks ??= new Map());
const TTL = 3 * 60 * 60 * 1000;

function gc() {
  const now = Date.now();
  for (const [k, l] of links) if (l.expires < now) { links.delete(k); }
}

export function createLink(ownerId: number, scene: unknown, state: Record<string, unknown>) {
  gc();
  // reaproveita o pareamento ativo do mesmo usuário (evita QR novo a cada clique)
  for (const l of links.values()) if (l.ownerId === ownerId) { l.scene = scene; l.state = state; l.expires = Date.now() + TTL; return l; }
  let code = "";
  do code = Array.from(crypto.randomBytes(6), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join(""); while (links.has(code));
  const link: Link = { code, ownerId, scene, state, subs: new Set(), expires: Date.now() + TTL, lastPhoneSeen: 0 };
  links.set(code, link);
  return link;
}

export function getLink(code: string) {
  const l = links.get(code.toUpperCase());
  if (!l || l.expires < Date.now()) return null;
  return l;
}

export function closeLink(code: string) {
  const l = getLink(code);
  if (!l) return;
  for (const s of l.subs) s.send("closed", {});
  links.delete(l.code);
}

/** Entrega a mensagem para o outro lado (desktop → phone ou phone → desktop). */
export function relay(l: Link, from: "desktop" | "phone", event: string, data: unknown) {
  if (from === "phone") l.lastPhoneSeen = Date.now();
  for (const s of l.subs) if (s.role !== from) s.send(event, data);
}

export function subscribe(l: Link, role: Sub["role"], signal: AbortSignal) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const sub: Sub = {
        role,
        send: (event, data) => { try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} },
      };
      l.subs.add(sub);
      sub.send("hello", { role, state: l.state, phones: [...l.subs].filter((s) => s.role === "phone").length });
      if (role === "phone") relay(l, "phone", "phone-connected", {});
      const ping = setInterval(() => sub.send("ping", Date.now()), 15000);
      signal.addEventListener("abort", () => {
        clearInterval(ping);
        l.subs.delete(sub);
        if (role === "phone") relay(l, "phone", "phone-disconnected", {});
        try { controller.close(); } catch {}
      });
    },
  });
}
