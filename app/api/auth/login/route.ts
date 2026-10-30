import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { db, type UserRow } from "@/lib/db";

// Limite simples de tentativas por e-mail (proteção contra força bruta).
const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password) return Response.json({ error: "Informe e-mail e senha" }, { status: 400 });
  const key = email.trim().toLowerCase();
  const a = attempts.get(key);
  if (a && a.until > Date.now()) return Response.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });

  const user = db().prepare("SELECT * FROM users WHERE lower(email) = ?").get(key) as UserRow | undefined;
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(key, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return Response.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
  }
  attempts.delete(key);
  const token = await createSessionToken(user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // só "secure" quando a conexão é HTTPS: no computador local (http://localhost ou IP da rede) o cookie precisa funcionar em HTTP
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "1" : (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return Response.json({ ok: true, role: user.role });
}
