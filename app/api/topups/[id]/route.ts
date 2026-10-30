import { handle, HttpError, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addEntry } from "@/lib/wallet";

type Row = { id: number; user_id: number; usd: number; credits: number; status: string };

/** approve / reject (gestor) ou cancel (dono, enquanto pendente). */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = Number((await ctx.params).id);
  const { action, note } = (await req.json()) as { action: "approve" | "reject" | "cancel"; note?: string };
  const d = db();
  d.transaction(() => {
    const t = d.prepare("SELECT * FROM topup_requests WHERE id = ?").get(id) as Row | undefined;
    if (!t) throw new HttpError(404, "Pedido não encontrado");
    if (t.status !== "pending") throw new HttpError(409, "Este pedido já foi processado");
    if (action === "cancel") {
      if (t.user_id !== user.id) throw new HttpError(403, "Só quem pediu pode cancelar");
      d.prepare("UPDATE topup_requests SET status='canceled', decided_at=datetime('now') WHERE id=?").run(id);
      return;
    }
    if (user.role !== "admin") throw new HttpError(403, "Restrito ao gestor");
    if (action === "approve") {
      addEntry({ type: "personal", id: t.user_id, amount: t.credits, kind: "topup", usd: t.usd, note: `Recarga pessoal #${id}${note ? " — " + note : ""}`, by: user.id });
      d.prepare("UPDATE topup_requests SET status='approved', decided_by=?, decided_at=datetime('now'), note=COALESCE(?, note) WHERE id=?").run(user.id, note || null, id);
    } else if (action === "reject") {
      d.prepare("UPDATE topup_requests SET status='rejected', decided_by=?, decided_at=datetime('now'), note=COALESCE(?, note) WHERE id=?").run(user.id, note || null, id);
    } else throw new HttpError(400, "Ação inválida");
  }).immediate();
  return Response.json({ ok: true });
});
