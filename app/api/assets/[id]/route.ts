import fs from "fs";
import path from "path";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAsset, nextVersion } from "@/lib/assets";
import { mediaDir } from "@/lib/media";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const a = getAsset(Number((await ctx.params).id));
  if (!a) throw new HttpError(404, "Arquivo não encontrado");
  return Response.json({ asset: a });
});

/** Mover entre projeto/cenário/cena (drag-and-drop), favoritar, aprovar. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const id = Number((await ctx.params).id);
  const a = getAsset(id);
  if (!a) throw new HttpError(404, "Arquivo não encontrado");
  const b = (await req.json()) as { projectId?: number | null; scenarioId?: number | null; sceneId?: number | null; favorite?: boolean; approved?: boolean };
  const d = db();
  if (b.favorite !== undefined) d.prepare("UPDATE assets SET favorite = ? WHERE id = ?").run(b.favorite ? 1 : 0, id);
  if (b.approved !== undefined) d.prepare("UPDATE assets SET approved = ? WHERE id = ?").run(b.approved ? 1 : 0, id);
  if ("sceneId" in b || "scenarioId" in b || "projectId" in b) {
    let projectId = b.projectId ?? a.project_id;
    let scenarioId = b.scenarioId ?? null;
    const sceneId = b.sceneId ?? null;
    if (sceneId) {
      const s = d.prepare("SELECT project_id, scenario_id FROM scenes WHERE id = ?").get(sceneId) as { project_id: number; scenario_id: number } | undefined;
      if (!s) throw new HttpError(400, "Cena não encontrada");
      projectId = s.project_id; scenarioId = s.scenario_id;
    } else if (scenarioId) {
      const s = d.prepare("SELECT project_id FROM scenarios WHERE id = ?").get(scenarioId) as { project_id: number } | undefined;
      if (!s) throw new HttpError(400, "Cenário não encontrado");
      projectId = s.project_id;
    }
    const same = projectId === a.project_id && scenarioId === a.scenario_id && sceneId === a.scene_id;
    if (!same) {
      const version = nextVersion({ projectId, scenarioId, sceneId, kind: a.kind, source: a.source });
      d.prepare("UPDATE assets SET project_id = ?, scenario_id = ?, scene_id = ?, version = ? WHERE id = ?").run(projectId, scenarioId, sceneId, version, id);
    }
  }
  return Response.json({ asset: getAsset(id) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const id = Number((await ctx.params).id);
  const a = getAsset(id);
  if (!a) throw new HttpError(404, "Arquivo não encontrado");
  if (a.user_id !== user.id && user.role !== "admin") throw new HttpError(403, "Só quem criou ou o gestor podem excluir");
  db().prepare("DELETE FROM assets WHERE id = ?").run(id);
  if (a.url.startsWith("/api/media/")) {
    const f = path.join(mediaDir(), path.basename(a.url));
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  return Response.json({ ok: true });
});
