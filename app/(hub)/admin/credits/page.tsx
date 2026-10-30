"use client";

import { AlertTriangle, Check, Coins, FolderKanban, PiggyBank, Plus, RefreshCw, ShoppingCart, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Modal, Spinner, Stat, useToast } from "@/components/ui";
import { api, fmtCredits, fmtDate, fmtUsd } from "@/lib/client";

type Overview = {
  usdPerCredit: number;
  purchased: { credits: number; usd: number };
  consumed: number;
  openAllocations: number;
  openPersonal: number;
  users: { id: number; name: string; department: string | null; monthly_allowance: number; active: number; balance: number; personal: number }[];
  projects: { id: number; name: string; code: string; budget_enabled: number; status: string; granted: number; balance: number; spent: number; spentUsd: number }[];
  purchases: { id: number; amount: number; usd: number; note: string | null; created_at: string; by_name: string | null }[];
};
type Topup = { id: number; user_name: string; usd: number; credits: number; status: string; payment_ref: string | null; created_at: string };
type Higgs = { mode: string; balance?: { credits: number | null; plan?: string }; transactions?: { display_name: string; credits: number; action: string; created_at: string }[]; balanceError?: string };

// Pacotes avulsos do Higgsfield (consultados na conta em 30/10/2026 — créditos expiram em 90 dias)
const PACKS = [
  { credits: 500, usd: 24.65 },
  { credits: 1000, usd: 47.6 },
  { credits: 2000, usd: 89.25 },
  { credits: 4000, usd: 179.35 },
];

