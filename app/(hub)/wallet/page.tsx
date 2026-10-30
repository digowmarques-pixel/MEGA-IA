"use client";

import { Building2, Coins, KeyRound, PiggyBank } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Modal, Spinner, Stat, useToast } from "@/components/ui";
import { api, fmtCredits, fmtDate, fmtUsd } from "@/lib/client";

type Entry = { id: number; wallet_type: string; amount: number; kind: string; usd: number | null; note: string | null; created_at: string; model: string | null; by_name: string | null };
type Topup = { id: number; usd: number; credits: number; status: string; payment_ref: string | null; note: string | null; created_at: string };

const KIND: Record<string, string> = { grant: "Liberado pelo gestor", monthly: "Cota mensal", topup: "Recarga pessoal", debit: "Geração", refund: "Estorno", adjust: "Ajuste de custo" };
const STATUS: Record<string, string> = { pending: "Aguardando gestor", approved: "Aprovada", rejected: "Recusada", canceled: "Cancelada" };

export default function WalletPage() {
  const toast = useToast();
  const [stats, setStats] = useState<{ wallets: { user: number; personal: number }; monthlyAllowance: number; usdPerCredit: number; ledger: Entry[] } | null>(null);
  const [topups, setTopups] = useState<{ topups: Topup[]; usdPerCredit: number; minUsd: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [usd, setUsd] = useState("20");
  const [ref, setRef] = useState("");
  const [pw, setPw] = useState({ current: "", next: "" });

  const load = () => {
    api<typeof stats>("/api/me/stats").then(setStats).catch(() => {});
    api<typeof topups>("/api/topups").then(setTopups).catch(() => {});
  };
  useEffect(load, []);

  const credits = topups ? Math.floor((Number(usd.replace(",", ".")) / topups.usdPerCredit) * 100) / 100 : 0;

  async function request() {
    try {
      await api("/api/topups", { method: "POST", json: { usd: Number(usd.replace(",", ".")), payment_ref: ref } });
      toast("ok", "Pedido enviado ao gestor");
      setOpen(false); setRef(""); load();
    } catch (e) { toast("err", e instanceof Error ? e.message : "Erro"); }
  }

  if (!stats || !topups) return <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Minha carteira" subtitle="Seus saldos, extrato e recargas pessoais"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><PiggyBank className="h-4 w-4" />Recarregar créditos pessoais</button>} />
      <div className="space-y-6 p-6">
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Cota da empresa" value={fmtCredits(stats.wallets.user)} sub={stats.monthlyAllowance ? `+${fmtCredits(stats.monthlyAllowance)} créditos no início de cada mês` : "Créditos liberados pelo gestor"} accent />
          <Stat label="Créditos pessoais" value={fmtCredits(stats.wallets.personal)} sub="Só você pode usar. Escolha 'Créditos pessoais' na hora de gerar." />
          <Stat label="Valor do crédito" value={fmtUsd(stats.usdPerCredit)} sub={`US$ 10 ≈ ${fmtCredits(Math.floor(10 / stats.usdPerCredit))} créditos`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="card lg:col-span-3">
            <div className="border-b border-line px-4 py-3 text-sm font-bold">Extrato</div>
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {stats.ledger.length === 0 && <tr><td className="p-6 text-center text-muted">Sem movimentações.</td></tr>}
                  {stats.ledger.map((e) => (
                    <tr key={e.id} className="border-b border-line/60">
                      <td className="px-4 py-2 text-xs text-muted">{fmtDate(e.created_at)}</td>
                      <td className="px-2 py-2">{e.wallet_type === "personal" ? <KeyRound className="h-3.5 w-3.5 text-mega-amber" /> : <Building2 className="h-3.5 w-3.5 text-muted" />}</td>
                      <td className="px-2 py-2"><div>{KIND[e.kind] ?? e.kind}{e.model ? <span className="text-muted"> · {e.model}</span> : ""}</div>{e.note && <div className="text-[11px] text-muted">{e.note}</div>}</td>
                      <td className={`px-4 py-2 text-right font-semibold tabular-nums ${e.amount > 0 ? "text-mega-yellow" : "text-soft"}`}>{e.amount > 0 ? "+" : ""}{fmtCredits(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="card">
              <div className="border-b border-line px-4 py-3 text-sm font-bold">Minhas recargas</div>
              {topups.topups.length === 0 ? <p className="p-4 text-sm text-muted">Nenhum pedido ainda.</p> : topups.topups.map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-line/60 px-4 py-2.5 text-sm">
                  <div><div className="font-semibold">{fmtUsd(t.usd)} → {fmtCredits(t.credits)} cr</div><div className="text-[11px] text-muted">{fmtDate(t.created_at)}{t.note ? ` · ${t.note}` : ""}</div></div>
                  <div className="flex items-center gap-2">
                    <span className={`chip ${t.status === "approved" ? "chip-active" : t.status === "rejected" ? "!text-red-400" : ""}`}>{STATUS[t.status]}</span>
                    {t.status === "pending" && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => api(`/api/topups/${t.id}`, { method: "PATCH", json: { action: "cancel" } }).then(load)}>Cancelar</button>}
                  </div>
                </div>
              ))}
            </div>
            <div className="card p-4">
              <div className="mb-3 text-sm font-bold">Trocar senha</div>
              <input type="password" className="input mb-2" placeholder="Senha atual" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
              <input type="password" className="input mb-2" placeholder="Nova senha (mín. 8)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
              <button className="btn-outline w-full" disabled={!pw.current || pw.next.length < 8} onClick={() => api("/api/auth/me", { method: "PATCH", json: pw }).then(() => { toast("ok", "Senha alterada"); setPw({ current: "", next: "" }); }).catch((e) => toast("err", e.message))}>Salvar nova senha</button>
            </div>
          </div>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Recarga de créditos pessoais" footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={!(credits > 0) || Number(usd.replace(",", ".")) < topups.minUsd} onClick={request}><Coins className="h-4 w-4" />Enviar pedido</button></>}>
        <div className="space-y-3">
          <p className="text-sm text-soft">Créditos pessoais são pagos por você e <b className="text-white">só você pode usá-los</b>. Faça o pagamento para a empresa (Pix/transferência) e informe o comprovante; o gestor confirma e os créditos caem na sua carteira.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Valor (US$)</label><input className="input" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} /></div>
            <div><label className="label">Você recebe</label><div className="input font-bold text-mega-yellow">{fmtCredits(credits)} créditos</div></div>
          </div>
          <div className="flex gap-1.5">{[10, 20, 50, 100].map((v) => <button key={v} className="chip" onClick={() => setUsd(String(v))}>US$ {v}</button>)}</div>
          <div><label className="label">Comprovante / ID do Pix (opcional)</label><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          <p className="text-[11px] text-muted">Valor mínimo US$ {topups.minUsd}. Cotação: {fmtUsd(topups.usdPerCredit)} por crédito.</p>
        </div>
      </Modal>
    </div>
  );
}
