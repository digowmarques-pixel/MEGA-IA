import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextIdx, type ScenarioRow } from "@/lib/projects";

export const POST = handle(async (req: Request) => {
  await requireUser();
  const b = (await req.json()) as { scenarioId: number; name?: string; description?: string };
  const s = db().prepare("SELECT * FROM scenarios WHERE id = ?").get(b.scenarioId) as ScenarioRow | undefined;
  if (!s) throw new HttpError(404, "Cenário não encontrado");
  const idx = nextIdx("scenes", "scenario_id", s.id);
  const info = db().prepare("INSERT INTO scenes (project_id, scenario_id, idx, name, description) VALUES (?, ?, ?, ?, ?)").run(s.project_id, s.id, idx, b.name?.trim() || `Cena ${idx}`, b.description || null);
  return Response.json({ id: Number(info.lastInsertRowid) });
});
