import { handle, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugCode } from "@/lib/naming";

export const GET = handle(async () => {
  await requireUser();
  const rows = db().prepare(`
    SELECT p.*, u.name AS owner_name,
      (SELECT COUNT(*) FROM scenarios s WHERE s.project_id = p.id) AS scenarios,
      (SELECT COUNT(*) FROM scenes c WHERE c.project_id = p.id) AS scenes,
      (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id AND a.kind='image') AS images,
      (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id AND a.kind='video') AS videos,
      (SELECT COALESCE(SUM(credits),0) FROM generations g WHERE g.project_id = p.id AND g.status != 'failed') AS credits,
      (SELECT COALESCE(SUM(cost_usd),0) FROM generations g WHERE g.project_id = p.id AND g.status != 'failed') AS cost_usd,
      (SELECT COALESCE(SUM(amount),0) FROM credit_ledger l WHERE l.wallet_type = 'project' AND l.wallet_id = p.id) AS budget_balance,
      (SELECT COALESCE(a.thumb_url, a.url) FROM assets a WHERE a.project_id = p.id AND a.kind = 'image' ORDER BY a.approved DESC, a.favorite DESC, a.id DESC LIMIT 1) AS cover
    FROM projects p LEFT JOIN users u ON u.id = p.created_by
    ORDER BY p.status = 'arquivado', p.id DESC`).all();
  return Response.json({ projects: rows });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as { name?: string; code?: string; client?: string; description?: string; look?: string; aspect_ratio?: string; scenarios?: string[] };
  if (!b.name?.trim()) return Response.json({ error: "Dê um nome ao projeto" }, { status: 400 });
  const code = slugCode(b.code || b.name);
  const exists = db().prepare("SELECT 1 FROM projects WHERE code = ?").get(code);
  if (exists) return Response.json({ error: `Já existe um projeto com o código ${code}. Escolha outro código.` }, { status: 409 });
  const d = db();
  const id = d.transaction(() => {
    const info = d.prepare("INSERT INTO projects (name, code, client, description, look, aspect_ratio, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(b.name!.trim(), code, b.client || null, b.description || null, b.look || null, b.aspect_ratio || "16:9", user.id);
    const pid = Number(info.lastInsertRowid);
    (b.scenarios?.filter((s) => s.trim()) ?? []).forEach((name, i) => {
      const s = d.prepare("INSERT INTO scenarios (project_id, idx, name) VALUES (?, ?, ?)").run(pid, i + 1, name.trim());
      d.prepare("INSERT INTO scenes (project_id, scenario_id, idx, name) VALUES (?, ?, 1, 'Cena 1')").run(pid, s.lastInsertRowid);
    });
    return pid;
  })();
  return Response.json({ id, code });
});
