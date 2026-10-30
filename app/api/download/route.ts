import fs from "fs";
import JSZip from "jszip";
import path from "path";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { getAssets, type AssetView } from "@/lib/assets";
import { mediaDir } from "@/lib/media";
import { parsePlaceholderUrl } from "@/lib/placeholder";
import { getProject, getTree } from "@/lib/projects";
import { slugCode } from "@/lib/naming";

async function readAsset(a: AssetView, origin: string): Promise<Buffer> {
  if (a.url.startsWith("/api/media/")) return fs.readFileSync(path.join(mediaDir(), path.basename(a.url)));
  if (a.url.startsWith("/api/placeholder")) {
    const p = parsePlaceholderUrl(a.url);
    return p.audio ?? Buffer.from(p.svg!, "utf8");
  }
  const r = await fetch(a.url.startsWith("http") ? a.url : origin + a.url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/**
 * Download em lote como ZIP com a nomenclatura do projeto.
 * body: { assetIds?: number[], projectId?: number, scenarioId?: number, sceneId?: number, kinds?: string[], approvedOnly?: boolean, flat?: boolean }
 */
export const POST = handle(async (req: Request) => {
  await requireUser();
  const b = (await req.json()) as { assetIds?: number[]; projectId?: number; scenarioId?: number; sceneId?: number; kinds?: string[]; approvedOnly?: boolean; flat?: boolean };
  let assets: AssetView[];
  if (b.assetIds?.length) {
    const ids = b.assetIds.slice(0, 1000).map(Number);
    assets = getAssets(`a.id IN (${ids.map(() => "?").join(",")})`, ids);
  } else if (b.projectId) {
    const where = ["a.project_id = ?"];
    const params: unknown[] = [b.projectId];
    if (b.scenarioId) { where.push("a.scenario_id = ?"); params.push(b.scenarioId); }
    if (b.sceneId) { where.push("a.scene_id = ?"); params.push(b.sceneId); }
    if (b.kinds?.length) { where.push(`a.kind IN (${b.kinds.map(() => "?").join(",")})`); params.push(...b.kinds); }
    if (b.approvedOnly) where.push("a.approved = 1");
    assets = getAssets(where.join(" AND "), params);
  } else throw new HttpError(400, "Selecione arquivos ou um projeto");
  if (!assets.length) throw new HttpError(400, "Nenhum arquivo para baixar");

  // pastas legíveis: PROJETO/CEN01_Cozinha/CENA02_Chegada/
  const folderNames = new Map<string, string>();
  const projectIds = [...new Set(assets.map((a) => a.project_id).filter(Boolean))] as number[];
  for (const pid of projectIds) {
    for (const sc of getTree(pid)) {
      folderNames.set(`s${sc.id}`, `CEN${String(sc.idx).padStart(2, "0")}_${slugCode(sc.name)}`);
      for (const c of sc.scenes) folderNames.set(`c${c.id}`, `CENA${String(c.idx).padStart(2, "0")}_${slugCode(c.name)}`);
    }
  }

  const zip = new JSZip();
  const used = new Set<string>();
  const manifest = ["arquivo,tipo,origem,modelo,prompt,autor,criado_em,aprovado"];
  const errors: string[] = [];
  const origin = new URL(req.url).origin;

  await Promise.all(
    assets.map(async (a) => {
      let dir = "";
      if (!b.flat) {
        dir = a.project_code ? a.project_code + "/" : "AVULSOS/";
        if (a.scenario_id) dir += (folderNames.get(`s${a.scenario_id}`) ?? "CENARIO") + "/";
        if (a.scene_id) dir += (folderNames.get(`c${a.scene_id}`) ?? "CENA") + "/";
        if (a.source === "upload") dir += "_referencias/";
      }
      let name = dir + a.filename;
      for (let i = 2; used.has(name); i++) name = dir + a.filename.replace(/(\.[a-z0-9]+)$/i, `_${i}$1`);
      used.add(name);
      try {
        zip.file(name, await readAsset(a, origin));
        manifest.push([name, a.kind, a.source, a.model, a.prompt, a.user_name, a.created_at, a.approved ? "sim" : "não"].map(csv).join(","));
      } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : e}`);
      }
    })
  );
  zip.file("_manifesto.csv", "﻿" + manifest.join("\n"));
  if (errors.length) zip.file("_erros.txt", errors.join("\n"));

  const project = b.projectId ? getProject(b.projectId) : projectIds.length === 1 ? getProject(projectIds[0]) : null;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const zipName = `${project?.code ?? "AI_HUB"}_${date}_${assets.length}arquivos.zip`;
  const buf = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "X-File-Errors": String(errors.length),
    },
  });
});
