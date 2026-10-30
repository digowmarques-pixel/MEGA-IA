import { getSessionUser } from "@/lib/auth";
import { getLink, subscribe } from "@/lib/camlink";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const l = getLink((await ctx.params).code);
  if (!l) return new Response("Pareamento expirado", { status: 404 });
  const role = new URL(req.url).searchParams.get("role") === "desktop" ? "desktop" : "phone";
  if (role === "desktop") {
    const u = await getSessionUser();
    if (!u || u.id !== l.ownerId) return new Response("Sem acesso", { status: 403 });
  }
  return new Response(subscribe(l, role, req.signal), {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
