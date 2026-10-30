import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLibraryEntry } from "@/lib/library";

type Ctx = { params: Promise<{ id: string }> };
const get = (id: number) => db().prepare("SELECT * FROM prompt_library WHERE id = ?").get(id) as { id: number; created_by: number | null } | undefined;

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const id = Number((await ctx.params).id);
  const e = getLibraryEntry(id);
  if (!e) throw new HttpError(404, "Referência não encontrada");
  return Response.json({ entry: e });
});

/** body { use: true } registra um uso; demais campos editam (autor ou gestor). */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const id = Number((await ctx.params).id);
  const e = get(id);
  if (!e) throw new HttpError(404, "Referência não encontrada");
  const b = (await req.json()) as Record<string, unknown>;
  if (b.use) { db().prepare("UPDATE prompt_library SET uses = uses + 1 WHERE id = ?").run(id); return Response.json({ ok: true }); }
  if (user.role !== "admin" && e.created_by !== user.id) throw new HttpError(403, "Só quem criou ou o gestor podem editar");
  const map: Record<string, (v: unknown) => unknown> = { title: String, model: (v) => v || null, category: String, prompt: String, notes: (v) => v || null, tags: (v) => JSON.stringify(v ?? []), inputs: (v) => JSON.stringify(v ?? []), assetId: (v) => v || null };
  for (const [k, f] of Object.entries(map)) if (k in b) db().prepare(`UPDATE prompt_library SET ${k === "assetId" ? "asset_id" : k} = ? WHERE id = ?`).run(f(b[k]), id);
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const id = Number((await ctx.params).id);
  const e = get(id);
  if (!e) throw new HttpError(404, "Referência não encontrada");
  if (user.role !== "admin" && e.created_by !== user.id) throw new HttpError(403, "Só quem criou ou o gestor podem excluir");
  db().prepare("DELETE FROM prompt_library WHERE id = ?").run(id);
  return Response.json({ ok: true });
});
