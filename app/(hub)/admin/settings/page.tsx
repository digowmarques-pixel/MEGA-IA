"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Spinner, useToast } from "@/components/ui";
import { api } from "@/lib/client";

const FIELDS: { key: string; label: string; help: string }[] = [
  { key: "usd_per_credit", label: "Valor do crédito (US$)", help: "Recalculado automaticamente a cada compra registrada. Ajuste manual só se necessário." },
  { key: "monthly_budget_usd", label: "Orçamento mensal (US$)", help: "Usado para o alerta de projeção no painel de consumo." },
  { key: "elevenlabs_usd_per_1k_chars", label: "ElevenLabs — US$ por 1.000 créditos ElevenLabs", help: "Valor do seu plano (ex.: plano de US$ 99 com 500 mil créditos = 0,198). Converte o gasto em ElevenLabs para créditos do Hub e debita das mesmas carteiras." },
  { key: "personal_topup_min_usd", label: "Recarga pessoal mínima (US$)", help: "" },
  { key: "usd_brl", label: "Cotação US$ → R$", help: "Apenas referência para relatórios em reais." },
];

export default function AdminSettings() {
  const toast = useToast();
  const [s, setS] = useState<Record<string, string> | null>(null);
  const [status, setStatus] = useState<{ higgsfield: string; claude: string | null; elevenlabs: boolean } | null>(null);
  const [skills, setSkills] = useState<{ file: string; name: string; applies: string[] }[]>([]);
  useEffect(() => {
    api<{ settings: Record<string, string> }>("/api/admin/settings").then((r) => setS(r.settings));
    api<typeof status>("/api/status").then(setStatus);
    api<{ skills: typeof skills }>("/api/skills").then((r) => setSkills(r.skills));
  }, []);
  if (!s) return <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Configurações" actions={<button className="btn-primary" onClick={() => api("/api/admin/settings", { method: "PUT", json: s }).then(() => toast("ok", "Salvo")).catch((e) => toast("err", e.message))}>Salvar</button>} />
      <div className="grid gap-6 p-6 xl:grid-cols-2">
        <div className="card space-y-4 p-5">
          <div className="text-sm font-bold">Financeiro</div>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <input className="input" inputMode="decimal" value={s[f.key] ?? ""} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />
              {f.help && <p className="mt-1 text-[11px] text-muted">{f.help}</p>}
            </div>
          ))}
        </div>
        <div className="space-y-6">
          <div className="card space-y-3 p-5">
            <div className="text-sm font-bold">Integrações (definidas no servidor, arquivo .env)</div>
            <Row label="Higgsfield" value={status?.higgsfield === "mcp" ? "MCP da conta (custo real via get_cost)" : status?.higgsfield === "api" ? "API REST" : "Modo simulação — não gasta créditos"} ok={status?.higgsfield !== "mock"} />
            <Row label="Claude (enhance + assistente)" value={status?.claude ?? "ANTHROPIC_API_KEY não configurada"} ok={!!status?.claude} />
            <Row label="ElevenLabs (áudio)" value={status?.elevenlabs ? "Conectado" : "ELEVENLABS_API_KEY não configurada"} ok={!!status?.elevenlabs} />
          </div>
          <div className="card p-5">
            <div className="mb-2 text-sm font-bold">Skills do Claude</div>
            <p className="mb-3 text-[11px] text-muted">Arquivos .md na pasta <span className="font-mono">skills/</span> do servidor. São usados no Enhance de prompt e no chat. Relidos a cada pedido.</p>
            {skills.map((k) => <div key={k.file} className="flex justify-between border-b border-line/60 py-1.5 text-sm"><span>{k.name}</span><span className="chip">{k.applies.join(", ")}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-soft">{label}</span>
      <span className={`flex items-center gap-1.5 text-right text-xs ${ok ? "text-mega-yellow" : "text-muted"}`}><span className={`h-2 w-2 rounded-full ${ok ? "bg-mega-yellow" : "bg-line-strong"}`} />{value}</span>
    </div>
  );
}
