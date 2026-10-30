import { handle, HttpError, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { addEntry, balance, ledger, registerPurchase, usdPerCredit } from "@/lib/wallet";

/** Visão geral das carteiras para o gestor. */
export const GET = handle(async () => {
  await requireAdmin();
  const d = db();
  const purchased = d.prepare("SELECT COALESCE(SUM(amount),0) credits, COALESCE(SUM(usd),0) usd FROM credit_ledger WHERE wallet_type='company' AND kind='purchase'").get() as { credits: number; usd: number };
  const consumed = d.prepare("SELECT COALESCE(-SUM(amount),0) credits FROM credit_ledger WHERE wallet_type IN ('user','project','personal') AND kind IN ('debit','refund','adjust')").get() as { credits: number };
  const allocatedOpen = d.prepare("SELECT COALESCE(SUM(amount),0) c FROM credit_ledger WHERE wallet_type IN ('user','project')").get() as { c: number };
  const personalOpen = d.prepare("SELECT COALESCE(SUM(amount),0) c FROM credit_ledger WHERE wallet_type = 'personal'").get() as { c: number };
  const users = (d.prepare("SELECT id, name, department, monthly_allowance, active FROM users ORDER BY active DESC, name").all() as { id: number; name: string; department: string | null; monthly_allowance: number; active: number }[])
    .map((u) => ({ ...u, balance: balance("user", u.id), personal: balance("personal", u.id) }));
  const projects = (d.prepare("SELECT id, name, code, budget_enabled, status FROM projects ORDER BY status = 'arquivado', name").all() as { id: number; name: string; code: string; budget_enabled: number; status: string }[])
    .map((p) => {
      const g = d.prepare("SELECT COALESCE(SUM(amount),0) granted FROM credit_ledger WHERE wallet_type='project' AND wallet_id=? AND kind IN ('grant')").get(p.id) as { granted: number };
      const spent = d.prepare("SELECT COALESCE(SUM(credits),0) c, COALESCE(SUM(cost_usd),0) usd FROM generations WHERE project_id = ? AND status != 'failed'").get(p.id) as { c: number; usd: number };
      return { ...p, granted: g.granted, balance: balance("project", p.id), spent: spent.c, spentUsd: spent.usd };
    });
  return Response.json({
    usdPerCredit: usdPerCredit(),
    purchased, consumed: consumed.credits,
    openAllocations: allocatedOpen.c, openPersonal: personalOpen.c,
    users, projects,
    purchases: ledger("l.wallet_type = 'company'", [], 50),
    recent: ledger("l.wallet_type != 'company' AND l.kind IN ('grant','monthly','topup')", [], 50),
  });
});

/**
 * Ações do gestor:
 *  { action: "purchase", usd, credits, note }           → registra compra no Higgsfield (define US$/crédito)
 *  { action: "grant", target: "user"|"project", id, credits, note } → libera créditos (negativo = retira)
 *  { action: "allowance", userId, credits }             → cota mensal automática do funcionário
 *  { action: "budget", projectId, enabled }             → liga/desliga a verba própria do projeto
 */
export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin();
  const b = (await req.json()) as Record<string, unknown>;
  const d = db();
  switch (b.action) {
    case "purchase":
      registerPurchase(Number(b.usd), Number(b.credits), admin.id, (b.note as string) || undefined);
      break;
    case "grant": {
      const target = b.target as string;
      const id = Number(b.id);
      const credits = Math.round(Number(b.credits) * 100) / 100;
      if (!["user", "project"].includes(target) || !id) throw new HttpError(400, "Destino inválido");
      if (target === "user" && !d.prepare("SELECT 1 FROM users WHERE id = ?").get(id)) throw new HttpError(404, "Funcionário não encontrado");
      if (target === "project" && !d.prepare("SELECT 1 FROM projects WHERE id = ?").get(id)) throw new HttpError(404, "Projeto não encontrado");
      if (credits < 0 && balance(target as "user" | "project", id) + credits < 0) throw new HttpError(400, "Não é possível retirar mais do que o saldo disponível");
      d.transaction(() => {
        addEntry({ type: target as "user" | "project", id, amount: credits, kind: "grant", note: (b.note as string) || (credits > 0 ? "Créditos liberados pelo gestor" : "Créditos retirados pelo gestor"), by: admin.id });
        if (target === "project") d.prepare("UPDATE projects SET budget_enabled = 1 WHERE id = ?").run(id);
      })();
      break;
    }
    case "allowance": {
      const credits = Math.max(0, Math.round(Number(b.credits)));
      if (!Number.isFinite(credits)) throw new HttpError(400, "Valor inválido");
      d.prepare("UPDATE users SET monthly_allowance = ? WHERE id = ?").run(credits, Number(b.userId));
      break;
    }
    case "budget":
      d.prepare("UPDATE projects SET budget_enabled = ? WHERE id = ?").run(b.enabled ? 1 : 0, Number(b.projectId));
      break;
    default:
      throw new HttpError(400, "Ação inválida");
  }
  return Response.json({ ok: true, usdPerCredit: usdPerCredit() });
});
