import crypto from "crypto";
import fs from "fs";
import path from "path";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAssets, nextVersion } from "@/lib/assets";
import { imageSize } from "@/lib/image-size";
import { mediaDir } from "@/lib/media";

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB por arquivo
const ALLOWED = /^(image\/(png|jpe?g|webp|gif)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp3|wav|x-wav|wave))$/;

/** Upload em lote (arrastar e soltar): referências vão direto para projeto / cenário / cena. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, "Nenhum arquivo enviado");
  if (files.length > 100) throw new HttpError(400, "Máximo de 100 arquivos por envio");

  const d = db();
  let projectId = Number(form.get("projectId")) || null;
  let scenarioId = Number(form.get("scenarioId")) || null;
  const sceneId = Number(form.get("sceneId")) || null;
  if (sceneId) {
    const s = d.prepare("SELECT project_id, scenario_id FROM scenes WHERE id = ?").get(sceneId) as { project_id: number; scenario_id: number } | undefined;
    if (!s) throw new HttpError(400, "Cena não encontrada");
    projectId = s.project_id; scenarioId = s.scenario_id;
  } else if (scenarioId) {
    const s = d.prepare("SELECT project_id FROM scenarios WHERE id = ?").get(scenarioId) as { project_id: number } | undefined;
    if (!s) throw new HttpError(400, "Cenário não encontrado");
    projectId = s.project_id;
  }

  const rejected: { name: string; reason: string }[] = [];
  const ids: number[] = [];
  // ordena pelo nome do arquivo para que a versão siga a ordem da pasta (01.jpg, 02.jpg...)
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const file of files) {
    if (!ALLOWED.test(file.type)) { rejected.push({ name: file.name, reason: `tipo não suportado (${file.type || "desconhecido"})` }); continue; }
    if (file.size > MAX_BYTES) { rejected.push({ name: file.name, reason: "maior que 200 MB" }); continue; }
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.match(/\.([a-z0-9]{2,4})$/i)?.[1] || file.type.split("/")[1]).toLowerCase().replace("jpeg", "jpg").replace("quicktime", "mov");
    const stored = `up_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(mediaDir(), stored), buf);
    const kind = file.type.startsWith("image") ? "image" : file.type.startsWith("video") ? "video" : "audio";
    const dims = kind === "image" ? imageSize(buf) : null;
    const version = nextVersion({ projectId, scenarioId, sceneId, kind, source: "upload" });
    const info = d.prepare(
      `INSERT INTO assets (user_id, project_id, scenario_id, scene_id, kind, source, original_name, url, thumb_url, width, height, version)
       VALUES (?, ?, ?, ?, ?, 'upload', ?, ?, ?, ?, ?, ?)`
    ).run(user.id, projectId, scenarioId, sceneId, kind, file.name, `/api/media/${stored}`, kind === "image" ? `/api/media/${stored}` : null, dims?.width ?? null, dims?.height ?? null, version);
    ids.push(Number(info.lastInsertRowid));
  }
  // devolve na mesma ordem em que foram gravados (ordem natural dos nomes da pasta)
  const found = ids.length ? getAssets(`a.id IN (${ids.map(() => "?").join(",")})`, ids) : [];
  const assets = ids.map((id) => found.find((a) => a.id === id)!).filter(Boolean);
  return Response.json({ assets, rejected });
});
