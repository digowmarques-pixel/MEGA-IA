import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { db } from "./db";
import { examplesFor } from "./library";
import { MODELS } from "./models";
import type { BlockingData } from "./blocking";
import { DIRECTOR_RULES, DirectorSchema, sceneForPrompt, toBlocking } from "./director";

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
// Preço USD por 1M tokens (entrada / saída) para controle de custo no painel do gestor.
const PRICE: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-1": [10, 50],
};

let client: Anthropic | null = null;
export function claudeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
function anthropic() {
  if (!claudeConfigured()) throw new Error("ANTHROPIC_API_KEY não configurada");
  if (!client) client = new Anthropic();
  return client;
}

// Recusas de segurança: a API tenta automaticamente um modelo alternativo.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export function logUsage(userId: number, feature: string, usage: { input_tokens: number; output_tokens: number } | undefined) {
  if (!usage) return;
  const [pin, pout] = PRICE[CLAUDE_MODEL] ?? [4, 20];
  const cost = (usage.input_tokens * pin + usage.output_tokens * pout) / 1e6;
  db().prepare("INSERT INTO ai_usage (user_id, feature, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId, feature, CLAUDE_MODEL, usage.input_tokens, usage.output_tokens, cost);
}

// ---------------- Skills ----------------
export type Skill = { file: string; name: string; applies: string[]; body: string };

export function loadSkills(kind?: string): Skill[] {
  const dir = path.join(process.cwd(), "skills");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort()
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
      const meta: Record<string, string> = {};
      fm?.[1].split("\n").forEach((l) => {
        const i = l.indexOf(":");
        if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim();
      });
      return {
        file,
        name: meta.name || file,
        applies: (meta.applies || "all").split(/[,\s]+/).filter(Boolean),
        body: fm ? raw.slice(fm[0].length) : raw,
      };
    })
    .filter((s) => !kind || s.applies.includes("all") || s.applies.includes(kind));
}

function skillsBlock(kind?: string) {
  return loadSkills(kind)
    .map((s) => `<skill name="${s.name}">\n${s.body.trim()}\n</skill>`)
    .join("\n\n");
}

/** Prompts aprovados da biblioteca da produtora, usados como referência de estilo e estrutura. */
function libraryBlock(kind: string, text: string) {
  const ex = examplesFor(kind === "avatar" ? "image" : kind, text, 4);
  if (!ex.length) return "";
  return `\nExemplos de prompts de referência (origem="Mega" são aprovados pela produtora; origem="externo" são da comunidade). Inspire-se na estrutura e no nível de detalhe; não copie o conteúdo:\n${ex
    .map((e) => `<exemplo origem="${e.external ? "externo" : "Mega"}" titulo="${e.title}" categoria="${e.category}" inputs="${e.inputs.join(", ")}">\n${e.prompt.slice(0, 1200)}\n${e.notes ? `Por que funciona: ${e.notes}` : ""}\n</exemplo>`)
    .join("\n")}`;
}

// ---------------- Enhance de prompt ----------------
const EnhanceSchema = z.object({
  enhanced_prompt: z.string().describe("Prompt final otimizado, em inglês, pronto para o modelo de geração"),
  improvements: z.array(z.string()).describe("O que foi melhorado, em português, uma frase curta por item"),
  prediction: z.object({
    summary: z.string().describe("Como o resultado provavelmente vai ficar, em 2-3 frases, em português"),
    framing: z.string().describe("Enquadramento e ângulo de câmera"),
    camera: z.string().describe("Lente, câmera e movimento (vídeo) ou ótica (imagem)"),
    lighting: z.string().describe("Iluminação"),
    color_grading: z.string().describe("Color grading / paleta"),
    mood: z.string().describe("Clima / atmosfera"),
  }),
  warnings: z.array(z.string()).describe("Riscos ou limitações prováveis (artefatos, ambiguidade, custo alto); vazio se nenhum"),
  suggested: z.object({
    aspect_ratio: z.string().nullable(),
    duration_seconds: z.number().nullable(),
    model_id: z.string().nullable().describe("ID de modelo recomendado da lista fornecida, ou null"),
  }),
});
export type EnhanceResult = z.infer<typeof EnhanceSchema>;

