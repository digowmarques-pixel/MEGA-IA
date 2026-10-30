import bcrypt from "bcryptjs";
import { handle, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { balance } from "@/lib/wallet";

export const GET = handle(async () => {
  await requireAdmin();
  const users = db().prepare(`SELECT u.id, u.name, u.email, u.role, u.department, u.monthly_allowance, u.active, u.created_at,
      (SELECT COALESCE(SUM(credits),0) FROM generations g WHERE g.user_id = u.id AND g.status != 'failed'
        AND strftime('%Y-%m', g.created_at) = strftime('%Y-%m','now')) AS month_credits,
      (SELECT MAX(created_at) FROM generations g WHERE g.user_id = u.id) AS last_activity
    FROM users u ORDER BY u.active DESC, u.name`).all() as { id: number }[];
  return Response.json({ users: users.map((u) => ({ ...u, balance: balance("user", u.id), personal: balance("personal", u.id) })) });
});

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = (await req.json()) as { name?: string; email?: string; password?: string; role?: string; department?: string; monthly_allowance?: number };
  if (!b.name?.trim() || !b.email?.trim()) return Response.json({ error: "Nome e e-mail são obrigatórios" }, { status: 400 });
  if (!b.password || b.password.length < 8) return Response.json({ error: "Senha inicial com pelo menos 8 caracteres" }, { status: 400 });
  const email = b.email.trim().toLowerCase();
  if (db().prepare("SELECT 1 FROM users WHERE lower(email) = ?").get(email)) return Response.json({ error: "E-mail já cadastrado" }, { status: 409 });
  const info = db().prepare("INSERT INTO users (name, email, password_hash, role, department, monthly_allowance) VALUES (?, ?, ?, ?, ?, ?)")
    .run(b.name.trim(), email, bcrypt.hashSync(b.password, 10), b.role === "admin" ? "admin" : "member", b.department || null, Math.max(0, Math.round(Number(b.monthly_allowance) || 0)));
  return Response.json({ id: Number(info.lastInsertRowid) });
});
