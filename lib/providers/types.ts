import type { GenKind } from "../models";

export type MediaRef = {
  role: string;
  /** job_id / media_id do Higgsfield (preferido) */
  providerRef?: string | null;
  /** URL pública ou local (/api/media/...) */
  url?: string | null;
};

export type GenerateInput = {
  kind: GenKind;
  model: string;
  prompt: string;
  aspectRatio?: string;
  count?: number;
  duration?: number;
  options?: Record<string, string>;
  /** parâmetros booleanos do modelo (ex.: generate_audio, draft) */
  flags?: Record<string, boolean>;
  /** roteiro multi-shot: planos com prompt e duração */
  shots?: { prompt: string; duration: number }[];
  medias?: MediaRef[];
  /** para upscale */
  source?: { providerRef?: string | null; url?: string | null; width?: number | null; height?: number | null };
  label?: string;
};

export type Output = {
  kind: "image" | "video" | "audio";
  url: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  providerRef?: string;
};

export type SubmitResult = {
  jobIds: string[];
  credits: number;
  /** quando o provedor já devolve o resultado (mock, ElevenLabs) */
  outputs?: Output[];
};

export type PollResult = {
  status: "processing" | "completed" | "failed";
  outputs: Output[];
  error?: string;
};

export interface GenerationProvider {
  name: string;
  estimate(input: GenerateInput): Promise<number | null>;
  submit(input: GenerateInput): Promise<SubmitResult>;
  poll(jobIds: string[], kind: GenKind): Promise<PollResult>;
  balance(): Promise<{ credits: number | null; plan?: string; raw?: unknown }>;
  /** Envia um arquivo local (referência arrastada para o Hub) e devolve o media_id no provedor. */
  uploadLocal?(filePath: string, kind: "image" | "video" | "audio"): Promise<string>;
}
