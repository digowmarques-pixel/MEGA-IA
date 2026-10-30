"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { Spinner, Stat } from "@/components/ui";
import { AXIS, BRAND, SERIES, TOOLTIP } from "@/lib/chart-colors";
import { api, fmtCredits, fmtUsd } from "@/lib/client";
import { getModel } from "@/lib/models";

type Usage = {
  month: string;
  history: { month: string; user_id: number; name: string; credits: number; usd: number }[];
  perUser: { id: number; name: string; department: string | null; monthly_allowance: number; active: number; credits: number; usd: number; from_allowance: number; from_projects: number; from_personal: number; generations: number; failed: number; images: number; videos: number; audios: number; upscales: number; balance: number; personal: number; claude_usd: number }[];
  byKind: { kind: string; credits: number; usd: number; n: number }[];
  byModel: { model: string; credits: number; usd: number; n: number }[];
  byWallet: { wallet_type: string; credits: number; usd: number }[];
  projects: { id: number; name: string; code: string; budget_enabled: number; month_credits: number; month_usd: number; total_credits: number; total_usd: number; granted: number; balance: number | null }[];
  daily: { day: string; credits: number; usd: number }[];
  finance: { usdPerCredit: number; genCredits: number; genUsd: number; personalCredits: number; personalUsd: number; companyUsd: number; claudeUsd: number; total: number; projection: number; daysInMonth: number; budget: number; purchases: { credits: number; usd: number }; topups: { credits: number; usd: number }; failed: number; usdBrl: number };
};

const KIND: Record<string, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", upscale_image: "Upscale img", upscale_video: "Upscale vídeo", avatar: "Avatar" };
const WALLET: Record<string, string> = { user: "Cota funcionários", project: "Verbas de projeto", personal: "Créditos pessoais" };

