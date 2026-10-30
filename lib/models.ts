// Catálogo curado de modelos (IDs e parâmetros = catálogo real do Higgsfield via MCP `models_explore`).
// Preços: medidos com `get_cost` na conta da empresa em 30/10/2026. No modo mcp o custo exato é
// sempre reconsultado antes de gerar; a tabela abaixo é o fallback e a base do modo simulação.

export type GenKind = "image" | "video" | "audio" | "upscale_image" | "upscale_video" | "avatar";

export type OptionDef = { name: string; label: string; values: string[]; default: string; labels?: Record<string, string>; hint?: string };
export type FlagDef = { name: string; label: string; default: boolean; hint?: string };
export type PriceInput = { options: Record<string, string>; flags: Record<string, boolean>; duration: number };

export type ModelDef = {
  id: string;
  name: string;
  kind: GenKind;
  provider: "higgsfield" | "elevenlabs";
  tag?: string;
  description: string;
  aspectRatios?: string[];
  durations?: { min: number; max: number; default: number };
  /** papéis aceitos para imagem de referência / frame inicial */
  mediaRoles?: string[];
  maxRefs?: number;
  /** créditos por unidade (imagem, ou por segundo de vídeo se perSecond) na configuração padrão */
  credits: number;
  perSecond?: boolean;
  /** preço por unidade conforme opções (quando o modelo varia muito) */
  price?: (p: PriceInput) => number;
  options?: OptionDef[];
  flags?: FlagDef[];
  /** aceita variações (1–4 resultados do mesmo pedido) */
  maxCount?: number;
  /** nome do parâmetro de variações quando não é `count` (ex.: MiniMax usa batch_size) */
  countParam?: string;
  /** suporta roteiro multi-shot (lista de planos com prompt e duração) */
  multiShot?: boolean;
  /** modelo exige `mode` específico quando há referências */
  referenceMode?: { param: string; value: string; textValue?: string };
};

const AR_IMG = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "3:2", "2:3", "4:5", "5:4"];
const AR_VID = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const RES_IMG: OptionDef = { name: "resolution", label: "Resolução", values: ["1k", "2k", "4k"], default: "2k" };