export async function enhancePrompt(opts: {
  userId: number;
  kind: string;
  prompt: string;
  model?: string;
  aspectRatio?: string;
  duration?: number;
  context?: string;
  hasReferences?: boolean;
}): Promise<EnhanceResult> {
  const models = MODELS.filter((m) => m.kind === opts.kind).map((m) => `- ${m.id}: ${m.name} — ${m.description}`).join("\n");
  const system = `Você é o diretor de fotografia e roteirista técnico de uma produtora de vídeo brasileira.
Sua tarefa: transformar o pedido do colaborador (às vezes simples) em um prompt de geração de ${opts.kind === "video" ? "VÍDEO" : opts.kind === "image" ? "IMAGEM" : opts.kind.toUpperCase()} de alta qualidade,
e explicar de forma breve o que melhorou e como o resultado provavelmente vai ficar, para ele decidir se é isso mesmo que quer.

Siga as skills abaixo.

${skillsBlock(opts.kind)}

Modelos disponíveis para este tipo:
${models}
${libraryBlock(opts.kind, opts.prompt)}`;

  const user = [
    `Pedido do colaborador:\n"""${opts.prompt}"""`,
    opts.model && `Modelo selecionado: ${opts.model}`,
    opts.aspectRatio && `Proporção selecionada: ${opts.aspectRatio}`,
    opts.duration && `Duração selecionada: ${opts.duration}s`,
    opts.hasReferences && `Há imagens de referência anexadas: preserve identidade, cenário e luz delas.`,
    opts.context && `Contexto do projeto/cenário/cena:\n${opts.context}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await anthropic().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(EnhanceSchema) },
    system,
    messages: [{ role: "user", content: user }],
    ...FALLBACK,
  });
  logUsage(opts.userId, "enhance", res.usage);
  if (res.stop_reason === "refusal") throw new Error("O Claude recusou este pedido. Reformule o prompt.");
  if (!res.parsed_output) throw new Error("Não foi possível interpretar a resposta do Claude");
  return res.parsed_output;
}

// ---------------- Assistente ----------------
export type ChatMessage = { role: "user" | "assistant"; content: string };

export function assistantStream(opts: { userId: number; messages: ChatMessage[]; context?: string }) {
  const system = `Você é o assistente criativo do AI Hub de uma produtora de vídeo brasileira. Responda em português.
Ajude a planejar filmes gerados por IA: decupagem em cenários (locações) e cenas, shot lists, continuidade entre cenas,
prompts de imagem e vídeo com linguagem cinematográfica (ângulos, lentes, movimento, luz e color grading), escolha de modelos e estimativa de créditos.
Quando escrever prompts prontos para uso, coloque cada um em um bloco de código para facilitar copiar.

${skillsBlock()}

${opts.context ? `Contexto atual do projeto:\n${opts.context}` : ""}`;

  const stream = anthropic().beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 64000,
    output_config: { effort: "medium" },
    system,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ...FALLBACK,
  });

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        logUsage(opts.userId, "assistant", final.usage);
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\n_(Pedido recusado pelo modelo. Tente reformular.)_"));
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n[Erro: ${e instanceof Error ? e.message : String(e)}]`));
      } finally {
        controller.close();
      }
    },
  });
}

// ---------------- Tags automáticas para locução (ElevenLabs v3/v4) ----------------
const TagSchema = z.object({
  tagged_text: z.string().describe("O texto original, palavra por palavra, com as tags de áudio inseridas"),
  tags_used: z.array(z.string()).describe("Tags inseridas, na ordem em que aparecem"),
  note: z.string().describe("Uma frase em português explicando a intenção de interpretação escolhida"),
});
export type TagResult = z.infer<typeof TagSchema>;

export async function autoTagText(opts: { userId: number; text: string; direction?: string; tagLibrary: string[] }): Promise<TagResult> {
  const system = `Você é diretor de dublagem e locução. Insira tags de áudio entre colchetes no roteiro para o modelo de voz da ElevenLabs (v3/v4) interpretar melhor.
Regras:
- NÃO altere, traduza, corte nem acrescente palavras do texto. Só insira tags e, se necessário, reticências para pausas.
- Use as tags no mesmo idioma do texto. Prefira as tags desta biblioteca: ${opts.tagLibrary.join(" ")}. Pode criar uma tag curta nova quando nenhuma servir.
- Coloque a tag imediatamente antes do trecho que ela afeta. Use com moderação: em média uma tag a cada uma ou duas frases; nunca duas tags de emoção seguidas.
- Respeite o tom do texto e a direção pedida.`;
  const res = await anthropic().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: betaZodOutputFormat(TagSchema) },
    system,
    messages: [{ role: "user", content: `${opts.direction ? `Direção de interpretação: ${opts.direction}\n\n` : ""}Roteiro:\n"""${opts.text}"""` }],
    ...FALLBACK,
  });
  logUsage(opts.userId, "autotag", res.usage);
  if (res.stop_reason === "refusal") throw new Error("O Claude recusou este texto.");
  if (!res.parsed_output) throw new Error("Não foi possível interpretar a resposta do Claude");
  // garantia: se o modelo mexeu nas palavras, descarta o resultado
  const strip = (s: string) => s.replace(/\[[^\]]*\]/g, " ").replace(/[.…\s]+/g, " ").trim().toLowerCase();
  if (strip(res.parsed_output.tagged_text) !== strip(opts.text)) throw new Error("O texto com tags alterou palavras do roteiro — tente novamente.");
  return res.parsed_output;
}

// ---------------- Diretor 3D (blocking por texto) ----------------
export async function directScene(opts: { userId: number; description: string; current?: BlockingData | null; aspect?: string }) {
  const skill = loadSkills().filter((s) => /blocking/i.test(s.file)).map((s) => `<skill name="${s.name}">\n${s.body.trim()}\n</skill>`).join("\n");
  const user = [
    `Pedido do colaborador:\n"""${opts.description}"""`,
    opts.current ? `Cena atual (ajuste esta cena; mantenha o que o pedido não muda):\n${sceneForPrompt(opts.current)}` : `Crie uma cena nova. Proporção: ${opts.aspect ?? "16:9"}.`,
  ].join("\n\n");
  const res = await anthropic().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 32000,
    output_config: { effort: "high", format: betaZodOutputFormat(DirectorSchema) },
    system: `${DIRECTOR_RULES}\n\n${skill}`,
    messages: [{ role: "user", content: user }],
    ...FALLBACK,
  });
  logUsage(opts.userId, "director3d", res.usage);
  if (res.stop_reason === "refusal") throw new Error("O Claude recusou este pedido. Reformule a descrição.");
  if (!res.parsed_output) throw new Error("Não foi possível interpretar a resposta do Claude");
  const { data, fixes } = toBlocking(res.parsed_output, opts.current ?? undefined);
  return { data, report: res.parsed_output.report, fixes };
}
