import { handle, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveScope } from "@/lib/generation";

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const projectId = Number(new URL(req.url).searchParams.get("projectId")) || null;
  const rows = db().prepare(`SELECT b.id, b.name, b.project_id, b.scenario_id, b.scene_id, b.updated_at, b.user_id, u.name AS user_name, p.name AS project_name,
      a.thumb_url AS thumb, a.url AS video
    FROM blocking_scenes b JOIN users u ON u.id = b.user_id LEFT JOIN projects p ON p.id = b.project_id LEFT JOIN assets a ON a.id = b.last_asset_id
    WHERE ${projectId ? "b.project_id = ?" : "(b.user_id = ? OR b.project_id IS NOT NULL)"} ORDER BY b.updated_at DESC LIMIT 100`).all(projectId ?? user.id);
  return Response.json({ scenes: rows });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as { name?: string; data: unknown; projectId?: number; scenarioId?: number; sceneId?: number };
  const scope = resolveScope(b);
  const info = db().prepare("INSERT INTO blocking_scenes (user_id, project_id, scenario_id, scene_id, name, data) VALUES (?, ?, ?, ?, ?, ?)")
    .run(user.id, scope.projectId, scope.scenarioId, scope.sceneId, (b.name || "Blocking sem nome").slice(0, 80), JSON.stringify(b.data ?? {}));
  return Response.json({ id: Number(info.lastInsertRowid) });
});
