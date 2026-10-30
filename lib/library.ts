import fs from "node:fs";
import path from "node:path";
import { db } from "./db";

export type LibraryEntry = {
  id: number; title: string; kind: "video" | "image"; model: string | null; category: string; prompt: string; notes: string | null;
  tags: string[]; inputs: string[]; asset_id: number | null; source_url: string | null; created_by: number | null; uses: number; created_at: string;
  video_url?: string | null; thumb_url?: string | null; author?: string | null;
  mode?: string | null; duration?: number | null; ratio?: string | null; refs_count?: number | null; external?: number;
};

export const CATEGORIES = ["Ação", "Ação / Luta", "Diálogo", "Produto", "Produto / Comercial", "Moda / Beleza", "Natureza / Paisagem", "Esporte", "Drama", "Drama / Romance", "Terror / Suspense", "Comédia", "Sci-fi / Fantasia", "Super-heróis", "Anime", "Cinema", "Música / Dança", "Histórico", "Documental", "Câmera / Movimento", "Blocking 3D", "Multi-shot", "Tutoriais", "Outros"];
export const MODES: Record<string, string> = { "Text to video": "Texto → vídeo", "Image to video": "Imagem → vídeo", "Reference to video": "Referências → vídeo", "Video editing": "Edição de vídeo" };
export const INPUT_TYPES = ["Frame inicial", "Frame final", "Imagens de referência de personagem", "Imagem de referência de cenário", "Vídeo de blocking 3D", "Vídeo de referência de movimento", "Áudio de referência", "Só texto"];

type Row = Omit<LibraryEntry, "tags" | "inputs"> & { tags: string | null; inputs: string | null };
const parse = (r: Row): LibraryEntry => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : [], inputs: r.inputs ? JSON.parse(r.inputs) : [] });

type Filter = { kind?: string; category?: string; q?: string; mode?: string; origin?: "mega" | "externo"; limit?: number; offset?: number };

function whereOf(f: Filter) {
  const where = ["1=1"];
  const params: unknown[] = [];
  if (f.kind) { where.push("l.kind = ?"); params.push(f.kind); }
  if (f.category) { where.push("l.category = ?"); params.push(f.category); }
  if (f.mode) { where.push("l.mode = ?"); params.push(f.mode); }
  if (f.origin === "mega") where.push("(l.source_url IS NULL OR l.source_url NOT LIKE 'http%')");
  if (f.origin === "externo") where.push("l.source_url LIKE 'http%'");
  if (f.q) {
    // cada palavra precisa aparecer em algum campo (busca "dolly night" acha os dois termos em qualquer ordem)
    for (const w of f.q.trim().split(/\s+/).slice(0, 6)) {
      where.push("(l.title LIKE ? OR l.prompt LIKE ? OR l.tags LIKE ? OR l.notes LIKE ? OR l.category LIKE ?)");
      const like = `%${w}%`; params.push(like, like, like, like, like);
    }
  }
  return { sql: where.join(" AND "), params };
}

export function listLibrary(f: Filter = {}) {
  const w = whereOf(f);
  const limit = Math.max(1, Math.min(f.limit ?? 200, 500));
  const offset = Math.max(0, Math.floor(f.offset ?? 0));
  // Internas (Mega) primeiro, depois as mais usadas; exemplos externos tocam o vídeo direto da fonte.
  const rows = db().prepare(`SELECT l.*, COALESCE(a.url, l.video_url) AS video_url, COALESCE(a.thumb_url, l.thumb_url) AS thumb_url,
      COALESCE(l.author_credit, u.name) AS author, (l.source_url LIKE 'http%') AS external
    FROM prompt_library l LEFT JOIN assets a ON a.id = l.asset_id LEFT JOIN users u ON u.id = l.created_by
    WHERE ${w.sql} ORDER BY external ASC, l.uses DESC, l.id ASC LIMIT ${limit} OFFSET ${offset}`).all(...w.params) as Row[];
  return rows.map(parse);
}

