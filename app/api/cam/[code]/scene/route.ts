import { getLink } from "@/lib/camlink";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const l = getLink((await ctx.params).code);
  if (!l) return Response.json({ error: "Pareamento expirado. Gere um novo QR no computador." }, { status: 404 });
  return Response.json({ scene: l.scene, state: l.state });
}