export default function AdminCredits() {
  const toast = useToast();
  const [o, setO] = useState<Overview | null>(null);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [higgs, setHiggs] = useState<Higgs | null>(null);
  const [purchase, setPurchase] = useState<{ usd: string; credits: string; note: string } | null>(null);
  const [grant, setGrant] = useState<{ target: "user" | "project"; id: number; name: string; credits: string; note: string } | null>(null);

  const load = useCallback(() => {
    api<Overview>("/api/admin/credits").then(setO).catch(() => {});
    api<{ topups: Topup[] }>("/api/topups?scope=all").then((r) => setTopups(r.topups)).catch(() => {});
  }, []);
  useEffect(() => { load(); api<Higgs>("/api/admin/higgsfield?size=30").then(setHiggs).catch(() => {}); }, [load]);

  const act = async (body: Record<string, unknown>, ok: string) => {
    try { await api("/api/admin/credits", { method: "POST", json: body }); toast("ok", ok); load(); return true; }
    catch (e) { toast("err", e instanceof Error ? e.message : "Erro"); return false; }
  };

  if (!o) return <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  const realBalance = higgs?.balance?.credits ?? null;
  const committed = o.openAllocations + o.openPersonal;
  const overCommitted = realBalance !== null && committed > realBalance;
  const pending = topups.filter((t) => t.status === "pending");

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Créditos e verbas" subtitle="Compras no Higgsfield, cotas dos funcionários, verbas por projeto e recargas pessoais"
        actions={<button className="btn-primary" onClick={() => setPurchase({ usd: "89.25", credits: "2000", note: "" })}><ShoppingCart className="h-4 w-4" />Registrar compra</button>} />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Saldo real no Higgsfield" value={realBalance !== null ? fmtCredits(realBalance) : higgs?.mode === "mock" ? "simulação" : "—"} sub={higgs?.balance?.plan ? `plano ${higgs.balance.plan}` : higgs?.balanceError ? "não foi possível consultar" : undefined} accent />
          <Stat label="Valor do crédito" value={fmtUsd(o.usdPerCredit)} sub="média ponderada das compras" />
          <Stat label="Comprado (registrado)" value={fmtCredits(o.purchased.credits)} sub={fmtUsd(o.purchased.usd)} />
          <Stat label="Distribuído e não usado" value={fmtCredits(o.openAllocations)} sub="cotas + verbas de projeto" />
          <Stat label="Pessoais em aberto" value={fmtCredits(o.openPersonal)} sub="pagos pelos funcionários" />
        </div>
        {overCommitted && (
          <div className="flex items-center gap-2 rounded-lg border border-mega-orange/40 bg-mega-orange/5 px-4 py-2.5 text-sm text-mega-orange">
            <AlertTriangle className="h-4 w-4 shrink-0" />Você distribuiu {fmtCredits(committed)} créditos, mas a conta Higgsfield tem {fmtCredits(realBalance)}. Compre mais créditos ou reduza cotas para não travar gerações.
          </div>
        )}

        {pending.length > 0 && (
          <div className="card border-mega-amber/40">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-bold"><PiggyBank className="h-4 w-4 text-mega-yellow" />Recargas pessoais aguardando confirmação ({pending.length})</div>
            {pending.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-2.5 text-sm">
                <div className="min-w-48 flex-1"><b>{t.user_name}</b> · {fmtUsd(t.usd)} → <b className="text-mega-yellow">{fmtCredits(t.credits)} cr</b><div className="text-[11px] text-muted">{fmtDate(t.created_at)}{t.payment_ref ? ` · comprovante: ${t.payment_ref}` : ""}</div></div>
                <button className="btn-primary !py-1.5 text-xs" onClick={() => api(`/api/topups/${t.id}`, { method: "PATCH", json: { action: "approve" } }).then(() => { toast("ok", "Créditos liberados"); load(); }).catch((e) => toast("err", e.message))}><Check className="h-3.5 w-3.5" />Pagamento recebido</button>
                <button className="btn-danger !py-1.5 text-xs" onClick={() => api(`/api/topups/${t.id}`, { method: "PATCH", json: { action: "reject" } }).then(load)}><X className="h-3.5 w-3.5" />Recusar</button>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-bold"><Users className="h-4 w-4 text-muted" />Cotas dos funcionários</div>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr className="border-b border-line"><th className="px-4 py-2">Funcionário</th><th className="px-2 py-2">Cota mensal</th><th className="px-2 py-2 text-right">Saldo</th><th className="px-2 py-2 text-right">Pessoal</th><th className="px-4 py-2" /></tr></thead>
              <tbody>
                {o.users.filter((u) => u.active).map((u) => (
                  <tr key={u.id} className="border-b border-line/60">
                    <td className="px-4 py-2"><div className="font-semibold">{u.name}</div><div className="text-[11px] text-muted">{u.department || "—"}</div></td>
                    <td className="px-2 py-2"><AllowanceInput value={u.monthly_allowance} onSave={(credits) => act({ action: "allowance", userId: u.id, credits }, "Cota mensal atualizada")} /></td>
                    <td className={`px-2 py-2 text-right font-bold tabular-nums ${u.balance <= 0 ? "text-red-400" : "text-mega-yellow"}`}>{fmtCredits(u.balance)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-soft">{fmtCredits(u.personal)}</td>
                    <td className="px-4 py-2 text-right"><button className="btn-outline !px-2 !py-1 text-xs" onClick={() => setGrant({ target: "user", id: u.id, name: u.name, credits: "100", note: "" })}><Plus className="h-3 w-3" />Créditos</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2.5 text-[11px] text-muted">A cota mensal entra automaticamente no 1º uso de cada mês e acumula com o saldo. Use “Créditos” para extras pontuais (valor negativo retira).</p>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-bold"><FolderKanban className="h-4 w-4 text-muted" />Verbas por projeto</div>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr className="border-b border-line"><th className="px-4 py-2">Projeto</th><th className="px-2 py-2 text-right">Verba / restante</th><th className="px-2 py-2 text-right">Gasto total</th><th className="px-4 py-2" /></tr></thead>
              <tbody>
                {o.projects.filter((p) => p.status !== "arquivado").map((p) => (
                  <tr key={p.id} className="border-b border-line/60">
                    <td className="px-4 py-2"><div className="font-semibold">{p.name}</div><div className="font-mono text-[10.5px] text-muted">{p.code}</div></td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.budget_enabled ? <><b className={p.balance <= 0 ? "text-red-400" : "text-mega-yellow"}>{fmtCredits(p.balance)}</b><span className="text-muted"> / {fmtCredits(p.granted)}</span></> : <span className="text-xs text-muted">usa cota de quem gera</span>}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-soft">{fmtCredits(p.spent)} cr<div className="text-[11px] text-muted">{fmtUsd(p.spentUsd)}</div></td>
                    <td className="space-x-1 whitespace-nowrap px-4 py-2 text-right">
                      <button className="btn-outline !px-2 !py-1 text-xs" onClick={() => setGrant({ target: "project", id: p.id, name: p.name, credits: "1200", note: "" })}><Coins className="h-3 w-3" />Verba</button>
                      {p.budget_enabled ? <button className="btn-ghost !px-2 !py-1 text-[11px]" title="Desligar verba: gerações voltam a usar a cota de quem gera" onClick={() => act({ action: "budget", projectId: p.id, enabled: false }, "Verba desativada")}>Desligar</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2.5 text-[11px] text-muted">Com verba ativa, tudo que for gerado dentro do projeto sai da verba do projeto — não da cota de cada funcionário.</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="card">
            <div className="border-b border-line px-4 py-3 text-sm font-bold">Compras registradas</div>
            {o.purchases.length === 0 ? <p className="p-4 text-sm text-muted">Nenhuma compra registrada. Registre cada recarga do Higgsfield para o sistema calcular o valor do crédito.</p> : o.purchases.map((p) => (
              <div key={p.id} className="flex justify-between border-b border-line/60 px-4 py-2 text-sm"><span>{fmtDate(p.created_at)} · {p.by_name}{p.note ? ` · ${p.note}` : ""}</span><span className="tabular-nums"><b>{fmtCredits(p.amount)} cr</b> · {fmtUsd(p.usd)}</span></div>
            ))}
          </div>
          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm font-bold">Extrato real Higgsfield <button className="btn-ghost p-1" onClick={() => api<Higgs>("/api/admin/higgsfield?size=30").then(setHiggs)}><RefreshCw className="h-3.5 w-3.5" /></button></div>
            {higgs?.mode !== "mcp" ? <p className="p-4 text-sm text-muted">Disponível no modo MCP (HIGGSFIELD_MODE=mcp). Permite conferir o que o Hub registrou com o que a conta realmente cobrou.</p> : (
              <div className="max-h-80 overflow-y-auto">
                {(higgs.transactions ?? []).map((t, i) => (
                  <div key={i} className="flex justify-between border-b border-line/60 px-4 py-1.5 text-xs"><span className="text-soft">{fmtDate(t.created_at)} · {t.display_name}</span><span className={`tabular-nums ${t.credits > 0 ? "text-mega-yellow" : ""}`}>{t.credits > 0 ? "+" : ""}{fmtCredits(t.credits)}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={!!purchase} onClose={() => setPurchase(null)} title="Registrar compra de créditos no Higgsfield"
        footer={<><button className="btn-ghost" onClick={() => setPurchase(null)}>Cancelar</button><button className="btn-primary" onClick={async () => { if (await act({ action: "purchase", usd: Number(purchase!.usd.replace(",", ".")), credits: Number(purchase!.credits), note: purchase!.note }, "Compra registrada — valor do crédito recalculado")) setPurchase(null); }}>Registrar</button></>}>
        {purchase && (
          <div className="space-y-3">
            <p className="text-sm text-soft">Registre o que foi pago e quantos créditos entraram. O sistema calcula o valor médio do crédito em dólar (ex.: US$ 100 = 1.500 créditos → US$ 0,0667/crédito).</p>
            <div className="flex flex-wrap gap-1.5">
              {PACKS.map((p) => <button key={p.credits} className="chip hover:text-white" onClick={() => setPurchase({ ...purchase, usd: String(p.usd), credits: String(p.credits) })}>{fmtCredits(p.credits)} cr · {fmtUsd(p.usd)}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Valor pago (US$)</label><input className="input" inputMode="decimal" value={purchase.usd} onChange={(e) => setPurchase({ ...purchase, usd: e.target.value })} /></div>
              <div><label className="label">Créditos recebidos</label><input className="input" inputMode="numeric" value={purchase.credits} onChange={(e) => setPurchase({ ...purchase, credits: e.target.value })} /></div>
            </div>
            <div className="rounded-lg bg-card px-3 py-2 text-sm">Esta compra: <b className="text-mega-yellow">{fmtUsd(Number(purchase.usd.replace(",", ".")) / Number(purchase.credits) || 0)}</b> por crédito</div>
            <div><label className="label">Observação</label><input className="input" value={purchase.note} onChange={(e) => setPurchase({ ...purchase, note: e.target.value })} placeholder="Ex.: recarga de outubro, auto-refill" /></div>
            <p className="text-[11px] text-muted">Créditos avulsos do Higgsfield expiram em 90 dias. Auto-refill: 20 créditos por dólar.</p>
          </div>
        )}
      </Modal>

      <Modal open={!!grant} onClose={() => setGrant(null)} title={grant?.target === "project" ? `Verba do projeto ${grant?.name}` : `Créditos para ${grant?.name}`}
        footer={<><button className="btn-ghost" onClick={() => setGrant(null)}>Cancelar</button><button className="btn-primary" onClick={async () => { if (await act({ action: "grant", target: grant!.target, id: grant!.id, credits: Number(grant!.credits.replace(",", ".")), note: grant!.note }, "Créditos atualizados")) setGrant(null); }}>Confirmar</button></>}>
        {grant && (
          <div className="space-y-3">
            <div><label className="label">Créditos (use negativo para retirar)</label><input className="input text-lg font-bold" inputMode="decimal" value={grant.credits} onChange={(e) => setGrant({ ...grant, credits: e.target.value })} autoFocus /></div>
            <div className="text-sm text-muted">≈ {fmtUsd((Number(grant.credits.replace(",", ".")) || 0) * o.usdPerCredit)} no valor atual do crédito</div>
            <div><label className="label">Motivo</label><input className="input" value={grant.note} onChange={(e) => setGrant({ ...grant, note: e.target.value })} placeholder={grant.target === "project" ? "Ex.: verba inicial do filme" : "Ex.: extra para entrega do cliente X"} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AllowanceInput({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const dirty = Number(v) !== value;
  return (
    <div className="flex items-center gap-1">
      <input className="input !w-24 !py-1 text-right tabular-nums" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={(e) => e.key === "Enter" && dirty && onSave(Number(v))} />
      {dirty && <button className="btn-primary !p-1" onClick={() => onSave(Number(v))}><Check className="h-3.5 w-3.5" /></button>}
    </div>
  );
}
