import fs from "fs";
import path from "path";
import { mediaDir } from "../media";

// Integração ElevenLabs (API da empresa). Abas: Text to Speech, Criação de voz (design + clonagem),
// Sound Effects, Voice Isolator e Voice Changer.
const API = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io/v1";

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY não configurada no servidor");
  return k;
}

export function elevenlabsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

async function el(pathname: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${pathname}`, { ...init, headers: { "xi-api-key": key(), ...(init.headers || {}) } });
  if (!r.ok) {
    const text = await r.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.detail?.message || j.detail?.status || (typeof j.detail === "string" ? j.detail : text);
    } catch {}
    throw new Error(`ElevenLabs ${r.status}: ${String(msg).slice(0, 300)}`);
  }
  return r;
}

// ---------- catálogo ----------
export type Voice = { voice_id: string; name: string; category?: string; labels?: Record<string, string>; preview_url?: string; description?: string };
export type ElModel = { model_id: string; name: string; can_do_text_to_speech?: boolean; can_do_voice_conversion?: boolean; languages?: { language_id: string; name: string }[]; description?: string };

export async function listVoices(): Promise<Voice[]> {
  const r = await el("/voices");
  return ((await r.json()) as { voices: Voice[] }).voices;
}

export async function listModels(): Promise<ElModel[]> {
  const r = await el("/models");
  return (await r.json()) as ElModel[];
}

export async function subscription() {
  const r = await el("/user/subscription");
  return (await r.json()) as { tier: string; character_count: number; character_limit: number; next_character_count_reset_unix?: number };
}

// ---------- arquivos ----------
export const OUTPUT_FORMATS = [
  { id: "mp3_44100_192", label: "MP3 44,1 kHz (192 kbps)" },
  { id: "mp3_44100_128", label: "MP3 44,1 kHz (128 kbps)" },
  { id: "mp3_22050_32", label: "MP3 22 kHz (32 kbps) — leve" },
  { id: "pcm_44100", label: "WAV 44,1 kHz (sem compressão)" },
  { id: "pcm_24000", label: "WAV 24 kHz" },
  { id: "opus_48000_128", label: "Opus 48 kHz (128 kbps)" },
];

/** PCM cru (16-bit mono) → WAV com cabeçalho, para abrir em qualquer editor. */
function pcmToWav(pcm: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function saveAudio(buf: Buffer, format: string, prefix: string) {
  let ext = "mp3";
  let data = buf;
  if (format.startsWith("pcm_")) { data = pcmToWav(buf, Number(format.split("_")[1]) || 44100); ext = "wav"; }
  else if (format.startsWith("opus_")) ext = "ogg";
  const name = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(mediaDir(), name), data);
  return `/api/media/${name}`;
}

/** Custo informado pela ElevenLabs no cabeçalho (créditos/caracteres), quando presente. */
function headerCost(r: Response): number | null {
  for (const h of ["character-cost", "x-character-count", "x-credits-used"]) {
    const v = Number(r.headers.get(h));
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

export type VoiceSettings = { stability?: number; similarity?: number; style?: number; speed?: number; speakerBoost?: boolean };
const settingsBody = (s?: VoiceSettings) => ({
  stability: s?.stability ?? 0.5,
  similarity_boost: s?.similarity ?? 0.75,
  style: s?.style ?? 0,
  use_speaker_boost: s?.speakerBoost ?? true,
  ...(s?.speed ? { speed: s.speed } : {}),
});

// ---------- Text to Speech ----------
export async function textToSpeech(opts: { text: string; voiceId: string; modelId: string; settings?: VoiceSettings; languageCode?: string | null; outputFormat?: string; seed?: number | null }) {
  const format = opts.outputFormat || "mp3_44100_192";
  const body: Record<string, unknown> = { text: opts.text, model_id: opts.modelId, voice_settings: settingsBody(opts.settings) };
  if (opts.languageCode) body.language_code = opts.languageCode;
  if (opts.seed !== null && opts.seed !== undefined) body.seed = opts.seed;
  const r = await el(`/text-to-speech/${encodeURIComponent(opts.voiceId)}?output_format=${format}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { url: saveAudio(Buffer.from(await r.arrayBuffer()), format, "tts"), elCredits: headerCost(r) };
}

