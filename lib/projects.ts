import { db } from "./db";

export type ProjectRow = {
  id: number;
  name: string;
  code: string;
  client: string | null;
  description: string | null;
  look: string | null;
  aspect_ratio: string | null;
  status: string;
  budget_enabled: number;
  created_by: number | null;
  created_at: string;
};
export type ScenarioRow = { id: number; project_id: number; idx: number; name: string; description: string | null; created_at: string };
export type SceneRow = { id: number; project_id: number; scenario_id: number; idx: number; name: string; description: string | null; created_at: string };

export function getProject(id: number) {
  return db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
}

export function getTree(projectId: number) {
  const scenarios = db().prepare("SELECT * FROM scenarios WHERE project_id = ? ORDER BY idx").all(projectId) as ScenarioRow[];
  const scenes = db().prepare("SELECT * FROM scenes WHERE project_id = ? ORDER BY idx").all(projectId) as SceneRow[];
  return scenarios.map((s) => ({ ...s, scenes: scenes.filter((c) => c.scenario_id === s.id) }));
}

/** Texto de contexto enviado ao Claude (enhance e assistente). */
export function projectContext(opts: { projectId?: number | null; scenarioId?: number | null; sceneId?: number | null }) {
  if (!opts.projectId) return "";
  const p = getProject(opts.projectId);
  if (!p) return "";
  const lines = [
    `Projeto: ${p.name} (código ${p.code})${p.client ? ` — cliente ${p.client}` : ""}`,
    p.description && `Sinopse: ${p.description}`,
    p.look && `Look global / color grading: ${p.look}`,
    p.aspect_ratio && `Proporção do projeto: ${p.aspect_ratio}`,
  ];
  for (const sc of getTree(p.id)) {
    const focus = sc.id === opts.scenarioId ? " ← CENÁRIO ATUAL" : "";
    lines.push(`\nCenário ${sc.idx}: ${sc.name}${focus}${sc.description ? `\n  Descrição: ${sc.description}` : ""}`);
    for (const c of sc.scenes) {
      const f = c.id === opts.sceneId ? " ← CENA ATUAL" : "";
      lines.push(`  Cena ${c.idx}: ${c.name}${f}${c.description ? ` — ${c.description}` : ""}`);
    }
  }
  return lines.filter(Boolean).join("\n");
}

export function nextIdx(table: "scenarios" | "scenes", col: "project_id" | "scenario_id", id: number) {
  const r = db().prepare(`SELECT COALESCE(MAX(idx), 0) m FROM ${table} WHERE ${col} = ?`).get(id) as { m: number };
  return r.m + 1;
}
