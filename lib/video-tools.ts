import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { mediaDir } from "./media";

const run = promisify(execFile);
let ffmpegOk: boolean | null = null;

export async function hasFfmpeg() {
  if (ffmpegOk === null) ffmpegOk = await run("ffmpeg", ["-version"]).then(() => true).catch(() => false);
  return ffmpegOk;
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
  await run("ffmpeg", ["-y", "-i", input, "-vf", `setpts=N/(${fps}*TB)`, "-r", String(fps), "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out], { timeout: 120_000 });
  await run("ffmpeg", ["-y", "-ss", "0.3", "-i", out, "-frames:v", "1", "-q:v", "3", thumb], { timeout: 30_000 }).catch(() => null);
  const probe = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", out]).catch(() => null);
  let width: number | null = null, height: number | null = null, duration: number | null = null;
  if (probe) {
    const j = JSON.parse(probe.stdout) as { streams?: { width: number; height: number }[]; format?: { duration?: string } };
    width = j.streams?.[0]?.width ?? null; height = j.streams?.[0]?.height ?? null; duration = Number(j.format?.duration) || null;
  }
  return { url: `/api/media/${base}.mp4`, thumbUrl: fs.existsSync(thumb) ? `/api/media/${base}.jpg` : null, width, height, duration };
}
