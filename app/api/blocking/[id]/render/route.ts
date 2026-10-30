import crypto from "crypto";
import fs from "fs";
import path from "path";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { getAsset, nextVersion } from "@/lib/assets";
import { db } from "@/lib/db";
import { mediaDir } from "@/lib/media";
import { hasFfmpeg, toMp4WithThumb } from "@/lib/video-tools";

/** Recebe a gravação do blocking (WebM/MP4 do navegador), converte para MP4 e salva como asset PREVIS na cena. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = Number((await ctx.params).id);
  const b = db().prepare("SELECT * FROM blocking_scenes WHERE id = ?").get(id) as { id: number; name: string; project_id: number | null; scenario_id: number | null; scene_id: number | null } | undefined;
  if (!b) throw new HttpError(404, "Cena 3D não encontrada");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !/^video\//.test(file.type)) throw new HttpError(400, "Gravação inválida");
  if (file.size > 200 * 1024 * 1024) throw new HttpError(400, "Gravação maior que 200 MB");
  const base = `previs_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const rawExt = file.type.includes("mp4") ? "mp4" : "webm";
  const raw = path.join(mediaDir(), `${base}_raw.${rawExt}`);
  fs.writeFileSync(raw, Buffer.from(await file.arrayBuffer()));
  let out: { url: string; thumbUrl: string | null; width: number | null; height: number | null; duration: number | null };
  if (await hasFfmpeg()) {
    out = await toMp4WithThumb(raw, base, { fps: Number(form.get("fps")) || 24 });
    fs.unlinkSync(raw);
  } else {
    // sem ffmpeg no servidor: guarda o arquivo como veio (alguns modelos podem não aceitar WebM)
    const final = path.join(mediaDir(), `${base}.${rawExt}`);
    fs.renameSync(raw, final);
    out = { url: `/api/media/${base}.${rawExt}`, thumbUrl: null, width: Number(form.get("width")) || null, height: Number(form.get("height")) || null, duration: Number(form.get("duration")) || null };
  }
  const version = nextVersion({ projectId: b.project_id, scenarioId: b.scenario_id, sceneId: b.scene_id, kind: "video", source: "previs" });
  const info = db().prepare(
    `INSERT INTO assets (user_id, project_id, scenario_id, scene_id, kind, source, original_name, prompt, url, thumb_url, width, height, duration, version)
     VALUES (?, ?, ?, ?, 'video', 'previs', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(user.id, b.project_id, b.scenario_id, b.scene_id, `${b.name}.mp4`, String(form.get("legend") || "") || null, out.url, out.thumbUrl, out.width, out.height, out.duration, version);
  const assetId = Number(info.lastInsertRowid);
  db().prepare("UPDATE blocking_scenes SET last_asset_id = ?, updated_at = datetime('now') WHERE id = ?").run(assetId, id);
  return Response.json({ asset: getAsset(assetId) });
});
