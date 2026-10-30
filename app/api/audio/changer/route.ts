import { handle, HttpError, requireUser } from "@/lib/auth";
import { audioInput, elCreditsEstimate, num, reply, runAudioJob, scopeFrom } from "@/lib/audio-jobs";
import { EL } from "@/lib/el";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData();
  const voiceId = String(form.get("voiceId") || "");
  if (!voiceId) throw new HttpError(400, "Escolha a voz de destino");
  const input = await audioInput(form);
  const settings = { stability: num(form.get("stability"), 0, 1), similarity: num(form.get("similarity"), 0, 1), style: num(form.get("style"), 0, 1) };
  const gen = await runAudioJob(user, {
    op: "changer", model: String(form.get("modelId") || "eleven_multilingual_sts_v2"), prompt: `Trocar voz: ${input.name} → ${form.get("voiceName") || voiceId}`,
    wallet: (form.get("wallet") as never) || null, clientRequestId: (form.get("clientRequestId") as string) || null, scope: scopeFrom(form),
    elCredits: elCreditsEstimate("changer", { durationSec: input.durationSec }),
    params: { source: input.name, voiceId, durationSec: input.durationSec, removeBackgroundNoise: form.get("removeBackgroundNoise") === "true", ...settings },
  }, () => EL.changeVoice({ file: input, voiceId, modelId: String(form.get("modelId") || "") || undefined, settings, removeBackgroundNoise: form.get("removeBackgroundNoise") === "true", outputFormat: String(form.get("outputFormat") || "") || undefined }));
  return reply(gen);
});
