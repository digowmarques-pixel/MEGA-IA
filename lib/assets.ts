import { db } from "./db";
import { buildFilename } from "./naming";

export type AssetRow = {
  id: number;
  generation_id: number | null;
  user_id: number;
  project_id: number | null;
  scenario_id: number | null;
  scene_id: number | null;
  parent_asset_id: number | null;
  kind: "image" | "video" | "audio";
  source: "generated" | "upload" | "previs";
  original_name: string | null;
  prompt: string | null;
  model: string | null;
  url: string;
  thumb_url: string | null;
  provider_ref: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  version: number;
  favorite: number;
  approved: number;
  created_at: string;
};

export type AssetView = AssetRow & {
  filename: string;
  user_name: string;
  project_code: string | null;
  scenario_idx: number | null;
  scene_idx: number | null;
};

const SELECT = `
  SELECT a.*, u.name AS user_name, p.code AS project_code, sc.idx AS scenario_idx, se.idx AS scene_idx
  FROM assets a
  JOIN users u ON u.id = a.user_id
  LEFT JOIN projects p ON p.id = a.project_id
  LEFT JOIN scenarios sc ON sc.id = a.scenario_id
  LEFT JOIN scenes se ON se.id = a.scene_id
`;

export function extOf(a: Pick<AssetRow, "url" | "kind" | "original_name">) {
  const fromName = a.original_name?.match(/\.([a-z0-9]{2,4})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const clean = a.url.split("?")[0];
  const m = clean.match(/\.([a-z0-9]{2,4})$/i);
  if (m && !clean.startsWith("/api/placeholder")) return m[1].toLowerCase();
  if (clean.startsWith("/api/placeholder")) return a.kind === "audio" ? "wav" : "svg";
  return a.kind === "video" ? "mp4" : a.kind === "audio" ? "mp3" : "png";
}

/** O nome é calculado a partir da posição atual (cenário/cena), então mover um asset renomeia na exportação. */
export function decorate(r: Omit<AssetView, "filename">): AssetView {
  return {
    ...r,
    filename: buildFilename({
      projectCode: r.project_code,
      scenarioIdx: r.scenario_idx,
      sceneIdx: r.scene_idx,
      kind: r.source === "upload" ? "ref" : r.source === "previs" ? "previs" : r.kind,
      version: r.version,
      ext: extOf(r),
      userName: r.user_name,
      id: r.id,
    }),
  };
}

export function getAssets(where: string, params: unknown[] = []): AssetView[] {
  const rows = db().prepare(`${SELECT} WHERE ${where} ORDER BY a.created_at DESC, a.id DESC`).all(...params) as Omit<AssetView, "filename">[];
  return rows.map(decorate);
}

export function getAsset(id: number): AssetView | null {
  return getAssets("a.id = ?", [id])[0] ?? null;
}

/** Próxima versão dentro do mesmo "slot" (projeto + cenário + cena + tipo + origem). */
export function nextVersion(opts: { projectId: number | null; scenarioId: number | null; sceneId: number | null; kind: string; source: string }) {
  const r = db()
    .prepare(
      `SELECT COALESCE(MAX(version), 0) v FROM assets
       WHERE project_id IS ? AND scenario_id IS ? AND scene_id IS ? AND kind = ? AND source = ?`
    )
    .get(opts.projectId, opts.scenarioId, opts.sceneId, opts.kind, opts.source) as { v: number };
  return r.v + 1;
}
