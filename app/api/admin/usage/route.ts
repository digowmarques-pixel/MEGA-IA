import { handle, requireAdmin } from "@/lib/auth";
import { db, getSettingNumber } from "@/lib/db";
import { balance, usdPerCredit } from "@/lib/wallet";

/** Consumo e financeiro do gestor. ?month=YYYY-MM (padrão: mês atual) &months=6 (histórico) */
export const GET = handle(async (req: Request) => {
  await requireAdmin();
  const q = new URL(req.url).searchParams;
  const month = /^\d{4}-\d{2}$/.test(q.get("month") || "") ? q.get("month")! : new Date().toISOString().slice(0, 7);
  const months = Math.min(Math.max(Number(q.get("months") || 6), 1), 24);
  const d = db();
  const OK = "g.status != 'failed'";
  const IN_MONTH = "strftime('%Y-%m', g.created_at) = ?";

  const history = d.prepare(`SELECT strftime('%Y-%m', g.created_at) month, u.id user_id, u.name, COALESCE(SUM(g.credits),0) credits, COALESCE(SUM(g.cost_usd),0) usd, COUNT(*) n
    FROM generations g JOIN users u ON u.id = g.user_id
    WHERE ${OK} AND strftime('%Y-%m', g.created_at) > strftime('%Y-%m', date(? || '-01', '-' || ? || ' months'))
      AND strftime('%Y-%m', g.created_at) <= ?
    GROUP BY month, u.id ORDER BY month`).all(month, months, month);

  const perUser = d.prepare(`SELECT u.id, u.name, u.email, u.department, u.monthly_allowance, u.active,
      COALESCE(SUM(CASE WHEN ${OK} THEN g.credits END),0) credits,
      COALESCE(SUM(CASE WHEN ${OK} THEN g.cost_usd END),0) usd,
      COALESCE(SUM(CASE WHEN ${OK} AND g.wallet_type = 'user' THEN g.credits END),0) from_allowance,
      COALESCE(SUM(CASE WHEN ${OK} AND g.wallet_type = 'project' THEN g.credits END),0) from_projects,
      COALESCE(SUM(CASE WHEN ${OK} AND g.wallet_type = 'personal' THEN g.credits END),0) from_personal,
      COUNT(g.id) generations,
      SUM(CASE WHEN g.status = 'failed' THEN 1 ELSE 0 END) failed,
      SUM(CASE WHEN g.kind IN ('image','avatar') AND g.status='completed' THEN 1 ELSE 0 END) images,
      SUM(CASE WHEN g.kind = 'video' AND g.status='completed' THEN 1 ELSE 0 END) videos,
      SUM(CASE WHEN g.kind = 'audio' AND g.status='completed' THEN 1 ELSE 0 END) audios,
      SUM(CASE WHEN g.kind LIKE 'upscale%' AND g.status='completed' THEN 1 ELSE 0 END) upscales
    FROM users u LEFT JOIN generations g ON g.user_id = u.id AND ${IN_MONTH}
    GROUP BY u.id ORDER BY credits DESC`).all(month) as { id: number; credits: number; usd: number; from_personal: number }[];

  const claude = d.prepare(`SELECT user_id, COALESCE(SUM(cost_usd),0) usd, COUNT(*) n FROM ai_usage WHERE strftime('%Y-%m', created_at) = ? GROUP BY user_id`).all(month) as { user_id: number; usd: number; n: number }[];
  const claudeBy = new Map(claude.map((c) => [c.user_id, c]));

  const byKind = d.prepare(`SELECT g.kind, COALESCE(SUM(g.credits),0) credits, COALESCE(SUM(g.cost_usd),0) usd, COUNT(*) n FROM generations g WHERE ${OK} AND ${IN_MONTH} GROUP BY g.kind ORDER BY credits DESC`).all(month);
  const byModel = d.prepare(`SELECT g.model, COALESCE(SUM(g.credits),0) credits, COALESCE(SUM(g.cost_usd),0) usd, COUNT(*) n FROM generations g WHERE ${OK} AND ${IN_MONTH} GROUP BY g.model ORDER BY credits DESC LIMIT 12`).all(month);
  const byWallet = d.prepare(`SELECT g.wallet_type, COALESCE(SUM(g.credits),0) credits, COALESCE(SUM(g.cost_usd),0) usd FROM generations g WHERE ${OK} AND ${IN_MONTH} GROUP BY g.wallet_type`).all(month);
  const projects = (d.prepare(`SELECT p.id, p.name, p.code, p.budget_enabled,
      COALESCE(SUM(CASE WHEN ${IN_MONTH} THEN g.credits END),0) month_credits,
      COALESCE(SUM(CASE WHEN ${IN_MONTH} THEN g.cost_usd END),0) month_usd,
      COALESCE(SUM(g.credits),0) total_credits, COALESCE(SUM(g.cost_usd),0) total_usd, COUNT(g.id) n
    FROM projects p LEFT JOIN generations g ON g.project_id = p.id AND ${OK}
    GROUP BY p.id ORDER BY month_credits DESC, total_credits DESC`).all(month, month) as { id: number; budget_enabled: number }[])
    .map((p) => {
      const granted = (d.prepare("SELECT COALESCE(SUM(amount),0) c FROM credit_ledger WHERE wallet_type='project' AND wallet_id=? AND kind='grant'").get(p.id) as { c: number }).c;
      return { ...p, granted, balance: p.budget_enabled ? balance("project", p.id) : null };
    });
  const daily = d.prepare(`SELECT strftime('%d', g.created_at) day, COALESCE(SUM(g.credits),0) credits, COALESCE(SUM(g.cost_usd),0) usd FROM generations g
    WHERE ${OK} AND ${IN_MONTH} GROUP BY day ORDER BY day`).all(month);
  const failed = d.prepare(`SELECT COUNT(*) n FROM generations g WHERE g.status = 'failed' AND ${IN_MONTH}`).get(month) as { n: number };
  const purchases = d.prepare(`SELECT COALESCE(SUM(amount),0) credits, COALESCE(SUM(usd),0) usd FROM credit_ledger WHERE wallet_type='company' AND kind='purchase' AND strftime('%Y-%m', created_at) = ?`).get(month) as { credits: number; usd: number };
  const topups = d.prepare(`SELECT COALESCE(SUM(amount),0) credits, COALESCE(SUM(usd),0) usd FROM credit_ledger WHERE wallet_type='personal' AND kind='topup' AND strftime('%Y-%m', created_at) = ?`).get(month) as { credits: number; usd: number };

  const genCredits = perUser.reduce((s, r) => s + r.credits, 0);
  const genUsd = perUser.reduce((s, r) => s + r.usd, 0);
  const personalCredits = perUser.reduce((s, r) => s + r.from_personal, 0);
  const claudeUsd = claude.reduce((s, c) => s + c.usd, 0);
  const total = genUsd + claudeUsd;

  const now = new Date();
  const isCurrent = month === now.toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const projection = isCurrent ? (total / Math.max(now.getDate(), 1)) * daysInMonth : total;

  return Response.json({
    month,
    history,
    perUser: perUser.map((u) => ({ ...u, balance: balance("user", u.id), personal: balance("personal", u.id), claude_usd: claudeBy.get(u.id)?.usd ?? 0, claude_calls: claudeBy.get(u.id)?.n ?? 0 })),
    byKind, byModel, byWallet, projects, daily,
    finance: {
      usdPerCredit: usdPerCredit(),
      genCredits, genUsd, personalCredits, personalUsd: personalCredits * usdPerCredit(),
      companyUsd: genUsd - personalCredits * usdPerCredit(),
      claudeUsd, total, projection, daysInMonth,
      budget: getSettingNumber("monthly_budget_usd", 0),
      purchases, topups, failed: failed.n,
      usdBrl: getSettingNumber("usd_brl", 0),
    },
  });
});
