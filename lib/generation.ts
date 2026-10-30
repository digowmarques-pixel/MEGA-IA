import path from "path";
import { getAsset, nextVersion, type AssetView } from "./assets";
import { HttpError, type SessionUser } from "./auth";
import { db, getSettingNumber } from "./db";
import { mediaDir } from "./media";
import { estimateCredits, getModel, type GenKind } from "./models";
import { higgsfield } from "./provider";
import { textToSpeech } from "./providers/elevenlabs";
import type { GenerateInput, MediaRef, Output } from "./providers/types";
import { reserve, resolveWallet, settle, usdPerCredit, type Wallet } from "./wallet";

export type GenerationRow = {
  id: number;
  user_id: number;
  project_id: number | null;
  scenario_id: number | null;
  scene_id: number | null;
  kind: GenKind;
  model: string;
  prompt: string | null;
  params: string | null;
  source_asset_id: number | null;
  provider: string;
  provider_job_ids: string | null;
  client_request_id: string | null;
  wallet_type: Wallet["type"] | null;
  wallet_id: number | null;
  status: "queued" | "processing" | "completed" | "failed";
  credits: number;
  estimated_credits: number | null;
  cost_usd: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type GenerateRequest = {
  kind: GenKind;
  model: string;
  prompt: string;
  aspectRatio?: string;
  count?: number;
  duration?: number;
  options?: Record<string, string>;
  flags?: Record<string, boolean>;
  shots?: { prompt: string; duration: number }[];
  projectId?: number | null;
  scenarioId?: number | null;
  sceneId?: number | null;
  /** assets do Hub usados como referência: [{assetId, role}] */
  references?: { assetId: number; role: string }[];
  /** asset de origem (upscale) */
  sourceAssetId?: number | null;
  /** de qual carteira sai o crédito (padrão: projeto com verba → cota do funcionário) */
  wallet?: "project" | "user" | "personal" | null;
  /** ElevenLabs */
  voiceId?: string;
  voiceSettings?: { stability?: number; similarity?: number; style?: number };
  clientRequestId?: string;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function resolveScope(req: Pick<GenerateRequest, "projectId" | "scenarioId" | "sceneId">) {
  const d = db();
  let projectId = req.projectId ?? null;
  let scenarioId = req.scenarioId ?? null;
  const sceneId = req.sceneId ?? null;
  if (sceneId) {
    const s = d.prepare("SELECT project_id, scenario_id FROM scenes WHERE id = ?").get(sceneId) as { project_id: number; scenario_id: number } | undefined;
    if (!s) throw new HttpError(400, "Cena não encontrada");
    projectId = s.project_id;
    scenarioId = s.scenario_id;
  } else if (scenarioId) {
    const s = d.prepare("SELECT project_id FROM scenarios WHERE id = ?").get(scenarioId) as { project_id: number } | undefined;
    if (!s) throw new HttpError(400, "Cenário não encontrado");
    projectId = s.project_id;
  }
  if (projectId && !d.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) throw new HttpError(400, "Projeto não encontrado");
  return { projectId, scenarioId, sceneId };
}

/** Garante que a referência tenha media_id no Higgsfield (faz upload sob demanda e guarda no asset). */
async function toMediaRef(asset: AssetView, role: string): Promise<MediaRef> {
  const provider = higgsfield();
  if (!asset.provider_ref && asset.url.startsWith("/api/media/") && provider.uploadLocal) {
    const file = path.join(mediaDir(), path.basename(asset.url));
    const ref = await provider.uploadLocal(file, asset.kind);
    db().prepare("UPDATE assets SET provider_ref = ? WHERE id = ?").run(ref, asset.id);
    return { role, providerRef: ref, url: asset.url };
  }
  return { role, providerRef: asset.provider_ref, url: asset.url };
}

/** No multi-shot a duração total é a soma dos planos. */
function shotsDuration(req: GenerateRequest) {
  const shots = req.shots?.filter((s) => s.prompt?.trim());
  return shots && shots.length > 1 ? shots.reduce((t, s) => t + Math.round(s.duration), 0) : undefined;
}

async function buildInput(req: GenerateRequest, source: AssetView | null): Promise<GenerateInput> {
  const medias: MediaRef[] = [];
  for (const r of req.references ?? []) {
    const a = getAsset(r.assetId);
    if (!a) throw new HttpError(400, `Referência #${r.assetId} não encontrada`);
    medias.push(await toMediaRef(a, r.role));
  }
  let src: GenerateInput["source"];
  if (source) {
    const m = await toMediaRef(source, "source");
    src = { providerRef: m.providerRef, url: source.url, width: source.width, height: source.height };
  }
  return {
    kind: req.kind,
    model: req.model,
    prompt: req.prompt ?? "",
    aspectRatio: req.aspectRatio,
    count: Math.min(Math.max(Math.round(req.count ?? 1), 1), getModel(req.model)?.maxCount ?? 1),
    duration: shotsDuration(req) ?? (req.duration ? Math.round(req.duration) : undefined),
    options: req.options,
    flags: req.flags,
    shots: req.shots?.filter((s) => s.prompt?.trim()),
    medias,
    source: src,
  };
}

/** ElevenLabs cobra em dólar por caractere; convertemos para "créditos equivalentes" para usar as mesmas carteiras. */
function elevenCredits(chars: number) {
  const usd = (chars / 1000) * getSettingNumber("elevenlabs_usd_per_1k_chars", 0);
  const rate = usdPerCredit();
  return { usd, credits: rate > 0 ? round(usd / rate) : 0 };
}

export async function estimate(req: GenerateRequest) {
  const model = getModel(req.model);
  if (!model) throw new HttpError(400, "Modelo inválido");
  if (model.provider === "elevenlabs") {
    const e = elevenCredits(req.prompt?.length ?? 0);
    return { credits: e.credits, usd: e.usd, source: "elevenlabs" as const };
  }
  const fallback = estimateCredits(model, { count: Math.min(req.count ?? 1, model.maxCount ?? 1), duration: shotsDuration(req) ?? req.duration, options: req.options, flags: req.flags });
  let real: number | null = null;
  try {
    const source = req.sourceAssetId ? getAsset(req.sourceAssetId) : null;
    real = await higgsfield().estimate(await buildInput(req, source));
  } catch {
    real = null;
  }
  const credits = real ?? fallback;
  return { credits, usd: credits * usdPerCredit(), source: real !== null ? ("higgsfield" as const) : ("tabela" as const) };
}

export function insertAndReserve(user: SessionUser, wallet: Wallet, credits: number, row: Record<string, unknown>) {
  const d = db();
  // INSERT + débito na MESMA transação: sem saldo, nada é gravado nem enviado.
  return d.transaction(() => {
    const info = d.prepare(
      `INSERT INTO generations (user_id, project_id, scenario_id, scene_id, kind, model, prompt, params, source_asset_id, provider, client_request_id, wallet_type, wallet_id, status, credits, estimated_credits, cost_usd)
       VALUES (@user_id, @project_id, @scenario_id, @scene_id, @kind, @model, @prompt, @params, @source_asset_id, @provider, @client_request_id, @wallet_type, @wallet_id, 'processing', @credits, @credits, @cost_usd)`
    ).run({ ...row, wallet_type: wallet.type, wallet_id: wallet.id, credits, cost_usd: credits * usdPerCredit() });
    const id = Number(info.lastInsertRowid);
    reserve(wallet, credits, id, user.id);
    return id;
  }).immediate();
}

export function fail(genId: number, error: string, refund: boolean) {
  if (refund) settle(genId, 0, "Estorno: " + error.slice(0, 120));
  db().prepare(`UPDATE generations SET status='failed', error=?, ${refund ? "credits=0, cost_usd=0," : ""} completed_at=datetime('now') WHERE id=?`).run(error, genId);
}

export async function createGeneration(user: SessionUser, req: GenerateRequest): Promise<GenerationRow> {
  const d = db();
  const model = getModel(req.model);
  if (!model) throw new HttpError(400, "Modelo inválido");
  if (model.kind !== req.kind) throw new HttpError(400, "Modelo não corresponde ao tipo de geração");
  const isUpscale = req.kind === "upscale_image" || req.kind === "upscale_video";
  if (!isUpscale && !req.prompt?.trim()) throw new HttpError(400, "Escreva um prompt");
  const totalDuration = shotsDuration(req) ?? req.duration;
  if (model.durations && totalDuration && (totalDuration < model.durations.min || totalDuration > model.durations.max)) {
    throw new HttpError(400, `Duração total deve ficar entre ${model.durations.min}s e ${model.durations.max}s para ${model.name}`);
  }
  if (req.shots?.some((s) => s.prompt?.trim() && (!(s.duration >= 1) || s.duration > 15))) throw new HttpError(400, "Cada plano precisa de duração entre 1 e 15 segundos");

  // Idempotência: o mesmo clique nunca gera (nem cobra) duas vezes.
  if (req.clientRequestId) {
    const existing = d.prepare("SELECT * FROM generations WHERE client_request_id = ?").get(req.clientRequestId) as GenerationRow | undefined;
    if (existing) {
      if (existing.user_id !== user.id) throw new HttpError(409, "Requisição duplicada");
      return existing;
    }
  }

  const scope = resolveScope(req);
  const source = req.sourceAssetId ? getAsset(req.sourceAssetId) : null;
  if (isUpscale) {
    const want = req.kind === "upscale_image" ? "image" : "video";
    if (!source || source.kind !== want) throw new HttpError(400, `Selecione ${want === "image" ? "uma imagem" : "um vídeo"} de origem para o upscale`);
  }
  const wallet = resolveWallet(user.id, scope.projectId, req.wallet);
  const baseRow = {
    user_id: user.id, project_id: scope.projectId, scenario_id: scope.scenarioId, scene_id: scope.sceneId,
    kind: req.kind, model: req.model, prompt: req.prompt || null, source_asset_id: req.sourceAssetId ?? null,
    client_request_id: req.clientRequestId ?? null,
  };

  // ---------- ElevenLabs ----------
  if (model.provider === "elevenlabs") {
    if (!req.voiceId) throw new HttpError(400, "Escolha uma voz");
    const e = elevenCredits(req.prompt.length);
    const genId = insertAndReserve(user, wallet, e.credits, {
      ...baseRow, provider: "elevenlabs", params: JSON.stringify({ voiceId: req.voiceId, characters: req.prompt.length, ...req.voiceSettings }),
    });
    try {
      const r = await textToSpeech({ text: req.prompt, voiceId: req.voiceId, modelId: req.model, settings: req.voiceSettings });
      saveOutputs(genId, [{ kind: "audio", url: r.url }]);
      d.prepare("UPDATE generations SET status='completed', cost_usd=?, completed_at=datetime('now') WHERE id=?").run(e.usd, genId);
    } catch (err) {
      fail(genId, String(err instanceof Error ? err.message : err), true);
    }
    return d.prepare("SELECT * FROM generations WHERE id = ?").get(genId) as GenerationRow;
  }

  // ---------- Higgsfield ----------
  const provider = higgsfield();
  const input = await buildInput(req, source);
  const est = (await provider.estimate(input)) ?? estimateCredits(model, input);

  const genId = insertAndReserve(user, wallet, est, {
    ...baseRow, provider: provider.name,
    params: JSON.stringify({ aspectRatio: req.aspectRatio, count: input.count, duration: input.duration, options: req.options, flags: req.flags, shots: input.shots, references: req.references }),
  });

  try {
    const res = await provider.submit(input);
    d.prepare("UPDATE generations SET provider_job_ids = ? WHERE id = ?").run(JSON.stringify(res.jobIds), genId);
    if (res.credits > 0 && Math.abs(res.credits - est) >= 0.005) {
      // custo final informado pelo Higgsfield difere da estimativa → ajusta a carteira
      settle(genId, res.credits, "Ajuste para o custo real do Higgsfield");
      d.prepare("UPDATE generations SET credits = ?, cost_usd = ? WHERE id = ?").run(res.credits, res.credits * usdPerCredit(), genId);
    }
    if (res.outputs?.length) {
      saveOutputs(genId, res.outputs);
      d.prepare("UPDATE generations SET status='completed', completed_at=datetime('now') WHERE id=?").run(genId);
    }
  } catch (err) {
    // Falha no envio = nenhum job criado no Higgsfield = estorno integral na carteira.
    fail(genId, String(err instanceof Error ? err.message : err), true);
  }
  return d.prepare("SELECT * FROM generations WHERE id = ?").get(genId) as GenerationRow;
}

export function saveOutputs(genId: number, outputs: Output[]) {
  const d = db();
  const g = d.prepare("SELECT * FROM generations WHERE id = ?").get(genId) as GenerationRow;
  d.transaction(() => {
    // Evita duplicar assets se dois polls concluírem ao mesmo tempo.
    const already = d.prepare("SELECT COUNT(*) c FROM assets WHERE generation_id = ?").get(genId) as { c: number };
    if (already.c > 0) return;
    for (const o of outputs) {
      const version = nextVersion({ projectId: g.project_id, scenarioId: g.scenario_id, sceneId: g.scene_id, kind: o.kind, source: "generated" });
      d.prepare(
        `INSERT INTO assets (generation_id, user_id, project_id, scenario_id, scene_id, parent_asset_id, kind, source, prompt, model, url, thumb_url, provider_ref, width, height, duration, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(genId, g.user_id, g.project_id, g.scenario_id, g.scene_id, g.source_asset_id, o.kind, g.prompt, g.model, o.url, o.thumbUrl ?? null, o.providerRef ?? null, o.width ?? null, o.height ?? null, o.duration ?? null, version);
    }
  })();
}

const polling = new Set<number>();

/** Atualiza o status de gerações em andamento consultando o provedor. */
export async function refreshGeneration(id: number): Promise<GenerationRow | null> {
  const d = db();
  const g = d.prepare("SELECT * FROM generations WHERE id = ?").get(id) as GenerationRow | undefined;
  if (!g || g.status !== "processing" || polling.has(id)) return g ?? null;
  const jobIds: string[] = g.provider_job_ids ? JSON.parse(g.provider_job_ids) : [];
  if (!jobIds.length) return g;
  polling.add(id);
  try {
    const r = await higgsfield().poll(jobIds, g.kind);
    if (r.status === "completed") {
      saveOutputs(id, r.outputs);
      d.prepare("UPDATE generations SET status='completed', completed_at=datetime('now') WHERE id=? AND status='processing'").run(id);
    } else if (r.status === "failed") {
      // O Higgsfield devolve os créditos de jobs que falham; estornamos também na carteira interna.
      const cur = d.prepare("SELECT status FROM generations WHERE id = ?").get(id) as { status: string };
      if (cur.status === "processing") fail(id, r.error ?? "Falhou no Higgsfield", true);
    }
  } catch (e) {
    console.error("poll", id, e);
  } finally {
    polling.delete(id);
  }
  return d.prepare("SELECT * FROM generations WHERE id = ?").get(id) as GenerationRow;
}
