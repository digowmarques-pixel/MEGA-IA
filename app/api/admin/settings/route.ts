import { handle, requireAdmin } from "@/lib/auth";
import { db, setSetting } from "@/lib/db";

const NUMERIC = ["usd_per_credit", "monthly_budget_usd", "usd_brl", "elevenlabs_usd_per_1k_chars", "personal_topup_min_usd"];

export const GET = handle(async () => {
  await requireAdmin();
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Response.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

export const PUT = handle(async (req: Request) => {
  await requireAdmin();
  const b = (await req.json()) as Record<string, string | number>;
  for (const [k, v] of Object.entries(b)) {
    if (NUMERIC.includes(k)) {
      const n = Number(String(v).replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return Response.json({ error: `Valor inválido para ${k}` }, { status: 400 });
      setSetting(k, String(n));
    } else if (k === "company_name") setSetting(k, String(v).slice(0, 60));
  }
  return Response.json({ ok: true });
});