// ---------- Sound Effects ----------
export async function soundEffect(opts: { text: string; durationSeconds?: number | null; promptInfluence?: number; loop?: boolean; outputFormat?: string }) {
  const format = opts.outputFormat || "mp3_44100_192";
  const body: Record<string, unknown> = { text: opts.text, prompt_influence: opts.promptInfluence ?? 0.3 };
  if (opts.durationSeconds) body.duration_seconds = opts.durationSeconds;
  if (opts.loop) body.loop = true;
  const r = await el(`/sound-generation?output_format=${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { url: saveAudio(Buffer.from(await r.arrayBuffer()), format, "sfx"), elCredits: headerCost(r) };
}

// ---------- Voice Isolator ----------
export async function isolateVoice(file: { buffer: Buffer; name: string; type: string }) {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(file.buffer)], { type: file.type || "audio/mpeg" }), file.name);
  const r = await el("/audio-isolation", { method: "POST", body: form });
  return { url: saveAudio(Buffer.from(await r.arrayBuffer()), "mp3", "iso"), elCredits: headerCost(r) };
}

// ---------- Voice Changer (speech-to-speech) ----------
export async function changeVoice(opts: { file: { buffer: Buffer; name: string; type: string }; voiceId: string; modelId?: string; settings?: VoiceSettings; removeBackgroundNoise?: boolean; outputFormat?: string }) {
  const format = opts.outputFormat || "mp3_44100_192";
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(opts.file.buffer)], { type: opts.file.type || "audio/mpeg" }), opts.file.name);
  form.append("model_id", opts.modelId || "eleven_multilingual_sts_v2");
  form.append("voice_settings", JSON.stringify(settingsBody(opts.settings)));
  if (opts.removeBackgroundNoise) form.append("remove_background_noise", "true");
  const r = await el(`/speech-to-speech/${encodeURIComponent(opts.voiceId)}?output_format=${format}`, { method: "POST", body: form });
  return { url: saveAudio(Buffer.from(await r.arrayBuffer()), format, "vc"), elCredits: headerCost(r) };
}

// ---------- Criação de voz: design por descrição ----------
export async function designVoicePreviews(opts: { description: string; text?: string | null }) {
  const body: Record<string, unknown> = { voice_description: opts.description };
  if (opts.text && opts.text.trim().length >= 100) body.text = opts.text.trim();
  else body.auto_generate_text = true;
  const r = await el("/text-to-voice/create-previews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json()) as { previews: { audio_base_64: string; generated_voice_id: string; duration_secs?: number }[]; text?: string };
  return {
    text: j.text ?? opts.text ?? "",
    previews: j.previews.map((p) => ({
      generatedVoiceId: p.generated_voice_id,
      duration: p.duration_secs ?? null,
      url: saveAudio(Buffer.from(p.audio_base_64, "base64"), "mp3", "design"),
    })),
  };
}

export async function saveDesignedVoice(opts: { name: string; description: string; generatedVoiceId: string }) {
  const r = await el("/text-to-voice/create-voice-from-preview", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice_name: opts.name, voice_description: opts.description, generated_voice_id: opts.generatedVoiceId }),
  });
  return (await r.json()) as { voice_id: string; name: string };
}

// ---------- Criação de voz: clonagem instantânea ----------
export async function cloneVoice(opts: { name: string; description?: string; files: { buffer: Buffer; name: string; type: string }[]; removeBackgroundNoise?: boolean }) {
  const form = new FormData();
  form.append("name", opts.name);
  if (opts.description) form.append("description", opts.description);
  if (opts.removeBackgroundNoise) form.append("remove_background_noise", "true");
  for (const f of opts.files) form.append("files", new Blob([new Uint8Array(f.buffer)], { type: f.type || "audio/mpeg" }), f.name);
  const r = await el("/voices/add", { method: "POST", body: form });
  return (await r.json()) as { voice_id: string };
}
