import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CATEGORIES, countLibrary, INPUT_TYPES, listLibrary, MODES, seedLibrary } from "@/lib/library";

export const GET = handle(async (req: Request) => {
  await requireUser();
  seedLibrary();
  const q = new URL(req.url).searchParams;
  const origin = q.get("origin");
  const f = {
    kind: q.get("kind") || undefined, category: q.get("category") || undefined, q: q.get("q") || undefined, mode: q.get("mode") || undefined,
    origin: origin === "mega" || origin === "externo" ? origin : undefined,
  } as const;
  const limit = Math.min(Math.max(Number(q.get("limit")) || 48, 1), 200);
  const offset = Math.max(Number(q.get("offset")) || 0, 0);
  return Response.json({
    entries: listLibrary({ ...f, limit, offset }), total: countLibrary(f),
    categories: CATEGORIES, inputTypes: INPUT_TYPES, modes: MODES,
  });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as { title?: string; kind?: string; model?: string; category?: string; prompt?: string; notes?: string; tags?: string[]; inputs?: string[]; assetId?: number | null; sourceUrl?: string };
  if (!b.title?.trim() || !b.prompt?.trim() || !b.category) throw new HttpError(400, "Título, categoria e prompt são obrigatórios");
  const info = db().prepare("INSERT INTO prompt_library (title, kind, model, category, prompt, notes, tags, inputs, asset_id, source_url, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(b.title.trim(), b.kind === "image" ? "image" : "video", b.model || null, b.category, b.prompt.trim(), b.notes || null, JSON.stringify(b.tags ?? []), JSON.stringify(b.inputs ?? []), b.assetId || null, b.sourceUrl || null, user.id);
  return Response.json({ id: Number(info.lastInsertRowid) });
});
