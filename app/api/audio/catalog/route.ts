import { handle, requireUser } from "@/lib/auth";
import { EL, elMode, OUTPUT_FORMATS } from "@/lib/el";

let cache: { at: number; data: unknown } | null = null;

export const GET = handle(async (req: Request) => {
  await requireUser();
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (!cache || fresh || Date.now() - cache.at > 5 * 60_000) {
    const [models, voices, sub] = await Promise.all([EL.listModels(), EL.listVoices(), EL.subscription().catch(() => null)]);
    const tts = models.filter((m) => m.can_do_text_to_speech !== false && !/sts/.test(m.model_id));
    // Eleven v4 primeiro (modelo mais usado pela equipe), depois v3 e o resto
    const rank = (id: string) => (/v4/.test(id) ? 0 : /v3/.test(id) ? 1 : /multilingual_v2/.test(id) ? 2 : 3);
    tts.sort((a, b) => rank(a.model_id) - rank(b.model_id));
    cache = {
      at: Date.now(),
      data: {
        mode: elMode(),
        ttsModels: tts.map((m) => ({ id: m.model_id, name: m.name, languages: m.languages ?? [], description: m.description ?? "" })),
        stsModels: models.filter((m) => m.can_do_voice_conversion || /sts/.test(m.model_id)).map((m) => ({ id: m.model_id, name: m.name })),
        voices: voices.map((v) => ({ id: v.voice_id, name: v.name, category: v.category ?? "", labels: v.labels ?? {}, preview: v.preview_url ?? null })).sort((a, b) => a.name.localeCompare(b.name)),
        outputFormats: OUTPUT_FORMATS,
        subscription: sub,
      },
    };
  }
  return Response.json(cache.data);
});
