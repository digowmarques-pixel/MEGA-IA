import { handle, HttpError, requireUser } from "@/lib/auth";
import { elCreditsEstimate, runAudioJob, scopeFrom } from "@/lib/audio-jobs";
import { getAssets } from "@/lib/assets";
import { EL } from "@/lib/el";

/** Criação de voz por descrição: gera 3 prévias (cobradas) para escolher e salvar. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await req.json();
  const description = String(b.description ?? "").trim();
  if (description.length < 20) throw new HttpError(400, "Descreva a voz com pelo menos 20 caracteres (idade, sotaque, timbre, ritmo, emoção)");
  const text = String(b.text ?? "").trim();
  let result: Awaited<ReturnType<typeof EL.designVoicePreviews>> | null = null;
  const gen = await runAudioJob(user, {
    op: "design", model: "eleven_voice_design", prompt: description, wallet: b.wallet, clientRequestId: b.clientRequestId, scope: scopeFrom(b),
    elCredits: elCreditsEstimate("design", { chars: text.length }), params: { text: text || "auto" },
  }, async () => {
    result = await EL.designVoicePreviews({ description, text: text || null });
    return { url: result.previews[0].url, elCredits: null };
  });
  if (gen.status === "failed") return Response.json({ error: gen.error, generation: gen }, { status: 422 });
  const r = result as unknown as Awaited<ReturnType<typeof EL.designVoicePreviews>>;
  return Response.json({ generation: gen, assets: getAssets("a.generation_id = ?", [gen.id]), text: r.text, previews: r.previews });
});
