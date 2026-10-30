import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { reorder, renumber } from "@/lib/reorder";
import type { SceneRow } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };
const get = (id: number) => db().prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow | undefined;

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const id = Number((await ctx.params).id);
  const s = get(id);
  if (!s) throw new HttpError(404, "Cena não encontrada");
  const b = (await req.json()) as { name?: string; description?: string; idx?: number };
  if (b.name !== undefined) db().prepare("UPDATE scenes SET name = ? WHERE id = ?").run(b.name.trim() || s.name, id);
  if (b.description !== undefined) db().prepare("UPDATE scenes SET description = ? WHERE id = ?").run(b.description, id);
  if (b.idx) reorder("scenes", "scenario_id", s.scenario_id, id, b.idx);
  return Response.json({ scene: get(id) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const id = Number((await ctx.params).id);
  const s = get(id);
  if (!s) throw new HttpError(404, "Cena não encontrada");
  const d = db();
  d.transaction(() => {
    d.prepare("UPDATE assets SET scene_id = NULL WHERE scene_id = ?").run(id); // ficam no cenário
    d.prepare("DELETE FROM scenes WHERE id = ?").run(id);
    renumber("scenes", "scenario_id", s.scenario_id);
  })();
  return Response.json({ ok: true });
});