export default function AdminUsage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [unit, setUnit] = useState<"credits" | "usd">("credits");
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => { setU(null); api<Usage>(`/api/admin/usage?month=${month}&months=6`).then(setU).catch(() => {}); }, [month]);

  // histórico mensal empilhado por funcionário — cor fixa por pessoa (ordem alfabética estável)
  const { histData, people } = useMemo(() => {
    if (!u) return { histData: [], people: [] as { id: number; name: string; color: string }[] };
    const ids = [...new Map(u.perUser.map((p) => [p.id, p.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const top = ids.slice(0, 7);
    const people = top.map(([id, name], i) => ({ id, name, color: SERIES[i] }));
    const months = [...new Set(u.history.map((h) => h.month))].sort();
    const histData: Record<string, number | string>[] = months.map((m) => {
      const row: Record<string, number | string> = { month: m };
      for (const h of u.history.filter((x) => x.month === m)) {
        const key = top.some(([id]) => id === h.user_id) ? `u${h.user_id}` : "outros";
        row[key] = ((row[key] as number) || 0) + (unit === "usd" ? h.usd : h.credits);
      }
      return row;
    });
    if (ids.length > 7) people.push({ id: -1, name: "Outros", color: "#6b6b6b" });
    return { histData, people };
  }, [u, unit]);

  const v = (credits: number, usd: number) => (unit === "usd" ? fmtUsd(usd) : `${fmtCredits(credits)} cr`);

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Consumo da equipe" subtitle="Créditos e custos por funcionário, projeto e modelo"
        actions={<>
          <div className="flex rounded-lg bg-card p-0.5">
            {(["credits", "usd"] as const).map((x) => <button key={x} onClick={() => setUnit(x)} className={`rounded-md px-3 py-1 text-xs font-bold ${unit === x ? "bg-mega-yellow text-black" : "text-soft"}`}>{x === "usd" ? "US$" : "Créditos"}</button>)}
          </div>
          <input type="month" className="input !w-40" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </>} />
      {!u ? <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div> : (
        <div className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Consumo do mês" value={v(u.finance.genCredits, u.finance.genUsd)} sub={`${u.perUser.reduce((s, p) => s + p.generations, 0)} gerações`} accent />
            <Stat label="Custo para a empresa" value={fmtUsd(u.finance.companyUsd + u.finance.claudeUsd)} sub={`gerações ${fmtUsd(u.finance.companyUsd)} + Claude ${fmtUsd(u.finance.claudeUsd)}`} />
            <Stat label="Projeção do mês" value={fmtUsd(u.finance.projection)} sub={u.finance.budget ? `orçamento ${fmtUsd(u.finance.budget)}` : "sem orçamento definido"} />
            <Stat label="Pago pelos funcionários" value={fmtUsd(u.finance.personalUsd)} sub={`${fmtCredits(u.finance.personalCredits)} créditos pessoais usados`} />
            <Stat label="Valor do crédito" value={fmtUsd(u.finance.usdPerCredit)} sub={`${fmtCredits(1 / u.finance.usdPerCredit)} créditos por US$`} />
          </div>
          {u.finance.budget > 0 && u.finance.projection > u.finance.budget && (
            <div className="flex items-center gap-2 rounded-lg border border-mega-orange/40 bg-mega-orange/5 px-4 py-2.5 text-sm text-mega-orange">
              <AlertTriangle className="h-4 w-4" />No ritmo atual o mês fecha em {fmtUsd(u.finance.projection)}, acima do orçamento de {fmtUsd(u.finance.budget)}.
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="card p-4 xl:col-span-2">
              <div className="mb-3 text-sm font-bold">Consumo mensal por funcionário (últimos 6 meses)</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={histData} barCategoryGap="28%">
                    <CartesianGrid vertical={false} stroke="#1f1f1f" />
                    <XAxis dataKey="month" {...AXIS} />
                    <YAxis {...AXIS} width={48} />
                    <Tooltip {...TOOLTIP} formatter={(val, name) => [unit === "usd" ? fmtUsd(Number(val)) : `${fmtCredits(Number(val))} cr`, people.find((p) => `u${p.id}` === name)?.name ?? "Outros"]} />
                    <Legend formatter={(name) => <span className="text-xs text-soft">{people.find((p) => `u${p.id}` === name)?.name ?? "Outros"}</span>} />
                    {people.map((p) => <Bar key={p.id} dataKey={p.id === -1 ? "outros" : `u${p.id}` as string} stackId="a" fill={p.color} stroke="#0e0e0e" strokeWidth={2} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card p-4">
              <div className="mb-3 text-sm font-bold">De onde saiu o crédito</div>
              <ul className="space-y-3">
                {u.byWallet.length === 0 && <li className="text-sm text-muted">Sem consumo no mês.</li>}
                {u.byWallet.map((w) => {
                  const pct = u.finance.genCredits ? (w.credits / u.finance.genCredits) * 100 : 0;
                  return (
                    <li key={w.wallet_type ?? "x"}>
                      <div className="flex justify-between text-sm"><span className="text-soft">{WALLET[w.wallet_type] ?? "—"}</span><span className="font-semibold tabular-nums">{v(w.credits, w.usd)}</span></div>
                      <div className="mt-1 h-1.5 rounded bg-line"><div className="h-full rounded bg-mega-amber" style={{ width: `${pct}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
              <div className="mb-2 mt-6 text-sm font-bold">Por tipo</div>
              <ul className="space-y-1.5 text-sm">{u.byKind.map((k) => <li key={k.kind} className="flex justify-between"><span className="text-soft">{KIND[k.kind] ?? k.kind} <span className="text-muted">({k.n})</span></span><span className="tabular-nums">{v(k.credits, k.usd)}</span></li>)}</ul>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <div className="border-b border-line px-4 py-3 text-sm font-bold">Funcionários — {month}</div>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2">Funcionário</th><th className="px-2 py-2 text-right">Consumo</th><th className="px-2 py-2 text-right">Cota</th><th className="px-2 py-2 text-right">Projetos</th><th className="px-2 py-2 text-right">Pessoal</th>
                  <th className="px-2 py-2 text-right">Img / Vid / Áud</th><th className="px-2 py-2 text-right">Falhas</th><th className="px-2 py-2 text-right">Claude</th><th className="px-4 py-2 text-right">Saldo da cota</th>
                </tr>
              </thead>
              <tbody>
                {u.perUser.map((p) => (
                  <tr key={p.id} className={`border-b border-line/60 ${p.active ? "" : "opacity-50"}`}>
                    <td className="px-4 py-2"><div className="font-semibold">{p.name}</div><div className="text-[11px] text-muted">{p.department || "—"}{p.monthly_allowance ? ` · cota ${fmtCredits(p.monthly_allowance)}/mês` : ""}</div></td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">{v(p.credits, p.usd)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-soft">{fmtCredits(p.from_allowance)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-soft">{fmtCredits(p.from_projects)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-soft">{fmtCredits(p.from_personal)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-soft">{p.images} / {p.videos} / {p.audios}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{p.failed}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{fmtUsd(p.claude_usd)}</td>
                    <td className={`px-4 py-2 text-right font-semibold tabular-nums ${p.balance <= 0 ? "text-red-400" : "text-mega-yellow"}`}>{fmtCredits(p.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="card overflow-x-auto">
              <div className="border-b border-line px-4 py-3 text-sm font-bold">Projetos</div>
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr className="border-b border-line"><th className="px-4 py-2">Projeto</th><th className="px-2 py-2 text-right">No mês</th><th className="px-2 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Verba restante</th></tr></thead>
                <tbody>
                  {u.projects.map((p) => {
                    const pct = p.granted > 0 ? Math.min(100, ((p.granted - (p.balance ?? 0)) / p.granted) * 100) : 0;
                    return (
                      <tr key={p.id} className="border-b border-line/60">
                        <td className="px-4 py-2"><div className="font-semibold">{p.name}</div><div className="font-mono text-[10.5px] text-muted">{p.code}</div></td>
                        <td className="px-2 py-2 text-right tabular-nums">{v(p.month_credits, p.month_usd)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-soft">{v(p.total_credits, p.total_usd)}</td>
                        <td className="px-4 py-2 text-right">
                          {p.budget_enabled ? (
                            <div>
                              <span className={`font-semibold tabular-nums ${(p.balance ?? 0) <= 0 ? "text-red-400" : "text-mega-yellow"}`}>{fmtCredits(p.balance)} / {fmtCredits(p.granted)}</span>
                              <div className="ml-auto mt-1 h-1 w-28 rounded bg-line"><div className={`h-full rounded ${pct > 90 ? "bg-red-400" : "bg-mega-amber"}`} style={{ width: `${pct}%` }} /></div>
                            </div>
                          ) : <span className="text-xs text-muted">sem verba (usa cota)</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="card p-4">
              <div className="mb-3 text-sm font-bold">Consumo diário — {month}</div>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={u.daily}>
                    <CartesianGrid vertical={false} stroke="#1f1f1f" />
                    <XAxis dataKey="day" {...AXIS} />
                    <YAxis {...AXIS} width={44} />
                    <Tooltip {...TOOLTIP} labelFormatter={(d) => `Dia ${d}`} formatter={(val) => [unit === "usd" ? fmtUsd(Number(val)) : `${fmtCredits(Number(val))} cr`, "Consumo"]} />
                    <Bar dataKey={unit === "usd" ? "usd" : "credits"} fill={BRAND} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mb-2 mt-4 text-sm font-bold">Modelos mais usados</div>
              <ul className="space-y-1.5 text-sm">{u.byModel.map((m) => <li key={m.model} className="flex justify-between"><span className="text-soft">{getModel(m.model)?.name ?? m.model} <span className="text-muted">({m.n})</span></span><span className="tabular-nums">{v(m.credits, m.usd)}</span></li>)}</ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
