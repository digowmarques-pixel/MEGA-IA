import { handle, HttpError, requireUser } from "@/lib/auth";
import { elCreditsEstimate, num, reply, runAudioJob, scopeFrom } from "@/lib/audio-jobs";
import { EL } from "@/lib/el";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await req.json();
  const text = String(b.text ?? "").trim();
  if (!text) throw new HttpError(400, "Descreva o efeito sonoro");
  const duration = b.durationSec ? num(b.durationSec, 0.5, 30) ?? null : null;
  const gen = await runAudioJob(user, {
    op: "sfx", model: "eleven_sound_effects", prompt: text, wallet: b.wallet, clientRequestId: b.clientRequestId, scope: scopeFrom(b),
    elCredits: elCreditsEstimate("sfx", { durationSec: duration }),
    params: { durationSec: duration ?? "auto", promptInfluence: num(b.promptInfluence, 0, 1) ?? 0.3, loop: !!b.loop },
  }, () => EL.soundEffect({ text, durationSeconds: duration, promptInfluence: num(b.promptInfluence, 0, 1), loop: !!b.loop, outputFormat: b.outputFormat }));
  return reply(gen);
});
