import { handle, requireUser } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const GET = handle(async () => Response.json({ user: await requireUser() }));

/** Troca de senha do próprio usuário. */
export const PATCH = handle(async (req: Request) => {
  const u = await requireUser();
  const { current, next } = (await req.json()) as { current?: string; next?: string };
  if (!next || next.length < 8) return Response.json({ error: "A nova senha precisa ter ao menos 8 caracteres" }, { status: 400 });
  const row = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(u.id) as { password_hash: string };
  if (!current || !bcrypt.compareSync(current, row.password_hash)) return Response.json({ error: "Senha atual incorreta" }, { status: 400 });
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(next, 10), u.id);
  return Response.json({ ok: true });
});
