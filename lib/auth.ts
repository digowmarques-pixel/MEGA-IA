import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db, type UserRow } from "./db";

export const SESSION_COOKIE = "hub_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-troque-em-producao");

export type SessionUser = Pick<UserRow, "id" | "name" | "email" | "role" | "department" | "monthly_allowance">;

export async function createSessionToken(userId: number) {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.uid === "number" ? payload.uid : null;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const uid = await verifySessionToken(token);
  if (!uid) return null;
  const user = db()
    .prepare("SELECT id, name, email, role, department, monthly_allowance FROM users WHERE id = ? AND active = 1")
    .get(uid) as SessionUser | undefined;
  return user ?? null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new HttpError(401, "Não autenticado");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new HttpError(403, "Acesso restrito ao gestor");
  return u;
}

/** Wrapper para route handlers: converte HttpError em resposta JSON. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "Erro interno" }, { status: 500 });
    }
  };
}
