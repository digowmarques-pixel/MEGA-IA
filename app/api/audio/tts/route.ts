import { handle, HttpError, requireUser } from "@/lib/auth";
import { elCreditsEstimate, num, reply, runAudioJob, scopeFrom } from "@/lib/audio-jobs";
import { EL } from "@/lib/el";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await req.json();
  const text = String(b.text ?? "").trim();
  if (!text) throw new HttpError(400, "Escreva o texto da locução");
  if (text.length > 10000) throw new HttpError(400, "Máximo de 10.000 caracteres por geração");
  if (!b.voiceId) throw new HttpError(400, "Escolha uma voz");
  if (!b.modelId) throw new HttpError(400, "Escolha um modelo");
  const settings = { stability: num(b.stability, 0, 1), similarity: num(b.similarity, 0, 1), style: num(b.style, 0, 1), speed: num(b.speed, 0.7, 1.2), speakerBoost: b.speakerBoost !== false };
  const gen = await runAudioJob(user, {
    op: "tts", model: b.modelId, prompt: text, wallet: b.wallet, clientRequestId: b.clientRequestId, scope: scopeFrom(b),
    elCredits: elCreditsEstimate("tts", { chars: text.length, modelId: b.modelId }),
    params: { voiceId: b.voiceId, voiceName: b.voiceName, language: b.languageCode || "auto", outputFormat: b.outputFormat, characters: text.length, ...settings },
  }, () => EL.textToSpeech({ text, voiceId: b.voiceId, modelId: b.modelId, settings, languageCode: b.languageCode || null, outputFormat: b.outputFormat, seed: b.seed ?? null }));
  return reply(gen);
});
