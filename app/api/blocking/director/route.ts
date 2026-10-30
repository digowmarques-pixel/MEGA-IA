import { handle, HttpError, requireUser } from "@/lib/auth";
import type { BlockingData } from "@/lib/blocking";
import { claudeConfigured, directScene } from "@/lib/claude";

export const maxDuration = 300;

/** body { description, current?, aspect? } → { data, report, fixes } */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as { description?: string; current?: BlockingData | null; aspect?: string };
  const description = b.description?.trim();
  if (!description) throw new HttpError(400, "Descreva a cena");
  if (description.length > 4000) throw new HttpError(400, "Descrição muito longa (máx. 4.000 caracteres)");
  if (!claudeConfigured()) throw new HttpError(503, "Claude não configurado: falta ANTHROPIC_API_KEY no servidor");
  const current = b.current && Array.isArray(b.current.objects) && Array.isArray(b.current.camera) ? b.current : null;
  return Response.json(await directScene({ userId: user.id, description, current, aspect: b.aspect }));
});
