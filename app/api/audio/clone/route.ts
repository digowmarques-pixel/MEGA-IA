import { handle, HttpError, requireUser } from "@/lib/auth";
import { EL } from "@/lib/el";

/** Clonagem instantânea: amostras de áudio da pessoa (com autorização dela). */
export const POST = handle(async (req: Request) => {
  await requireUser();
  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  if (!name) throw new HttpError(400, "Dê um nome para a voz");
  if (form.get("consent") !== "true") throw new HttpError(400, "Confirme que a pessoa autorizou a clonagem da voz");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, "Envie ao menos uma amostra de áudio (ideal: 1 a 3 minutos, sem música)");
  if (files.length > 25) throw new HttpError(400, "Máximo de 25 amostras");
  const bufs = await Promise.all(files.map(async (f) => {
    if (!/^(audio|video)\//.test(f.type)) throw new HttpError(400, `${f.name} não é áudio`);
    return { buffer: Buffer.from(await f.arrayBuffer()), name: f.name, type: f.type };
  }));
  const v = await EL.cloneVoice({ name, description: String(form.get("description") || ""), files: bufs, removeBackgroundNoise: form.get("removeBackgroundNoise") === "true" });
  return Response.json({ voiceId: v.voice_id });
});
