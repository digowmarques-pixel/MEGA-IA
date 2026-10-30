import { estimateCredits, getModel } from "../models";
import type { GenerationProvider, GenerateInput, Output } from "./types";

function dims(ar = "16:9", base = 1280) {
  const [w, h] = ar.split(":").map(Number);
  if (!w || !h) return { width: base, height: Math.round((base * 9) / 16) };
  return w >= h ? { width: base, height: Math.round((base * h) / w) } : { width: Math.round((base * w) / h), height: base };
}

/** Simula gerações sem gastar créditos — útil para desenvolver o fluxo. */
export const mockProvider: GenerationProvider = {
  name: "mock",
  async estimate() {
    return null; // usa a tabela de preços do catálogo (rotulada como "estimado" na tela)
  },
  async submit(input: GenerateInput) {
    const m = getModel(input.model);
    const credits = m ? estimateCredits(m, input) : 1;
    const count = input.count ?? 1;
    const outputs: Output[] = [];
    const outKind = input.kind === "video" || input.kind === "upscale_video" ? "video" : input.kind === "audio" ? "audio" : "image";
    for (let i = 0; i < count; i++) {
      const seed = Math.floor(Math.random() * 1e9);
      const { width, height } = dims(input.aspectRatio);
      const label = encodeURIComponent((input.label || input.prompt || m?.name || "").slice(0, 80));
      if (outKind === "audio") {
        outputs.push({ kind: "audio", url: `/api/placeholder/audio?seed=${seed}`, duration: 3 });
      } else {
        const url = `/api/placeholder?seed=${seed}&w=${width}&h=${height}&kind=${outKind}&model=${encodeURIComponent(input.model)}&label=${label}`;
        outputs.push({ kind: outKind, url, thumbUrl: url, width, height, duration: outKind === "video" ? input.duration ?? 5 : undefined, providerRef: `mock-${seed}` });
      }
    }
    return { jobIds: [], credits, outputs };
  },
  async poll() {
    return { status: "completed", outputs: [] };
  },
  async balance() {
    return { credits: null, plan: "Modo simulação" };
  },
};
