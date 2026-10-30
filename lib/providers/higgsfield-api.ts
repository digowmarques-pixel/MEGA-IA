import type { GenKind } from "../models";
import type { GenerationProvider, Output } from "./types";

// Integração REST com o Higgsfield Cloud (chaves em cloud.higgsfield.ai).
// Fluxo assíncrono: POST {base}/{model_path} -> request_id; GET {base}/requests/{id}/status.
// Os caminhos de modelo são específicos da conta: ajuste MODEL_PATHS conforme a documentação
// em docs.higgsfield.ai (não foi possível consultá-la daqui; o modo MCP é o recomendado).

const MODEL_PATHS: Record<string, string> = {
  soul_2: "higgsfield-ai/soul/v2/standard",
  soul_cinematic: "higgsfield-ai/soul/cinema",
};

function base() {
  return (process.env.HIGGSFIELD_API_BASE || "https://platform.higgsfield.ai").replace(/\/$/, "");
}

function headers() {
  const id = process.env.HIGGSFIELD_API_KEY_ID;
  const secret = process.env.HIGGSFIELD_API_KEY_SECRET;
  if (!id || !secret) throw new Error("HIGGSFIELD_API_KEY_ID / HIGGSFIELD_API_KEY_SECRET não configurados");
  return { Authorization: `Key ${id}:${secret}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function req(path: string, init?: RequestInit) {
  const r = await fetch(`${base()}/${path.replace(/^\//, "")}`, { ...init, headers: { ...headers(), ...(init?.headers || {}) } });
  const text = await r.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!r.ok) throw new Error(`Higgsfield API ${r.status}: ${text.slice(0, 300)}`);
  return json as Record<string, unknown>;
}

function collectUrls(v: unknown, kind: GenKind): Output[] {
  const out: Output[] = [];
  const k: Output["kind"] = kind === "video" || kind === "upscale_video" ? "video" : kind === "audio" ? "audio" : "image";
  const visit = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(visit);
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.url === "string" && /^https?:/.test(o.url)) out.push({ kind: k, url: o.url });
      Object.values(o).forEach(visit);
    }
  };
  visit(v);
  return out;
}

export const higgsfieldApiProvider: GenerationProvider = {
  name: "higgsfield-api",
  async estimate() {
    return null;
  },
  async submit(input) {
    const path = MODEL_PATHS[input.model] || input.model;
    const body: Record<string, unknown> = { prompt: input.prompt, aspect_ratio: input.aspectRatio, ...(input.options || {}) };
    if (input.duration) body.duration = input.duration;
    const img = input.medias?.find((m) => m.url && /^https?:/.test(m.url));
    if (img) body.image_url = img.url;
    const ids: string[] = [];
    for (let i = 0; i < (input.count ?? 1); i++) {
      const r = await req(path, { method: "POST", body: JSON.stringify(body) });
      const id = (r.request_id || r.id) as string | undefined;
      if (!id) throw new Error("Resposta sem request_id");
      ids.push(id);
    }
    return { jobIds: ids, credits: 0 };
  },
  async poll(jobIds, kind) {
    const outputs: Output[] = [];
    for (const id of jobIds) {
      const r = await req(`requests/${id}/status`);
      const status = String(r.status || "").toLowerCase();
      if (["failed", "nsfw", "canceled"].includes(status)) return { status: "failed", outputs: [], error: `Status: ${status}` };
      if (status !== "completed") return { status: "processing", outputs: [] };
      outputs.push(...collectUrls(r, kind).map((o) => ({ ...o, providerRef: id })));
    }
    return { status: "completed", outputs };
  },
  async balance() {
    return { credits: null, plan: "API Higgsfield Cloud" };
  },
};
