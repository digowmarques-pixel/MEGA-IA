import { handle, HttpError, requireUser } from "@/lib/auth";
import { ledger } from "@/lib/wallet";

/** Extrato. Funcionário: só as próprias carteiras. Gestor: qualquer carteira (?type=&id=). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  const type = q.get("type") || "user";
  const id = Number(q.get("id") || user.id);
  if (!["user", "personal", "project", "company"].includes(type)) throw new HttpError(400, "Carteira inválida");
  if (user.role !== "admin") {
    if (type === "company") throw new HttpError(403, "Restrito ao gestor");
    if ((type === "user" || type === "personal") && id !== user.id) throw new HttpError(403, "Sem acesso");
  }
  return Response.json({ entries: ledger("l.wallet_type = ? AND l.wallet_id = ?", [type, id], Number(q.get("limit") || 100)) });
});
