import { HttpError } from "./auth";
import { db, getSettingNumber, setSetting } from "./db";

export type WalletType = "company" | "user" | "project" | "personal";
export type Wallet = { type: Exclude<WalletType, "company">; id: number };

const round = (n: number) => Math.round(n * 100) / 100;
export const currentPeriod = () => new Date().toISOString().slice(0, 7);

export function usdPerCredit() {
  return getSettingNumber("usd_per_credit", 0);
}

export function balance(type: WalletType, id: number): number {
  if (type === "user") ensureMonthlyAllowance(id);
  const r = db().prepare("SELECT COALESCE(SUM(amount),0) b FROM credit_ledger WHERE wallet_type = ? AND wallet_id = ?").get(type, id) as { b: number };
  return round(r.b);
}

/** Libera a cota mensal (uma única vez por mês, garantido pelo índice único). */
export function ensureMonthlyAllowance(userId: number) {
  const u = db().prepare("SELECT monthly_allowance, active FROM users WHERE id = ?").get(userId) as { monthly_allowance: number; active: number } | undefined;
  if (!u || !u.active || !u.monthly_allowance) return;
  db().prepare(
    `INSERT OR IGNORE INTO credit_ledger (wallet_type, wallet_id, amount, kind, period, note)
     VALUES ('user', ?, ?, 'monthly', ?, 'Cota mensal automática')`
  ).run(userId, u.monthly_allowance, currentPeriod());
}

export function addEntry(e: { type: WalletType; id: number; amount: number; kind: string; usd?: number | null; generationId?: number | null; note?: string | null; by?: number | null }) {
  if (!Number.isFinite(e.amount) || e.amount === 0) throw new HttpError(400, "Quantidade de créditos inválida");
  return db().prepare(
    `INSERT INTO credit_ledger (wallet_type, wallet_id, amount, kind, usd, generation_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(e.type, e.id, round(e.amount), e.kind, e.usd ?? null, e.generationId ?? null, e.note ?? null, e.by ?? null);
}

/** Compra de créditos no Higgsfield (ex.: US$ 100 = 1500 créditos). Recalcula o custo médio por crédito. */
export function registerPurchase(usd: number, credits: number, by: number, note?: string) {
  if (!(usd > 0) || !(credits > 0)) throw new HttpError(400, "Informe valor em dólar e créditos maiores que zero");
  addEntry({ type: "company", id: 0, amount: credits, kind: "purchase", usd, note, by });
  const r = db().prepare("SELECT SUM(usd) usd, SUM(amount) credits FROM credit_ledger WHERE wallet_type='company' AND kind='purchase'").get() as { usd: number; credits: number };
  if (r.credits > 0) setSetting("usd_per_credit", String(r.usd / r.credits));
}

/** Carteira padrão: verba do projeto (se ativada) senão a cota do funcionário. */
export function defaultWallet(userId: number, projectId: number | null): Wallet {
  if (projectId) {
    const p = db().prepare("SELECT budget_enabled FROM projects WHERE id = ?").get(projectId) as { budget_enabled: number } | undefined;
    if (p?.budget_enabled) return { type: "project", id: projectId };
  }
  return { type: "user", id: userId };
}

/** Valida a escolha de carteira feita pelo usuário. Créditos pessoais só podem ser usados pelo dono. */
export function resolveWallet(userId: number, projectId: number | null, choice?: "project" | "user" | "personal" | null): Wallet {
  if (!choice) return defaultWallet(userId, projectId);
  if (choice === "personal") return { type: "personal", id: userId };
  if (choice === "user") return { type: "user", id: userId };
  if (!projectId) throw new HttpError(400, "Selecione um projeto para usar a verba do projeto");
  const p = db().prepare("SELECT budget_enabled FROM projects WHERE id = ?").get(projectId) as { budget_enabled: number } | undefined;
  if (!p?.budget_enabled) throw new HttpError(400, "Este projeto não tem verba de créditos definida");
  return { type: "project", id: projectId };
}

export function walletLabel(w: Wallet) {
  if (w.type === "project") {
    const p = db().prepare("SELECT name FROM projects WHERE id = ?").get(w.id) as { name: string } | undefined;
    return `verba do projeto ${p?.name ?? ""}`.trim();
  }
  return w.type === "personal" ? "seus créditos pessoais" : "sua cota da empresa";
}

/**
 * Reserva (debita) créditos de forma atômica: confere saldo e debita na mesma transação,
 * então duas gerações simultâneas nunca deixam a carteira negativa.
 */
export function reserve(w: Wallet, credits: number, generationId: number, by: number) {
  if (w.type === "user") ensureMonthlyAllowance(w.id);
  const d = db();
  const run = () => {
    const bal = (d.prepare("SELECT COALESCE(SUM(amount),0) b FROM credit_ledger WHERE wallet_type = ? AND wallet_id = ?").get(w.type, w.id) as { b: number }).b;
    if (credits > 0 && bal + 1e-9 < credits) {
      throw new HttpError(402, `Saldo insuficiente na ${walletLabel(w)}: disponível ${round(bal)} créditos, esta geração custa ~${round(credits)}.`);
    }
    if (credits <= 0) return;
    addEntry({ type: w.type, id: w.id, amount: -credits, kind: "debit", usd: credits * usdPerCredit(), generationId, by });
  };
  // dentro de outra transação (ex.: junto com o INSERT da geração) roda direto; senão abre uma IMMEDIATE
  if (d.inTransaction) run();
  else d.transaction(run).immediate();
}

/** Ajusta a reserva para o custo final (estorno total quando final = 0). */
export function settle(generationId: number, finalCredits: number, reason: string) {
  const d = db();
  d.transaction(() => {
    const rows = d.prepare("SELECT wallet_type, wallet_id, SUM(amount) net FROM credit_ledger WHERE generation_id = ? AND wallet_type != 'company' GROUP BY wallet_type, wallet_id").all(generationId) as { wallet_type: WalletType; wallet_id: number; net: number }[];
    for (const r of rows) {
      const delta = round(-r.net - finalCredits); // net é negativo (débito)
      if (Math.abs(delta) < 0.005) continue;
      addEntry({ type: r.wallet_type, id: r.wallet_id, amount: delta, kind: finalCredits === 0 ? "refund" : "adjust", usd: delta * usdPerCredit(), generationId, note: reason });
    }
  }).immediate();
}

export function walletsFor(userId: number, projectId?: number | null) {
  const out: { type: Wallet["type"]; id: number; label: string; balance: number }[] = [
    { type: "user", id: userId, label: "Cota da empresa", balance: balance("user", userId) },
    { type: "personal", id: userId, label: "Créditos pessoais", balance: balance("personal", userId) },
  ];
  if (projectId) {
    const p = db().prepare("SELECT name, budget_enabled FROM projects WHERE id = ?").get(projectId) as { name: string; budget_enabled: number } | undefined;
    if (p?.budget_enabled) out.unshift({ type: "project", id: projectId, label: `Projeto ${p.name}`, balance: balance("project", projectId) });
  }
  return out;
}

export function ledger(where: string, params: unknown[], limit = 100) {
  return db().prepare(
    `SELECT l.*, u.name AS by_name, g.model, g.kind AS gen_kind, g.user_id AS gen_user_id, gu.name AS gen_user_name
     FROM credit_ledger l LEFT JOIN users u ON u.id = l.created_by
     LEFT JOIN generations g ON g.id = l.generation_id LEFT JOIN users gu ON gu.id = g.user_id
     WHERE ${where} ORDER BY l.id DESC LIMIT ${Math.min(limit, 1000)}`
  ).all(...params);
}
