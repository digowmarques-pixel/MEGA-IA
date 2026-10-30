import { handle, HttpError, requireUser } from "@/lib/auth";
import { ALL_TAGS } from "@/lib/audio-tags";
import { autoTagText } from "@/lib/claude";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as { text?: string; direction?: string };
  const text = (b.text ?? "").replace(/\[[^\]]*\]\s?/g, "").trim(); // reaplica do zero, sem tags antigas
  if (!text) throw new HttpError(400, "Escreva o texto antes de adicionar tags");
  if (text.length > 10000) throw new HttpError(400, "Máximo de 10.000 caracteres");
  return Response.json(await autoTagText({ userId: user.id, text, direction: b.direction, tagLibrary: ALL_TAGS }));
});
