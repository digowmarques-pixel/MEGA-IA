"use client";

import { Archive, Film, FolderPlus, ImageIcon, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Empty, Modal, Spinner, useToast } from "@/components/ui";
import { api, fmtCredits, fmtUsd } from "@/lib/client";

type P = {
  id: number; name: string; code: string; client: string | null; status: string; owner_name: string | null;
  scenarios: number; scenes: number; images: number; videos: number; credits: number; cost_usd: number;
  budget_enabled: number; budget_balance: number; cover: string | null;
};

export default function ProjectsPage() {
  const [list, setList] = useState<P[] | null>(null);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const load = () => api<{ projects: P[] }>("/api/projects").then((r) => setList(r.projects)).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const filtered = (list ?? []).filter((p) => (showArchived || p.status !== "arquivado") && `${p.name} ${p.code} ${p.client ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Projetos" subtitle="Cada projeto organiza cenários (locações) e cenas — imagens e vídeos ficam juntos e saem com o nome certo."
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><FolderPlus className="h-4 w-4" />Novo projeto</button>} />
      <div className="flex flex-wrap items-center gap-3 px-6 pt-4">
        <div className="relative w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" /><input className="input pl-9" placeholder="Buscar projeto, código ou cliente" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-[#FDC010]" />Mostrar arquivados</label>
      </div>
      <div className="p-6">
        {list === null ? <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div> : filtered.length === 0 ? (
          <Empty icon={<FolderPlus className="h-8 w-8" />} title="Nenhum projeto">Crie o primeiro projeto para organizar cenários, cenas, imagens e vídeos.</Empty>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {filtered.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className={`card group overflow-hidden transition hover:border-mega-amber/60 ${p.status === "arquivado" ? "opacity-60" : ""}`}>
                <div className="relative aspect-[16/8] bg-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.cover ? <img src={p.cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><div className="mega-stripes h-10 w-24 -skew-x-[22deg] opacity-70" /></div>}
                  <span className="absolute left-2 top-2 rounded bg-black/80 px-2 py-0.5 font-mono text-[11px] font-bold text-mega-yellow">{p.code}</span>
                  {p.status === "arquivado" && <span className="absolute right-2 top-2 chip"><Archive className="h-3 w-3" />arquivado</span>}
                </div>
                <div className="p-4">
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs text-muted">{p.client || "Sem cliente"} · {p.owner_name}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="chip">{p.scenarios} cenários</span>
                    <span className="chip">{p.scenes} cenas</span>
                    <span className="chip"><ImageIcon className="h-3 w-3" />{p.images}</span>
                    <span className="chip"><Film className="h-3 w-3" />{p.videos}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
                    <span className="text-muted">Gasto: <b className="text-white">{fmtCredits(p.credits)} cr</b> · {fmtUsd(p.cost_usd)}</span>
                    {p.budget_enabled ? <span className={`font-bold ${p.budget_balance <= 0 ? "text-red-400" : "text-mega-yellow"}`}>verba {fmtCredits(p.budget_balance)}</span> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <CreateProject open={creating} onClose={() => setCreating(false)} onCreated={load} />
    </div>
  );
}

function CreateProject({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ name: "", code: "", client: "", description: "", look: "", aspect_ratio: "16:9" });
  const [scenarios, setScenarios] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const autoCode = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);

  async function submit() {
    setBusy(true);
    try {
      const r = await api<{ id: number }>("/api/projects", { method: "POST", json: { ...f, code: f.code || autoCode, scenarios } });
      onCreated();
      onClose();
      router.push(`/projects/${r.id}`);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo projeto" footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!f.name.trim() || busy} onClick={submit}>{busy ? <Spinner /> : "Criar projeto"}</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className="label">Nome</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Liga — Filme Manifesto" autoFocus /></div>
          <div><label className="label">Código</label><input className="input font-mono uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder={autoCode || "LIGA"} /></div>
        </div>
        <p className="-mt-1 text-[11px] text-muted">Arquivos sairão como <span className="font-mono text-mega-yellow">{(f.code || autoCode || "PROJETO").toUpperCase()}_CEN01_CENA01_IMG_v001.png</span></p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className="label">Cliente</label><input className="input" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} /></div>
          <div><label className="label">Proporção</label><select className="input" value={f.aspect_ratio} onChange={(e) => setF({ ...f, aspect_ratio: e.target.value })}>{["16:9", "21:9", "9:16", "1:1", "4:5", "4:3"].map((a) => <option key={a}>{a}</option>)}</select></div>
        </div>
        <div><label className="label">Sinopse / roteiro resumido</label><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div><label className="label">Look global (color grading, câmera, referências)</label><textarea className="input" rows={2} value={f.look} onChange={(e) => setF({ ...f, look: e.target.value })} placeholder="Ex.: Kodak 2383 quente, contraste médio, anamórfico 2.39, grão 35mm" /></div>
        <div>
          <label className="label">Cenários iniciais (locações)</label>
          <div className="space-y-1.5">
            {scenarios.map((s, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="w-14 shrink-0 pt-2 font-mono text-[11px] text-muted">CEN{String(i + 1).padStart(2, "0")}</span>
                <input className="input" value={s} onChange={(e) => setScenarios(scenarios.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? "Ex.: Vestiário" : "Ex.: Estádio à noite"} />
                <button className="btn-ghost p-2" onClick={() => setScenarios(scenarios.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button className="btn-ghost text-xs" onClick={() => setScenarios([...scenarios, ""])}><Plus className="h-3.5 w-3.5" />Adicionar cenário</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
