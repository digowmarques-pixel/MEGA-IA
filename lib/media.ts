import fs from "fs";
import path from "path";

export function mediaDir() {
  const dir = path.join(process.cwd(), "data", "media");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export function mimeFor(file: string) {
  return MIME[file.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream";
}

export function extFromContentType(ct: string | null, kind: string) {
  if (ct) {
    for (const [ext, mime] of Object.entries(MIME)) if (ct.startsWith(mime)) return ext === "jpeg" ? "jpg" : ext;
  }
  return kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "png";
}
