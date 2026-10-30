import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "fs";
import path from "path";
import { getModel, type GenKind } from "../models";
import { mimeFor } from "../media";
import type { GenerationProvider, GenerateInput, Output, PollResult } from "./types";

// Integração com o MCP oficial do Higgsfield usando a conta da empresa.
// Ferramentas usadas: generate_image, generate_video, generate_audio, upscale_image,
// upscale_video, jobs_wait, balance, media_import_url. O mesmo `params` aceita `get_cost: true`
// para consultar o custo real em créditos antes de gerar.

let clientPromise: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const url = process.env.HIGGSFIELD_MCP_URL;
      if (!url) throw new Error("HIGGSFIELD_MCP_URL não configurado");
      const token = process.env.HIGGSFIELD_MCP_TOKEN;
      const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      });
      const client = new Client({ name: "ai-hub", version: "0.1.0" });
      await client.connect(transport);
      return client;
    })().catch((e) => {
      clientPromise = null;
      throw e;
    });
  }
  return clientPromise;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const client = await getClient();
  const res = (await client.callTool({ name, arguments: args })) as {
    content?: { type: string; text?: string }[];
    structuredContent?: unknown;
    isError?: boolean;
  };
  const payloads: unknown[] = [];
  if (res.structuredContent) payloads.push(res.structuredContent);
  for (const c of res.content ?? []) {
    if (c.type === "text" && c.text) {
      try {
        payloads.push(JSON.parse(c.text));
      } catch {
        payloads.push(c.text);
      }
    }
  }
  if (res.isError) {
    const msg = payloads.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
    throw new Error(`Higgsfield (${name}): ${msg.slice(0, 500)}`);
  }
  return payloads.length === 1 ? payloads[0] : payloads;
}

// ---- helpers de leitura tolerante (o formato de resposta pode evoluir) ----
type AnyObj = Record<string, unknown>;
function walk(v: unknown, visit: (k: string, val: unknown, parent: AnyObj) => void) {
  if (Array.isArray(v)) v.forEach((x) => walk(x, visit));
  else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as AnyObj)) {
      visit(k, val, v as AnyObj);
      walk(val, visit);
    }
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function findJobIds(v: unknown): string[] {
  const ids = new Set<string>();
  walk(v, (k, val) => {
    if ((k === "job_id" || k === "jobId") && typeof val === "string" && UUID.test(val)) ids.add(val);
    if ((k === "job_ids" || k === "jobIds") && Array.isArray(val)) val.forEach((x) => typeof x === "string" && ids.add(x));
  });
  return [...ids];
}

/** Prefere `credits_exact` (cobrança real é fracionada, ex.: 0.12) ao valor arredondado. */
function findCredits(v: unknown): number | null {
  let exact: number | null = null;
  let rounded: number | null = null;
  walk(v, (k, val) => {
    if (typeof val !== "number") return;
    if (k === "credits_exact" && exact === null) exact = val;
    if (["credits", "cost", "total_cost", "credits_cost"].includes(k) && rounded === null) rounded = val;
  });
  return exact ?? rounded;
}

