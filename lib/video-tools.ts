import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { mediaDir } from "./media";

const run = promisify(execFile);
let ffmpegOk: boolean | null = null;
let ffmpegBin = "ffmpeg";

/** FFMPEG_PATH > cópia embutida (ffmpeg-static, funciona no Windows sem instalar) > ffmpeg do sistema. */
async function resolveFfmpeg() {
  const candidates: string[] = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  try {
    const mod = (await import("ffmpeg-static")) as unknown as { default?: string | null };
    if (mod.default) candidates.push(mod.default);
  } catch { /* sem cópia embutida */ }
  candidates.push("ffmpeg");
  for (const c of candidates) {
    if (await run(c, ["-version"]).then(() => true).catch(() => false)) { ffmpegBin = c; return true; }
  }
  return false;
}

export async function hasFfmpeg() {
  if (ffmpegOk === null) ffmpegOk = await resolveFfmpeg();
  return ffmpegOk;
}

/** Lê largura, altura e duração da saída do próprio ffmpeg (dispensa o ffprobe, que a cópia embutida não traz). */
async function probe(file: string) {
  const r = await run(ffmpegBin, ["-hide_banner", "-i", file]).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const err = String(r.stderr ?? "");
  const d = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const v = err.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/);
  return {
    width: v ? Number(v[1]) : null,
    height: v ? Number(v[2]) : null,
    duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null,
  };
}

/**
 * Normaliza a gravação do navegador (WebM ou MP4) para MP4 H.264 + yuv420p — o formato que os
 * modelos de vídeo aceitam como referência — e extrai um frame de capa.
 */
export async function toMp4WithThumb(input: string, base: string, opts: { fps?: number } = {}) {
  const dir = mediaDir();
  const out = path.join(dir, `${base}.mp4`);
  const thumb = path.join(dir, `${base}.jpg`);
  const fps = opts.fps ?? 24;
  // Cada quadro da animação foi gravado uma única vez; os timestamps do navegador seguem o relógio
  // (e atrasam em máquinas lentas). Re-temporiza: quadro N = N/fps → duração exata da cena.
  await hasFfmpeg();
  await run(ffmpegBin, ["-y", "-i", input, "-vf", `setpts=N/(${fps}*TB)`, "-r", String(fps), "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out], { timeout: 120_000 });
  await run(ffmpegBin, ["-y", "-ss", "0.3", "-i", out, "-frames:v", "1", "-q:v", "3", thumb], { timeout: 30_000 }).catch(() => null);
  const { width, height, duration } = await probe(out);
  return { url: `/api/media/${base}.mp4`, thumbUrl: fs.existsSync(thumb) ? `/api/media/${base}.jpg` : null, width, height, duration };
}
