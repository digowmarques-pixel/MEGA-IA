import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAssets } from "@/lib/assets";
import { getProject, getTree } from "@/lib/projects";
import { slugCode } from "@/lib/naming";
import { balance } from "@/lib/wallet";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const id = Number((await ctx.params).id);
  const project = getProject(id);
  if (!project) throw new HttpError(404, "Projeto não encontrado");
  const totals = db().prepare("SELECT COALESCE(SUM(credits),0) credits, COALESCE(SUM(cost_usd),0) usd FROM generations WHERE project_id = ? AND status != 'failed'").get(id);
  const budget = project.budget_enabled ? balance("project", id) : null;
  return Response.json({ project, tree: getTree(id), assets: getAssets("a.project_id = ?", [id]), totals, budget });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const id = Number((await ctx.params).id);
  if (!getProject(id)) throw new HttpError(404, "Projeto não encontrado");
  const b = (await req.json()) as Record<string, string>;
  const allowed = ["name", "client", "description", "look", "aspect_ratio", "status"] as const;
  for (const k of allowed) if (k in b) db().prepare(`UPDATE projects SET ${k} = ? WHERE id = ?`).run(b[k] ?? null, id);
  if (b.code) {
    const code = slugCode(b.code);
    if (db().prepare("SELECT 1 FROM projects WHERE code = ? AND id != ?").get(code, id)) throw new HttpError(409, "Código já usado por outro projeto");
    db().prepare("UPDATE projects SET code = ? WHERE id = ?").run(code, id);
  }
  return Response.json({ project: getProject(id) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const id = Number((await ctx.params).id);
  const p = getProject(id);
  if (!p) throw new HttpError(404, "Projeto não encontrado");
  if (user.role !== "admin" && p.created_by !== user.id) throw new HttpError(403, "Só o criador ou o gestor podem excluir");
  // O histórico de gerações (custos) é preservado: project_id vira NULL.
  db().prepare("DELETE FROM projects WHERE id = ?").run(id);
  return Response.json({ ok: true });
});
