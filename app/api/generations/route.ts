import { handle, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAssets } from "@/lib/assets";
import { refreshGeneration, type GenerationRow } from "@/lib/generation";

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const where: string[] = [];
  const params: unknown[] = [];
  const kind = url.searchParams.get("kind");
  const projectId = url.searchParams.get("projectId");
  if (url.searchParams.get("scope") !== "all" || user.role !== "admin") {
    where.push("g.user_id = ?");
    params.push(user.id);
  }
  if (kind) {
    where.push("g.kind IN (" + kind.split(",").map(() => "?").join(",") + ")");
    params.push(...kind.split(","));
  }
  if (projectId) {
    where.push("g.project_id = ?");
    params.push(Number(projectId));
  }
  const limit = Math.min(Number(url.searchParams.get("limit") || 60), 200);
  const rows = db()
    .prepare(
      `SELECT g.*, p.name AS project_name FROM generations g LEFT JOIN projects p ON p.id = g.project_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY g.id DESC LIMIT ${limit}`
    )
    .all(...params) as (GenerationRow & { project_name: string | null })[];

  // atualiza em paralelo as que ainda estão processando
  await Promise.all(rows.filter((r) => r.status === "processing").map((r) => refreshGeneration(r.id)));
  const ids = rows.map((r) => r.id);
  const assets = ids.length ? getAssets(`a.generation_id IN (${ids.map(() => "?").join(",")})`, ids) : [];
  const fresh = ids.length
    ? (db().prepare(`SELECT g.*, p.name AS project_name FROM generations g LEFT JOIN projects p ON p.id = g.project_id WHERE g.id IN (${ids.map(() => "?").join(",")}) ORDER BY g.id DESC`).all(...ids) as typeof rows)
    : [];
  return Response.json({
    generations: fresh.map((g) => ({ ...g, params: g.params ? JSON.parse(g.params) : null, assets: assets.filter((a) => a.generation_id === g.id) })),
  });
});