export function countLibrary(f: Filter = {}) {
  const w = whereOf(f);
  return (db().prepare(`SELECT COUNT(*) c FROM prompt_library l WHERE ${w.sql}`).get(...w.params) as { c: number }).c;
}

export function getLibraryEntry(id: number) {
  const w = whereOf({});
  const r = db().prepare(`SELECT l.*, COALESCE(a.url, l.video_url) AS video_url, COALESCE(a.thumb_url, l.thumb_url) AS thumb_url,
      COALESCE(l.author_credit, u.name) AS author, (l.source_url LIKE 'http%') AS external
    FROM prompt_library l LEFT JOIN assets a ON a.id = l.asset_id LEFT JOIN users u ON u.id = l.created_by
    WHERE ${w.sql} AND l.id = ?`).get(...w.params, id) as Row | undefined;
  return r ? parse(r) : null;
}

/** Exemplos para o Enhance: candidatos que contêm termos do pedido + os internos; pontua por termos, uso e origem (internos da Mega pesam mais). */
export function examplesFor(kind: string, text: string, n = 5) {
  const words = [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3))].slice(0, 12);
  const d = db();
  const internal = listLibrary({ kind, origin: "mega", limit: 200 });
  let candidates: LibraryEntry[] = [];
  if (words.length) {
    const cond = words.map(() => "(l.title LIKE ? OR l.prompt LIKE ? OR l.category LIKE ?)").join(" OR ");
    const params = words.flatMap((w) => [`%${w}%`, `%${w}%`, `%${w}%`]);
    const ids = d.prepare(`SELECT l.id FROM prompt_library l WHERE l.kind = ? AND l.source_url LIKE 'http%' AND (${cond}) LIMIT 400`).all(kind, ...params) as { id: number }[];
    candidates = ids.map((r) => getLibraryEntry(r.id)).filter((x): x is LibraryEntry => !!x);
  }
  const score = (e: LibraryEntry) => {
    const hay = `${e.title} ${e.category} ${e.tags.join(" ")} ${e.prompt}`.toLowerCase();
    return words.filter((w) => hay.includes(w)).length + Math.min(e.uses, 20) * 0.1 + (e.external ? 0 : 1.5);
  };
  return [...internal, ...candidates].sort((a, b) => score(b) - score(a)).slice(0, n);
}

type Imported = { title: string; category: string; prompt: string; mode?: string; inputs: string[]; duration?: number | null; ratio?: string; refs?: number; video?: string; poster?: string; author?: string; url: string; model: string };

/** Importa a coleção pública do bestseedanceprompts.com (prompts com crédito ao autor; o vídeo toca da fonte, não é copiado). Idempotente por source_url. */
export function importExternalLibrary(): number {
  const d = db();
  const done = d.prepare("SELECT value FROM settings WHERE key = 'library_import_bsp_v1'").get();
  if (done) return 0;
  const file = path.join(process.cwd(), "data-seed", "bestseedanceprompts.json");
  if (!fs.existsSync(file)) return 0;
  const items = JSON.parse(fs.readFileSync(file, "utf8")) as Imported[];
  const ins = d.prepare(`INSERT INTO prompt_library (title, kind, model, category, prompt, notes, tags, inputs, source_url, video_url, thumb_url, author_credit, mode, duration, ratio, refs_count)
    SELECT ?, 'video', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM prompt_library WHERE source_url = ?)`);
  let n = 0;
  d.transaction(() => {
    for (const x of items) {
      if (!x.prompt?.trim() || !x.url?.startsWith("http")) continue;
      const tags = [MODES[x.mode ?? ""] ?? x.mode, x.ratio, x.duration ? `${x.duration}s` : null].filter(Boolean);
      const notes = `Fonte: bestseedanceprompts.com${x.author ? ` · autor ${x.author}` : ""}. ${x.refs ? `Usa ${x.refs} referência(s) de entrada.` : ""}`.trim();
      n += ins.run(x.title.slice(0, 160), x.model || "seedance_2_5", x.category, x.prompt.trim(), notes, JSON.stringify(tags), JSON.stringify(x.inputs ?? []), x.url,
        x.video?.startsWith("https://") ? x.video : null, x.poster?.startsWith("https://") ? x.poster : null, x.author ?? null, x.mode ?? null, x.duration ?? null, x.ratio ?? null, x.refs ?? 0, x.url).changes;
    }
    d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('library_import_bsp_v1', ?)").run(String(items.length));
  })();
  return n;
}

