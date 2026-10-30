import { handle, HttpError, requireUser } from "@/lib/auth";
import { db, getSettingNumber } from "@/lib/db";
import { usdPerCredit } from "@/lib/wallet";

/** Funcionário pede recarga de créditos pessoais (pago do próprio bolso). O gestor confirma o pagamento. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const all = new URL(req.url).searchParams.get("scope") === "all" && user.role === "admin";
  const rows = db().prepare(`SELECT t.*, u.name AS user_name, d.name AS decided_by_name FROM topup_requests t
    JOIN users u ON u.id = t.user_id LEFT JOIN users d ON d.id = t.decided_by
    ${all ? "" : "WHERE t.user_id = ?"} ORDER BY t.status = 'pending' DESC, t.id DESC LIMIT 200`).all(...(all ? [] : [user.id]));
  return Response.json({ topups: rows, usdPerCredit: usdPerCredit(), minUsd: getSettingNumber("personal_topup_min_usd", 5) });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as { usd?: number; payment_ref?: string; note?: string };
  const usd = Math.round(Number(b.usd) * 100) / 100;
  const min = getSettingNumber("personal_topup_min_usd", 5);
  if (!Number.isFinite(usd) || usd < min) throw new HttpError(400, `Valor mínimo de recarga: US$ ${min.toFixed(2)}`);
  if (usd > 5000) throw new HttpError(400, "Valor máximo por pedido: US$ 5.000");
  const rate = usdPerCredit();
  if (!(rate > 0)) throw new HttpError(400, "O gestor ainda não definiu o valor do crédito");
  const credits = Math.floor((usd / rate) * 100) / 100;
  const info = db().prepare("INSERT INTO topup_requests (user_id, usd, credits, payment_ref, note) VALUES (?, ?, ?, ?, ?)").run(user.id, usd, credits, b.payment_ref || null, b.note || null);
  return Response.json({ id: Number(info.lastInsertRowid), credits });
});
