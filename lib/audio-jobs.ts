import fs from "fs";
import path from "path";
import { getAsset, getAssets } from "./assets";
import { HttpError, type SessionUser } from "./auth";
import { db, getSettingNumber } from "./db";
import { fail, insertAndReserve, resolveScope, saveOutputs, type GenerationRow } from "./generation";
import { mediaDir } from "./media";
import { resolveWallet, settle, usdPerCredit } from "./wallet";

export type AudioOp = "tts" | "sfx" | "isolate" | "changer" | "design";
export const OP_LABEL: Record<AudioOp, string> = { tts: "Text to Speech", sfx: "Sound Effects", isolate: "Voice Isolator", changer: "Voice Changer", design: "Criação de voz" };

/**
 * Estimativa em créditos ElevenLabs (base de cobrança deles). Convertida para dólar pelo valor
 * configurado pelo gestor e então para créditos do Hub, para debitar das mesmas carteiras.
 * Quando a ElevenLabs informa o custo real no cabeçalho, a cobrança é ajustada.
 */
export function elCreditsEstimate(op: AudioOp, p: { chars?: number; modelId?: string; durationSec?: number | null }) {
  switch (op) {
    case "tts": return Math.ceil((p.chars ?? 0) * (/flash|turbo/.test(p.modelId ?? "") ? 0.5 : 1));
    case "sfx": return p.durationSec ? Math.ceil(p.durationSec * 20) : 100;
    case "isolate":
    case "changer": return Math.ceil(((p.durationSec ?? 60) / 60) * 1000);
    case "design": return Math.max(250, p.chars ?? 0);
  }
}

export function elToHub(elCredits: number) {
  const usd = (elCredits / 1000) * getSettingNumber("elevenlabs_usd_per_1k_chars", 0);
  const rate = usdPerCredit();
  return { usd, credits: rate > 0 ? Math.round((usd / rate) * 100) / 100 : 0 };
}

export type AudioJob = {
  op: AudioOp;
  model: string;
  prompt: string;
  params: Record<string, unknown>;
  scope: { projectId?: number | null; scenarioId?: number | null; sceneId?: number | null };
  wallet?: "project" | "user" | "personal" | null;
  elCredits: number;
  clientRequestId?: string | null;
};

/** Reserva créditos, executa a chamada à ElevenLabs, salva o áudio e estorna se falhar. */
export async function runAudioJob(user: SessionUser, job: AudioJob, run: () => Promise<{ url: string; elCredits: number | null }>): Promise<GenerationRow> {
  const d = db();
  if (job.clientRequestId) {
    const ex = d.prepare("SELECT * FROM generations WHERE client_request_id = ?").get(job.clientRequestId) as GenerationRow | undefined;
    if (ex) return ex;
  }
  const scope = resolveScope(job.scope);
  const wallet = resolveWallet(user.id, scope.projectId, job.wallet);
  const est = elToHub(job.elCredits);
  const genId = insertAndReserve(user, wallet, est.credits, {
    user_id: user.id, project_id: scope.projectId, scenario_id: scope.scenarioId, scene_id: scope.sceneId,
    kind: "audio", model: job.model, prompt: job.prompt || null, source_asset_id: null,
    client_request_id: job.clientRequestId ?? null, provider: "elevenlabs",
    params: JSON.stringify({ op: job.op, elCreditsEstimate: job.elCredits, ...job.params }),
  });
  try {
    const r = await run();
    saveOutputs(genId, [{ kind: "audio", url: r.url }]);
    let usd = est.usd;
    if (r.elCredits && Math.abs(r.elCredits - job.elCredits) > 0.5) {
      const real = elToHub(r.elCredits);
      settle(genId, real.credits, "Ajuste para o custo real informado pela ElevenLabs");
      d.prepare("UPDATE generations SET credits = ? WHERE id = ?").run(real.credits, genId);
      usd = real.usd;
    }
    d.prepare("UPDATE generations SET status='completed', cost_usd=?, completed_at=datetime('now') WHERE id=?").run(usd, genId);
  } catch (e) {
    fail(genId, String(e instanceof Error ? e.message : e), true);
  }
  return d.prepare("SELECT * FROM generations WHERE id = ?").get(genId) as GenerationRow;
}

/** Arquivo de áudio de entrada: enviado agora (FormData) ou um asset do Hub (assetId). */
export async function audioInput(form: FormData): Promise<{ buffer: Buffer; name: string; type: string; durationSec: number }> {
  const file = form.get("file");
  const assetId = Number(form.get("assetId"));
  const declared = Number(form.get("durationSec"));
  let buffer: Buffer, name: string, type: string;
  if (file instanceof File) {
    if (file.size > 100 * 1024 * 1024) throw new HttpError(400, "Arquivo maior que 100 MB");
    if (!/^(audio|video)\//.test(file.type)) throw new HttpError(400, "Envie um arquivo de áudio ou vídeo");
    buffer = Buffer.from(await file.arrayBuffer()); name = file.name; type = file.type;
  } else if (assetId) {
    const a = getAsset(assetId);
    if (!a || (a.kind !== "audio" && a.kind !== "video")) throw new HttpError(400, "Selecione um áudio ou vídeo do Hub");
    if (a.url.startsWith("/api/media/")) buffer = fs.readFileSync(path.join(mediaDir(), path.basename(a.url)));
    else {
      const r = await fetch(a.url);
      if (!r.ok) throw new HttpError(400, "Não foi possível ler o arquivo de origem");
      buffer = Buffer.from(await r.arrayBuffer());
    }
    name = a.filename; type = a.kind === "video" ? "video/mp4" : "audio/mpeg";
  } else throw new HttpError(400, "Envie um arquivo de áudio");
  // duração: a informada pelo navegador; se faltar, estimativa pelo tamanho (~128 kbps)
  const bySize = buffer.length / 16000;
  const durationSec = Number.isFinite(declared) && declared > 0 ? declared : bySize;
  return { buffer, name, type, durationSec: Math.max(1, Math.round(durationSec)) };
}

export function scopeFrom(src: FormData | Record<string, unknown>) {
  const g = (k: string) => (src instanceof FormData ? src.get(k) : src[k]);
  return { projectId: Number(g("projectId")) || null, scenarioId: Number(g("scenarioId")) || null, sceneId: Number(g("sceneId")) || null };
}

export function num(v: unknown, min: number, max: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : undefined;
}

export function reply(gen: { id: number; status: string; error: string | null }) {
  const failed = gen.status === "failed";
  return Response.json({ generation: gen, assets: getAssets("a.generation_id = ?", [gen.id]), error: failed ? gen.error : undefined }, { status: failed ? 422 : 200 });
}
