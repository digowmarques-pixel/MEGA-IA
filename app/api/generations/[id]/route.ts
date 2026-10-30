import { handle, HttpError, requireUser } from "@/lib/auth";
import { getAssets } from "@/lib/assets";
import { refreshGeneration } from "@/lib/generation";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = Number((await ctx.params).id);
  const g = await refreshGeneration(id);
  if (!g) throw new HttpError(404, "Geração não encontrada");
  if (g.user_id !== user.id && user.role !== "admin") throw new HttpError(403, "Sem acesso");
  return Response.json({ generation: g, assets: getAssets("a.generation_id = ?", [id]) });
});