function findOutputs(v: unknown, kind: GenKind): Output[] {
  const outs: Output[] = [];
  const seen = new Set<string>();
  const outKind: Output["kind"] = kind === "video" || kind === "upscale_video" ? "video" : kind === "audio" ? "audio" : "image";
  walk(v, (k, val, parent) => {
    if (typeof val !== "string" || !/^https?:\/\//.test(val)) return;
    if (!["url", "result_url", "output_url", "video_url", "image_url", "audio_url", "raw_url"].includes(k)) return;
    if (seen.has(val)) return;
    seen.add(val);
    const ref = (parent.job_id || parent.id) as string | undefined;
    outs.push({
      kind: outKind,
      url: val,
      thumbUrl: (parent.thumbnail_url || parent.thumb_url || parent.preview_url) as string | undefined,
      width: typeof parent.width === "number" ? parent.width : undefined,
      height: typeof parent.height === "number" ? parent.height : undefined,
      providerRef: typeof ref === "string" ? ref : undefined,
    });
  });
  return outs;
}

const TOOL_BY_KIND: Record<GenKind, string> = {
  image: "generate_image",
  avatar: "generate_image",
  video: "generate_video",
  audio: "generate_audio",
  upscale_image: "upscale_image",
  upscale_video: "upscale_video",
};

async function resolveMediaValue(ref: { providerRef?: string | null; url?: string | null }): Promise<string | null> {
  if (ref.providerRef && UUID.test(ref.providerRef)) return ref.providerRef;
  if (ref.url && /^https?:\/\//.test(ref.url)) {
    const r = await callTool("media_import_url", { url: ref.url });
    const id = findJobIds(r)[0];
    if (id) return id;
    let mid: string | null = null;
    walk(r, (k, val) => {
      if (!mid && (k === "media_id" || k === "id") && typeof val === "string" && UUID.test(val)) mid = val;
    });
    return mid;
  }
  return null;
}

async function buildArgs(input: GenerateInput, getCost: boolean): Promise<Record<string, unknown>> {
  if (input.kind === "upscale_image") {
    const imageId = input.source ? await resolveMediaValue(input.source) : null;
    if (!imageId) throw new Error("Imagem de origem sem referência no Higgsfield (gere-a pelo Hub ou use uma URL pública).");
    const params: AnyObj = { image_id: imageId, width: input.source?.width || 1920, height: input.source?.height || 1080, resolution: input.options?.resolution || "4k" };
    if (getCost) params.get_cost = true;
    return { params };
  }
  if (input.kind === "upscale_video") {
    const videoId = input.source ? await resolveMediaValue(input.source) : null;
    if (!videoId) throw new Error("Vídeo de origem sem referência no Higgsfield.");
    return { params: { provider: "topaz", video_id: videoId, resolution: input.options?.resolution || "2160p", aspect_ratio: "auto" } };
  }

  const def = getModel(input.model);
  const params: AnyObj = { model: input.model, prompt: input.prompt, ...(input.options || {}), ...(input.flags || {}) };
  if (params.background === "auto") delete params.background; // nullable: omitir = padrão do modelo
  if (input.aspectRatio && input.kind !== "audio") params.aspect_ratio = input.aspectRatio;
  if (input.count && input.count > 1 && input.kind !== "audio") params[def?.countParam ?? "count"] = input.count;
  if (input.duration && input.kind !== "image" && input.kind !== "avatar") params.duration = input.duration;
  if (def?.multiShot && input.shots && input.shots.length > 1) {
    params.multi_shots = true;
    params.multi_prompt = input.shots.map((s) => ({ prompt: s.prompt, duration: Math.round(s.duration) }));
    params.duration = input.shots.reduce((t, s) => t + Math.round(s.duration), 0);
  }
  if (input.medias?.length) {
    const medias = [];
    for (const m of input.medias) {
      const value = await resolveMediaValue(m);
      if (value) medias.push({ role: m.role, value });
    }
    if (medias.length) {
      params.medias = medias;
      // modelos que exigem um modo específico quando recebem referências
      if (def?.referenceMode && !params[def.referenceMode.param]) {
        const onlyFrames = medias.every((m) => m.role === "start_image" || m.role === "end_image");
        params[def.referenceMode.param] = input.model === "kling4_0" && onlyFrames ? "image-to-video" : def.referenceMode.value;
      }
    }
  }
  if (getCost) params.get_cost = true;
  params.use_unlim = false; // sempre debita créditos (evita prompts interativos do servidor)
  return { params, context: "Geração via AI Hub interno da produtora" };
}

export const higgsfieldMcpProvider: GenerationProvider = {
  name: "higgsfield-mcp",

  async estimate(input) {
    if (input.kind === "upscale_video") return null; // sem preflight para upscale de vídeo
    try {
      const r = await callTool(TOOL_BY_KIND[input.kind], await buildArgs(input, true));
      return findCredits(r);
    } catch {
      return null;
    }
  },

  async submit(input) {
    const r = await callTool(TOOL_BY_KIND[input.kind], await buildArgs(input, false));
    const jobIds = findJobIds(r);
    const outputs = findOutputs(r, input.kind);
    if (!jobIds.length && !outputs.length) throw new Error("Higgsfield não retornou job_id: " + JSON.stringify(r).slice(0, 300));
    return { jobIds, credits: findCredits(r) ?? 0, outputs: jobIds.length ? undefined : outputs };
  },

  async poll(jobIds, kind): Promise<PollResult> {
    const r = await callTool("jobs_wait", { jobs: jobIds.map((job_id, index) => ({ index, job_id })), timeout_seconds: 10 });
    const statuses: string[] = [];
    walk(r, (k, val) => {
      if (k === "status" && typeof val === "string") statuses.push(val.toLowerCase());
    });
    const failed = statuses.some((s) => ["failed", "error", "nsfw", "canceled", "cancelled"].includes(s));
    const allTerminal = (() => {
      let t: boolean | null = null;
      walk(r, (k, val) => {
        if (k === "all_terminal" && typeof val === "boolean") t = val;
      });
      return t ?? (statuses.length > 0 && statuses.every((s) => ["completed", "succeeded", "success", "done", "failed", "error", "nsfw"].includes(s)));
    })();
    const outputs = findOutputs(r, kind).map((o, i) => ({ ...o, providerRef: o.providerRef ?? jobIds[i] }));
    if (!allTerminal) return { status: "processing", outputs: [] };
    if (failed && !outputs.length) return { status: "failed", outputs: [], error: "Geração falhou no Higgsfield" };
    return { status: "completed", outputs };
  },

  async uploadLocal(filePath, kind) {
    const filename = path.basename(filePath);
    const contentType = mimeFor(filename);
    const r = await callTool("media_upload", { filename, content_type: contentType });
    let uploadUrl: string | null = null;
    let mediaId: string | null = null;
    walk(r, (k, val) => {
      if (!uploadUrl && k === "upload_url" && typeof val === "string") uploadUrl = val;
      if (!mediaId && (k === "media_id" || k === "id") && typeof val === "string" && UUID.test(val)) mediaId = val;
    });
    if (!uploadUrl || !mediaId) throw new Error("media_upload não retornou upload_url/media_id");
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: fs.readFileSync(filePath) });
    if (!put.ok) throw new Error(`Falha no upload para o Higgsfield (${put.status})`);
    await callTool("media_confirm", { media_id: mediaId, type: kind });
    return mediaId;
  },

  async balance() {
    const r = await callTool("balance", {});
    let credits: number | null = null;
    let plan: string | undefined;
    walk(r, (k, val) => {
      if (credits === null && ["credits", "balance", "available_credits", "total_credits"].includes(k) && typeof val === "number") credits = val;
      if (!plan && ["plan", "plan_name", "subscription"].includes(k) && typeof val === "string") plan = val;
    });
    return { credits, plan, raw: r };
  },
};

export type HiggsTransaction = { display_name: string; credits: number; action: string; created_at: string };

/** Extrato real da conta (spend / refund / grant). */
export async function higgsfieldTransactions(size = 50): Promise<HiggsTransaction[]> {
  const r = (await callTool("transactions", { size: Math.min(Math.max(size, 1), 100) })) as { items?: HiggsTransaction[] };
  return r.items ?? [];
}
