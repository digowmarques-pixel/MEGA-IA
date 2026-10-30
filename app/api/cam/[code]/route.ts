import { getSessionUser } from "@/lib/auth";
import { getLink, relay } from "@/lib/camlink";

type Ctx = { params: Promise<{ code: string }> };

/**
 * Mensagens em tempo real: { from: "phone" | "desktop", event, data }.
 * Celular: pose / cmd. Computador: state / scene (exige estar logado como dono do pareamento).
 */
export async function POST(req: Request, ctx: Ctx) {
  const l = getLink((await ctx.params).code);
  if (!l) return Response.json({ error: "Pareamento expirado. Gere um novo QR no computador." }, { status: 404 });
  const b = (await req.json().catch(() => null)) as { from?: string; event?: string; data?: unknown } | null;
  if (!b?.event || (b.from !== "phone" && b.from !== "desktop")) return Response.json({ error: "Mensagem inválida" }, { status: 400 });
  if (b.from === "desktop") {
    const u = await getSessionUser();
    if (!u || u.id !== l.ownerId) return Response.json({ error: "Sem acesso" }, { status: 403 });
    if (b.event === "scene") l.scene = b.data;
    if (b.event === "state") l.state = b.data as Record<string, unknown>;
  } else if (!["pose", "cmd", "info"].includes(b.event)) return Response.json({ error: "Evento inválido" }, { status: 400 });
  relay(l, b.from, b.event, b.data);
  return new Response(null, { status: 204 });
}
