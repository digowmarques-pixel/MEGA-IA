import { handle, requireUser } from "@/lib/auth";
import { audioInput, elCreditsEstimate, num, reply, runAudioJob, scopeFrom } from "@/lib/audio-jobs";
import { EL } from "@/lib/el";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData();
  const input = await audioInput(form);
  const gen = await runAudioJob(user, {
    op: "isolate", model: "eleven_voice_isolator", prompt: `Isolar voz: ${input.name}`, wallet: (form.get("wallet") as never) || null,
    clientRequestId: (form.get("clientRequestId") as string) || null, scope: scopeFrom(form),
    elCredits: elCreditsEstimate("isolate", { durationSec: input.durationSec }), params: { source: input.name, durationSec: input.durationSec },
  }, () => EL.isolateVoice(input));
  return reply(gen);
});