export const MODELS: ModelDef[] = [
  // ---------- IMAGEM ----------
  {
    id: "gpt_image_2_5", name: "GPT Image 2.5", kind: "image", provider: "higgsfield", tag: "Padrão",
    description: "Fotorrealismo, tipografia e edição com referência. Qualidade e resolução mudam muito o preço.",
    aspectRatios: ["auto", ...AR_IMG, "27:16", "16:27", "9:8", "8:9"], mediaRoles: ["image_references"], maxRefs: 8, credits: 2.75, maxCount: 4,
    price: ({ options: o }) => {
      // pontos medidos: low/1k 0,25 · high/2k 2,75 · high/4k 4,25 · max/4k 15
      const q: Record<string, number> = { low: 0.1, medium: 0.4, high: 1, xhigh: 1.8, max: 3.5 };
      const r: Record<string, number> = { "1k": 2.5, "2k": 2.75, "4k": 4.25 };
      return Math.round((r[o.resolution] ?? 2.75) * (q[o.quality] ?? 1) * 100) / 100;
    },
    options: [
      { name: "quality", label: "Qualidade", values: ["low", "medium", "high", "xhigh", "max"], default: "high", labels: { low: "rascunho", medium: "média", high: "alta", xhigh: "muito alta", max: "máxima" } },
      RES_IMG,
      { name: "variant", label: "Variante", values: ["flare", "sunburst"], default: "flare", hint: "Duas variações de estilo do modelo" },
      { name: "background", label: "Fundo", values: ["auto", "opaque", "transparent"], default: "auto", labels: { auto: "automático", opaque: "sólido", transparent: "transparente (PNG)" } },
    ],
  },
  {
    id: "gpt_image_2", name: "GPT Image 2", kind: "image", provider: "higgsfield",
    description: "Geração anterior do GPT Image, 1 imagem de referência.",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "3:2", "2:3"], mediaRoles: ["image"], maxRefs: 1, credits: 6.5, maxCount: 4,
    options: [{ name: "quality", label: "Qualidade", values: ["low", "medium", "high"], default: "high" }, RES_IMG],
  },
  {
    id: "nano_banana_pro", name: "Nano Banana Pro", kind: "image", provider: "higgsfield", tag: "Consistência",
    description: "Mantém personagem e cenário entre frames usando várias referências.",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "3:2", "2:3", "4:5", "5:4"], mediaRoles: ["image_references"], maxRefs: 8, credits: 2, maxCount: 4,
    options: [RES_IMG],
  },
  {
    id: "nano_banana_2", name: "Nano Banana 2", kind: "image", provider: "higgsfield",
    description: "Edição e composição com referências; proporção automática.",
    aspectRatios: ["auto", ...AR_IMG], mediaRoles: ["image_references"], maxRefs: 8, credits: 2, maxCount: 4,
    options: [RES_IMG],
  },
  {
    id: "nano_banana_2_1", name: "Nano Banana 2.1", kind: "image", provider: "higgsfield", tag: "Novo",
    description: "Raciocínio ajustável, formatos panorâmicos (até 8:1) e seed para repetir resultados.",
    aspectRatios: ["auto", ...AR_IMG, "4:1", "1:4", "8:1", "1:8"], mediaRoles: ["image_references"], maxRefs: 8, credits: 2, maxCount: 4,
    options: [RES_IMG, { name: "thinking_level", label: "Raciocínio", values: ["minimal", "medium", "high"], default: "medium", labels: { minimal: "mínimo", medium: "médio", high: "alto" }, hint: "Mais raciocínio = segue melhor prompts complexos" }],
  },
  {
    id: "cinematic_studio_2_5", name: "Cinema Studio Image 2.5", kind: "image", provider: "higgsfield", tag: "Cinema",
    description: "Frames com linguagem de cinema: lentes, luz e grading.",
    aspectRatios: AR_IMG, mediaRoles: ["image"], maxRefs: 1, credits: 2, maxCount: 4,
    options: [{ ...RES_IMG, default: "1k" }],
  },
  { id: "soul_cinematic", name: "Soul Cinema", kind: "image", provider: "higgsfield", description: "Estética cinematográfica Soul, pele e textura naturais.", aspectRatios: [...AR_IMG.slice(0, 8)], credits: 0.12, maxCount: 4 },
  { id: "soul_2", name: "Higgsfield Soul 2.0", kind: "image", provider: "higgsfield", description: "Retratos, moda, editorial e UGC.", aspectRatios: AR_IMG.slice(0, 8), mediaRoles: ["image"], maxRefs: 1, credits: 0.12, maxCount: 4,
    options: [{ name: "quality", label: "Qualidade", values: ["1.5k", "2k"], default: "2k" }] },
  { id: "soul_location", name: "Soul Location", kind: "image", provider: "higgsfield", description: "Plates de cenário / locação sem personagens.", aspectRatios: AR_IMG.slice(0, 8), credits: 0.12, maxCount: 4 },
  { id: "seedream_v5_pro", name: "Seedream 5.0 Pro", kind: "image", provider: "higgsfield", description: "Alta fidelidade e prompt-following.", aspectRatios: AR_IMG.slice(0, 8), credits: 2.5, maxCount: 4 },
  { id: "flux_3_image", name: "FLUX 3 Image", kind: "image", provider: "higgsfield", description: "Detalhe fino e composição precisa.", aspectRatios: AR_IMG, credits: 2, maxCount: 4 },

  // ---------- VÍDEO ----------
  {
    id: "seedance_2_5", name: "Seedance 2.5", kind: "video", provider: "higgsfield", tag: "Padrão",
    description: "Vídeo geral com áudio, até 30s, multi-referência. Use o rascunho 480p para testar barato.",
    aspectRatios: ["auto", ...AR_VID], durations: { min: 4, max: 30, default: 5 }, mediaRoles: ["start_image", "end_image", "image_references", "video_references"], maxRefs: 6,
    credits: 7, perSecond: true, maxCount: 4, referenceMode: { param: "mode", value: "omni_reference", textValue: "t2v" },
    price: ({ options: o, flags: f }) => (f.draft ? 3 : ({ "480p": 3, "720p": 7, "1080p": 16 } as Record<string, number>)[o.resolution] ?? 7),
    options: [{ name: "resolution", label: "Resolução", values: ["480p", "720p", "1080p"], default: "720p" }, { name: "bitrate_mode", label: "Bitrate", values: ["standard", "high"], default: "standard", labels: { standard: "padrão", high: "alto" } }],
    flags: [
      { name: "generate_audio", label: "Gerar áudio", default: true },
      { name: "draft", label: "Rascunho 480p (finalizar depois)", default: false, hint: "Custa ~57% menos. Aprovou o take? Finalize em 1080p em até 7 dias." },
    ],
  },
  {
    id: "cinematic_studio_video_4_0", name: "Cinema Studio 4.0", kind: "video", provider: "higgsfield", tag: "Cinema",
    description: "Direção automática de câmera, luz, ritmo, gênero e época.",
    aspectRatios: ["auto", ...AR_VID], durations: { min: 4, max: 30, default: 5 }, mediaRoles: ["start_image", "end_image", "image_references", "video_references"], maxRefs: 6,
    credits: 7, perSecond: true, maxCount: 4, referenceMode: { param: "mode", value: "omni_reference", textValue: "t2v" },
    options: [{ name: "resolution", label: "Resolução", values: ["480p", "720p", "1080p"], default: "720p" }, { name: "bitrate_mode", label: "Bitrate", values: ["standard", "high"], default: "standard", labels: { standard: "padrão", high: "alto" } }],
    flags: [{ name: "generate_audio", label: "Gerar áudio", default: true }],
  },
  {
    id: "kling3_0", name: "Kling 3.0", kind: "video", provider: "higgsfield",
    description: "Frames inicial e final, áudio opcional, até 4K.",
    aspectRatios: ["16:9", "9:16", "1:1"], durations: { min: 3, max: 15, default: 5 }, mediaRoles: ["start_image", "end_image"], maxRefs: 2,
    credits: 1.5, perSecond: true, maxCount: 4,
    price: ({ options: o }) => (o.mode === "4k" ? 4 : o.mode === "pro" ? (o.sound === "on" ? 2 : 1.5) : o.sound === "on" ? 1.5 : 1),
    options: [{ name: "mode", label: "Qualidade", values: ["std", "pro", "4k"], default: "pro", labels: { std: "standard", pro: "pro", "4k": "4K" } }, { name: "sound", label: "Som", values: ["on", "off"], default: "off", labels: { on: "com som", off: "sem som" } }],
  },
  {
    id: "kling_o3_image_reference", name: "Kling 3.0 Omni · Multi-shot", kind: "video", provider: "higgsfield", tag: "Multi-shot",
    description: "Até 7 referências e roteiro de vários planos num único vídeo (cada plano com prompt e duração).",
    aspectRatios: ["16:9", "9:16", "1:1"], durations: { min: 3, max: 15, default: 10 }, mediaRoles: ["image_references"], maxRefs: 7,
    credits: 1.5, perSecond: true, maxCount: 4, multiShot: true,
    options: [{ name: "mode", label: "Qualidade", values: ["std", "pro", "4k"], default: "pro", labels: { std: "standard", pro: "pro", "4k": "4K" } }, { name: "sound", label: "Som", values: ["on", "off"], default: "off", labels: { on: "com som", off: "sem som" } }],
  },
  {
    id: "kling_o3_flf", name: "Kling 3.0 Omni · Frames", kind: "video", provider: "higgsfield",
    description: "Frame inicial e final com roteiro multi-shot opcional.",
    aspectRatios: ["16:9", "9:16", "1:1"], durations: { min: 3, max: 15, default: 5 }, mediaRoles: ["start_image", "end_image"], maxRefs: 2,
    credits: 1.5, perSecond: true, maxCount: 4, multiShot: true,
    options: [{ name: "mode", label: "Qualidade", values: ["std", "pro", "4k"], default: "pro", labels: { std: "standard", pro: "pro", "4k": "4K" } }, { name: "sound", label: "Som", values: ["on", "off"], default: "off", labels: { on: "com som", off: "sem som" } }],
  },
  {
    id: "kling4_0", name: "Kling 4.0", kind: "video", provider: "higgsfield", tag: "Novo",
    description: "Movimento realista, até 30s, referências de imagem.",
    aspectRatios: ["auto", "21:9", "16:9", "9:16", "1:1"], durations: { min: 3, max: 30, default: 5 }, mediaRoles: ["start_image", "end_image", "image_references", "video_references"], maxRefs: 4,
    credits: 3.25, perSecond: true, maxCount: 4, referenceMode: { param: "mode", value: "reference-to-video", textValue: "text-to-video" },
    price: ({ options: o }) => (o.resolution === "720p" ? 2.25 : 3.25),
    options: [{ name: "resolution", label: "Resolução", values: ["720p", "1080p"], default: "1080p" }],
  },
  {
    id: "minimax_h3", name: "MiniMax H3", kind: "video", provider: "higgsfield",
    description: "Keyframes 2K e referências mistas.",
    aspectRatios: ["auto", ...AR_VID], durations: { min: 4, max: 15, default: 6 }, mediaRoles: ["start_image", "end_image", "image_references"], maxRefs: 6,
    credits: 2, perSecond: true, maxCount: 4, countParam: "batch_size",
  },

  // ---------- ÁUDIO ----------
  { id: "eleven_multilingual_v2", name: "ElevenLabs Multilingual v2", kind: "audio", provider: "elevenlabs", tag: "Locução", description: "Locução natural PT-BR (API ElevenLabs da empresa).", credits: 0 },
  { id: "eleven_v3", name: "ElevenLabs v3", kind: "audio", provider: "elevenlabs", description: "Mais expressivo, suporta tags de emoção.", credits: 0 },

  // ---------- ENHANCE ----------
  { id: "upscale_image", name: "Upscale de Imagem (2K/4K)", kind: "upscale_image", provider: "higgsfield", description: "Aumenta resolução e nitidez da imagem.", credits: 2,
    options: [{ name: "resolution", label: "Resolução", values: ["2k", "4k"], default: "4k" }] },
  { id: "upscale_video", name: "Upscale de Vídeo (Topaz)", kind: "upscale_video", provider: "higgsfield", description: "Topaz Video até 4K.", credits: 3, perSecond: true,
    options: [{ name: "resolution", label: "Resolução", values: ["1080p", "2160p"], default: "2160p" }] },

  // ---------- AVATAR ----------
  { id: "soul_cast", name: "Soul Cast", kind: "avatar", provider: "higgsfield", tag: "Personagem", description: "Cria personagem/avatar a partir de descrição textual.", aspectRatios: ["16:9"], credits: 0.12, maxCount: 4 },
];

