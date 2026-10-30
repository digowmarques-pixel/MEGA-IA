import { db } from "./db";

/** Move um item para a posição `to` (1-based) dentro do grupo, renumerando os demais. */
export function reorder(table: "scenarios" | "scenes", groupCol: "project_id" | "scenario_id", groupId: number, id: number, to: number) {
  const d = db();
  d.transaction(() => {
    const ids = (d.prepare(`SELECT id FROM ${table} WHERE ${groupCol} = ? ORDER BY idx, id`).all(groupId) as { id: number }[]).map((r) => r.id).filter((x) => x !== id);
    const pos = Math.max(0, Math.min(ids.length, to - 1));
    ids.splice(pos, 0, id);
    const up = d.prepare(`UPDATE ${table} SET idx = ? WHERE id = ?`);
    ids.forEach((x, i) => up.run(i + 1, x));
  })();
}

export function renumber(table: "scenarios" | "scenes", groupCol: "project_id" | "scenario_id", groupId: number) {
  const d = db();
  const ids = d.prepare(`SELECT id FROM ${table} WHERE ${groupCol} = ? ORDER BY idx, id`).all(groupId) as { id: number }[];
  const up = d.prepare(`UPDATE ${table} SET idx = ? WHERE id = ?`);
  ids.forEach((r, i) => up.run(i + 1, r.id));
}
