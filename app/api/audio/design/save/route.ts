import { handle, HttpError, requireUser } from "@/lib/auth";
import { EL } from "@/lib/el";

export const POST = handle(async (req: Request) => {
  await requireUser();
  const b = await req.json();
  if (!b.name?.trim() || !b.generatedVoiceId) throw new HttpError(400, "Dê um nome e escolha uma das prévias");
  const v = await EL.saveDesignedVoice({ name: b.name.trim(), description: String(b.description ?? ""), generatedVoiceId: b.generatedVoiceId });
  return Response.json({ voiceId: v.voice_id });
});
