import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, nextIdx } from "@/lib/projects";

export const POST = handle(async (req: Request) => {
  await requireUser();
  const b = (await req.json()) as { projectId: number; name?: string; description?: string; withScene?: boolean };
  if (!getProject(b.projectId)) throw new HttpError(404, "Projeto não encontrado");
  const idx = nextIdx("scenarios", "project_id", b.projectId);
  const d = db();
  const id = d.transaction(() => {
    const info = d.prepare("INSERT INTO scenarios (project_id, idx, name, description) VALUES (?, ?, ?, ?)").run(b.projectId, idx, b.name?.trim() || `Cenário ${idx}`, b.description || null);
    if (b.withScene !== false) d.prepare("INSERT INTO scenes (project_id, scenario_id, idx, name) VALUES (?, ?, 1, 'Cena 1')").run(b.projectId, info.lastInsertRowid);
    return Number(info.lastInsertRowid);
  })();
  return Response.json({ id });
});
