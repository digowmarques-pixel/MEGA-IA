import { handle, requireAdmin } from "@/lib/auth";
import { higgsfield, higgsfieldMode } from "@/lib/provider";
import { higgsfieldTransactions } from "@/lib/providers/higgsfield-mcp";

/** Saldo real e extrato da conta Higgsfield (conciliação com o que o Hub registrou). */
export const GET = handle(async (req: Request) => {
  await requireAdmin();
  const mode = higgsfieldMode();
  const size = Number(new URL(req.url).searchParams.get("size") || 50);
  const out: Record<string, unknown> = { mode };
  try { out.balance = await higgsfield().balance(); } catch (e) { out.balanceError = String(e instanceof Error ? e.message : e); }
  if (mode === "mcp") {
    try { out.transactions = await higgsfieldTransactions(size); } catch (e) { out.transactionsError = String(e instanceof Error ? e.message : e); }
  }
  return Response.json(out);
});
