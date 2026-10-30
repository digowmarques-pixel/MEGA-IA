import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveScope } from "@/lib/generation";

type Ctx = { params: Promise<{ id: string }> };
type Row = { id: number; user_id: number; data: string };
const get = (id: number) => db().prepare("SELECT * FROM blocking_scenes WHERE id = ?").get(id) as Row | undefined;

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const r = get(Number((await ctx.params).id));
  if (!r) throw new HttpError(404, "Cena 3D não encontrada");
  return Response.json({ scene: { ...r, data: JSON.parse(r.data) } });
});

export const PUT = handle(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const id = Number((await ctx.params).id);
  if (!get(id)) throw new HttpError(404, "Cena 3D não encontrada");
  const b = (await req.json()) as { name?: string; data?: unknown; projectId?: number | null; scenarioId?: number | null; sceneId?: number | null };
  const scope = resolveScope(b);
  db().prepare("UPDATE blocking_scenes SET name = COALESCE(?, name), data = COALESCE(?, data), project_id = ?, scenario_id = ?, scene_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(b.name?.slice(0, 80) ?? null, b.data ? JSON.stringify(b.data) : null, scope.projectId, scope.scenarioId, scope.sceneId, id);
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const id = Number((await ctx.params).id);
  const r = get(id);
  if (!r) throw new HttpError(404, "Cena 3D não encontrada");
  if (r.user_id !== user.id && user.role !== "admin") throw new HttpError(403, "Só quem criou ou o gestor podem excluir");
  db().prepare("DELETE FROM blocking_scenes WHERE id = ?").run(id);
  return Response.json({ ok: true });
});