export function getModel(id: string) {
  return MODELS.find((m) => m.id === id);
}

export function modelsFor(kind: GenKind) {
  return MODELS.filter((m) => m.kind === kind);
}

export function defaultOptions(m: ModelDef) {
  return Object.fromEntries((m.options ?? []).map((o) => [o.name, o.default])) as Record<string, string>;
}
export function defaultFlags(m: ModelDef) {
  return Object.fromEntries((m.flags ?? []).map((f) => [f.name, f.default])) as Record<string, boolean>;
}

export function unitCredits(m: ModelDef, options?: Record<string, string>, flags?: Record<string, boolean>, duration?: number) {
  const o = { ...defaultOptions(m), ...(options ?? {}) };
  const f = { ...defaultFlags(m), ...(flags ?? {}) };
  return m.price ? m.price({ options: o, flags: f, duration: duration ?? m.durations?.default ?? 5 }) : m.credits;
}

export function estimateCredits(m: ModelDef, opts: { count?: number; duration?: number; options?: Record<string, string>; flags?: Record<string, boolean> }) {
  const count = opts.count ?? 1;
  const units = m.perSecond ? opts.duration ?? m.durations?.default ?? 5 : 1;
  return Math.round(unitCredits(m, opts.options, opts.flags, opts.duration) * units * count * 100) / 100;
}
