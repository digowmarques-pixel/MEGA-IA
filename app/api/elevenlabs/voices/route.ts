import { handle, requireUser } from "@/lib/auth";
import { elevenlabsConfigured, listVoices } from "@/lib/providers/elevenlabs";

let cache: { at: number; voices: unknown } | null = null;

export const GET = handle(async () => {
  await requireUser();
  if (!elevenlabsConfigured()) return Response.json({ configured: false, voices: [] });
  if (!cache || Date.now() - cache.at > 10 * 60_000) cache = { at: Date.now(), voices: await listVoices() };
  return Response.json({ configured: true, voices: cache.voices });
});
