import { handle, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAssets } from "@/lib/assets";
import { balance, usdPerCredit, ledger } from "@/lib/wallet";

export const GET = handle(async () => {
  const u = await requireUser();
  const d = db();
  const month = `strftime('%Y-%m', created_at) = strftime('%Y-%m','now')`;
  const spent = d.prepare(`SELECT COALESCE(SUM(credits),0) credits, COALESCE(SUM(cost_usd),0) usd, COUNT(*) n FROM generations WHERE user_id = ? AND status != 'failed' AND ${month}`).get(u.id);
  const byKind = d.prepare(`SELECT kind, COUNT(*) n, COALESCE(SUM(credits),0) credits FROM generations WHERE user_id = ? AND status != 'failed' AND ${month} GROUP BY kind`).all(u.id);
  const byWallet = d.prepare(`SELECT wallet_type, COALESCE(SUM(credits),0) credits FROM generations WHERE user_id = ? AND status != 'failed' AND ${month} GROUP BY wallet_type`).all(u.id);
  const daily = d.prepare(`SELECT strftime('%d', created_at) day, COALESCE(SUM(credits),0) credits FROM generations WHERE user_id = ? AND status != 'failed' AND ${month} GROUP BY day ORDER BY day`).all(u.id);
  const projects = d.prepare(`SELECT p.id, p.name, p.code, MAX(g.created_at) last FROM generations g JOIN projects p ON p.id = g.project_id
    WHERE g.user_id = ? GROUP BY p.id ORDER BY last DESC LIMIT 6`).all(u.id);
  return Response.json({
    wallets: { user: balance("user", u.id), personal: balance("personal", u.id) },
    monthlyAllowance: u.monthly_allowance,
    usdPerCredit: usdPerCredit(),
    spent, byKind, byWallet, daily, projects,
    ledger: ledger("(l.wallet_type IN ('user','personal') AND l.wallet_id = ?)", [u.id], 30),
    recent: getAssets("a.user_id = ? AND a.source = 'generated'", [u.id]).slice(0, 12),
  });
});
