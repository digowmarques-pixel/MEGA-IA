import { handle, requireUser } from "@/lib/auth";
import { closeLink, createLink } from "@/lib/camlink";

/** Computador cria (ou renova) o pareamento e recebe o código para o QR. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as { scene: unknown; state?: Record<string, unknown> };
  const l = createLink(user.id, b.scene, b.state ?? {});
  return Response.json({ code: l.code, phoneUrls: phoneUrls(req) });
});

export const DELETE = handle(async (req: Request) => {
  await requireUser();
  const code = new URL(req.url).searchParams.get("code");
  if (code) closeLink(code);
  return Response.json({ ok: true });
});

/**
 * Endereços que o celular consegue abrir, em ordem de preferência. Rodando no computador, o server.mjs
 * informa o túnel (se houver) e o HTTPS da rede local; no servidor, vale o próprio domínio HTTPS.
 */
function phoneUrls(req: Request) {
  let local: string[] = [];
  try { local = JSON.parse(process.env.MEGA_PHONE_URLS || "[]"); } catch { /* sem lista */ }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const current = host ? `${proto}://${host}` : new URL(req.url).origin;
  const isLocalhost = /^(localhost|127\.|\[::1\])/.test(host ?? "");
  const list = [process.env.PUBLIC_URL, ...local.filter((u) => u.includes("trycloudflare")), proto === "https" && !isLocalhost ? current : null,
    ...local.filter((u) => !u.includes("trycloudflare")), current];
  return [...new Set(list.filter((u): u is string => !!u).map((u) => u.replace(/\/$/, "")))];
}
