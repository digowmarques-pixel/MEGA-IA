import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { reorder, renumber } from "@/lib/reorder";
import type { ScenarioRow } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };
const get = (id: number) => db().prepare("SELECT * FROM scenarios WHERE id = ?").get(id) as ScenarioRow | undefined;

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const id = Number((await ctx.params).id);
  const s = get(id);
  if (!s) throw new HttpError(404, "Cenário não encontrado");
  const b = (await req.json()) as { name?: string; description?: string; idx?: number };
  if (b.name !== undefined) db().prepare("UPDATE scenarios SET name = ? WHERE id = ?").run(b.name.trim() || s.name, id);
  if (b.description !== undefined) db().prepare("UPDATE scenarios SET description = ? WHERE id = ?").run(b.description, id);
  if (b.idx) reorder("scenarios", "project_id", s.project_id, id, b.idx);
  return Response.json({ scenario: get(id) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const id = Number((await ctx.params).id);
  const s = get(id);
  if (!s) throw new HttpError(404, "Cenário não encontrado");
  const d = db();
  d.transaction(() => {
    // assets do cenário voltam para "Geral" do projeto (não se perde nada)
    d.prepare("UPDATE assets SET scenario_id = NULL, scene_id = NULL WHERE scenario_id = ?").run(id);
    d.prepare("DELETE FROM scenarios WHERE id = ?").run(id);
    renumber("scenarios", "project_id", s.project_id);
  })();
  return Response.json({ ok: true });
});