export function seedLibrary() {
  importExternalLibrary();
  const c = db().prepare("SELECT COUNT(*) c FROM prompt_library WHERE source_url IS NULL OR source_url NOT LIKE 'http%'").get() as { c: number };
  if (c.c > 0) return;
  const ins = db().prepare("INSERT INTO prompt_library (title, kind, model, category, prompt, notes, tags, inputs, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const rows: [string, string, string, string, string, string, string[], string[]][] = [
    ["Entrada do time com blocking 3D", "video", "seedance_2_5", "Blocking 3D",
      "Use the reference video ONLY as blocking: follow its character positions, paths, timing and camera move exactly. Red mannequin = team captain in a black and yellow kit; blue mannequins = teammates. Night stadium tunnel opening onto a floodlit pitch, light haze. Camera: low steadicam push-in at walking pace, 35mm anamorphic. Lighting: hard 5600K backlight from the floodlights, rim light on shoulders. Color grade: restrained teal & orange, lifted blacks, fine 35mm grain. Natural motion blur, consistent faces, stable anatomy.",
      "O vídeo de blocking define posição, tempo e câmera; o texto define aparência, luz e grading. Diga sempre o que cada cor representa.",
      ["steadicam", "contraluz", "teal & orange", "35mm"], ["Vídeo de blocking 3D", "Imagens de referência de personagem"]],
    ["Plano-sequência de produto em 3 planos", "video", "kling_o3_image_reference", "Multi-shot",
      "Premium product film for a matte black wireless headphone on a dark stone pedestal. Shot 1 (3s): extreme close-up macro slide along the ear cup, specular highlight travelling. Shot 2 (4s): slow 180° orbit at eye level, 85mm, soft top light and thin rim light. Shot 3 (3s): pull-back to a wide hero frame, light fog rolling. Color: deep blacks, warm amber accents, high contrast, no text.",
      "Use o roteiro multi-shot do Kling Omni: um plano por linha, com duração. Mande 2–4 fotos do produto como referência para manter forma e logo.",
      ["macro", "orbit", "produto", "low key"], ["Imagens de referência de personagem", "Só texto"]],
    ["Diálogo em plano e contraplano", "video", "seedance_2_5", "Diálogo",
      "Two people talk across a small kitchen table at night. Over-the-shoulder shot from behind the man onto the woman, 50mm, shallow depth of field. She says, in Brazilian Portuguese: \"Você não ia me contar?\" He stays silent. Practical tungsten lamp as key light, cool moonlight from the window as fill. Subtle handheld micro-movement. Grade: warm skin tones, cool shadows, soft contrast. Natural lip sync, no music.",
      "Para fala, escreva a frase exata entre aspas e o idioma. Um falante por plano evita lip sync trocado.",
      ["over-the-shoulder", "diálogo", "lip sync", "tungstênio"], ["Frame inicial"]],
    ["Paisagem com grua e golden hour", "video", "cinematic_studio_video_4_0", "Natureza / Paisagem",
      "Aerial crane-up reveal over a misty pine valley at golden hour. Start low behind tall grass in the foreground, rise slowly to reveal a winding river catching the sunlight. 24mm, deep focus. Warm low sun from the right, long shadows, volumetric haze. Color grade: Kodak 2383 print emulation, soft highlights. Calm, majestic, 8 seconds, ambient wind and birds.",
      "Comece com algo em primeiro plano para o movimento de câmera ter paralaxe. Um único movimento por plano.",
      ["grua", "golden hour", "paralaxe", "Kodak 2383"], ["Só texto"]],
  ];
  for (const r of rows) ins.run(r[0], r[1], r[2], r[3], r[4], r[5], JSON.stringify(r[6]), JSON.stringify(r[7]), "Mega — exemplo interno");
}
