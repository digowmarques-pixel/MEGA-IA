import bcrypt from "bcryptjs";
import { handle, HttpError, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireAdmin();
  const id = Number((await ctx.params).id);
  if (!db().prepare("SELECT 1 FROM users WHERE id = ?").get(id)) throw new HttpError(404, "Usuário não encontrado");
  const b = (await req.json()) as { name?: string; email?: string; role?: string; department?: string; monthly_allowance?: number; active?: boolean; password?: string };
  if (id === me.id && (b.active === false || (b.role && b.role !== "admin"))) throw new HttpError(400, "Você não pode desativar nem rebaixar a própria conta");
  const d = db();
  if (b.name !== undefined) d.prepare("UPDATE users SET name = ? WHERE id = ?").run(b.name.trim(), id);
  if (b.email !== undefined) {
    const email = b.email.trim().toLowerCase();
    if (d.prepare("SELECT 1 FROM users WHERE lower(email) = ? AND id != ?").get(email, id)) throw new HttpError(409, "E-mail já usado");
    d.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, id);
  }
  if (b.role !== undefined) d.prepare("UPDATE users SET role = ? WHERE id = ?").run(b.role === "admin" ? "admin" : "member", id);
  if (b.department !== undefined) d.prepare("UPDATE users SET department = ? WHERE id = ?").run(b.department || null, id);
  if (b.monthly_allowance !== undefined) d.prepare("UPDATE users SET monthly_allowance = ? WHERE id = ?").run(Math.max(0, Math.round(Number(b.monthly_allowance) || 0)), id);
  if (b.active !== undefined) d.prepare("UPDATE users SET active = ? WHERE id = ?").run(b.active ? 1 : 0, id);
  if (b.password) {
    if (b.password.length < 8) throw new HttpError(400, "Senha com pelo menos 8 caracteres");
    d.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(b.password, 10), id);
  }
  return Response.json({ ok: true });
});
