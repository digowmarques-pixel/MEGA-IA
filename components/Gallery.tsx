"use client";

import { AlertCircle, Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetView } from "@/lib/assets";
import { api, downloadZip, fmtCredits, fmtDate } from "@/lib/client";
import { getModel } from "@/lib/models";
import { AssetCard, AssetViewer, type AssetActions } from "./AssetCard";
import { Empty, Spinner, useConfirm, useToast } from "./ui";

type Gen = {
  id: number; kind: string; model: string; prompt: string | null; status: string; credits: number; error: string | null;
  created_at: string; project_name: string | null; wallet_type: string | null; params: { count?: number; duration?: number } | null; assets: AssetView[];
};

const AUDIO_LABEL: Record<string, string> = { eleven_voice_design: "Criação de voz", eleven_voice_isolator: "Voice Isolator", eleven_sound_effects: "Sound Effects" };
function modelLabel(id: string) {
  if (getModel(id)) return getModel(id)!.name;
  if (AUDIO_LABEL[id]) return AUDIO_LABEL[id];
  if (/sts/.test(id)) return "Voice Changer";
  if (id.startsWith("eleven_")) return `Text to Speech · ${id.replace("eleven_", "Eleven ").replace(/_/g, " ")}`;
  return id;
}

/** Galeria das gerações do usuário (atualiza sozinha enquanto houver itens processando). */
export function Gallery({ kinds, refreshKey, onUseAsReference, onMakeVideo, onUpscale }: {
  kinds: string[];
  refreshKey: number;
  onUseAsReference?: (a: AssetView) => void;
  onMakeVideo?: (a: AssetView) => void;
  onUpscale?: (a: AssetView) => void;
}) {
  const toast = useToast();
  const { confirm, node } = useConfirm();
  const [gens, setGens] = useState<Gen[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ generations: Gen[] }>(`/api/generations?kind=${kinds.join(",")}&limit=80`);
      setGens(r.generations);
      if (timer.current) clearTimeout(timer.current);
      if (r.generations.some((g) => g.status === "processing")) timer.current = setTimeout(load, 5000);
    } catch {
      setGens((g) => g ?? []);
    }
  }, [kinds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [load, refreshKey]);

  const assets = useMemo(() => (gens ?? []).flatMap((g) => g.assets), [gens]);
  const patch = async (a: AssetView, body: Record<string, unknown>) => { await api(`/api/assets/${a.id}`, { method: "PATCH", json: body }); load(); };

  const actions: AssetActions = {
    onOpen: (a) => setViewer(assets.findIndex((x) => x.id === a.id)),
    onToggleSelect: (a) => setSelected((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id])),
    onFavorite: (a) => patch(a, { favorite: !a.favorite }),
    onApprove: (a) => patch(a, { approved: !a.approved }),
    onUseAsReference, onMakeVideo, onUpscale,
    onDelete: async (a) => {
      if (!(await confirm(`Excluir ${a.filename}? Esta ação não pode ser desfeita.`))) return;
      await api(`/api/assets/${a.id}`, { method: "DELETE" });
      setViewer(null);
      load();
    },
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-sm font-bold">Minhas gerações</span>
        <span className="text-xs text-muted">{assets.length} arquivos</span>
        <div className="ml-auto flex items-center gap-1">
          {selected.length > 0 && (
            <>
              <span className="text-xs text-mega-yellow">{selected.length} selecionados</span>
              <button className="btn-ghost text-xs" onClick={() => setSelected([])}>Limpar</button>
              <button className="btn-primary !py-1.5 text-xs" onClick={() => downloadZip({ assetIds: selected }).then((n) => n && toast("err", `${n} arquivo(s) não puderam ser baixados — veja _erros.txt`)).catch((e) => toast("err", e.message))}>
                <Download className="h-3.5 w-3.5" />Baixar lote
              </button>
            </>
          )}
          <button className="btn-ghost p-1.5" title="Atualizar" onClick={load}><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {gens === null ? <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div> : gens.length === 0 ? (
          <Empty title="Nada por aqui ainda">Escreva um prompt à esquerda e clique em gerar. Os resultados aparecem aqui.</Empty>
        ) : (
          <div className="space-y-6">
            {gens.map((g) => (
              <section key={g.id}>
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <span className="font-semibold text-soft">{modelLabel(g.model)}</span>
                  <span className="text-muted">· {fmtDate(g.created_at)}</span>
                  {g.project_name && <span className="chip">{g.project_name}</span>}
                  <span className="ml-auto tabular-nums text-muted">{g.status === "failed" ? "estornado" : `${fmtCredits(g.credits)} cr`}</span>
                </div>
                {g.prompt && <p className="mb-2 line-clamp-2 text-xs text-muted">{g.prompt}</p>}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {g.status === "processing" && Array.from({ length: Math.max(g.params?.count ?? 1, 1) }).map((_, i) => (
                    <div key={i} className="relative flex aspect-video flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-line bg-card">
                      <div className="mega-stripes absolute inset-x-0 bottom-0 h-1 animate-pulse" />
                      <Spinner className="h-5 w-5 text-mega-yellow" />
                      <span className="text-xs text-muted">Gerando…</span>
                    </div>
                  ))}
                  {g.status === "failed" && (
                    <div className="flex aspect-video flex-col items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-center">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <span className="text-xs font-semibold text-red-300">Falhou — créditos devolvidos</span>
                      <span className="line-clamp-3 text-[11px] text-muted">{g.error}</span>
                    </div>
                  )}
                  {g.assets.map((a) => <AssetCard key={a.id} a={a} selected={selected.includes(a.id)} selectedIds={selected} actions={actions} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <AssetViewer assets={assets} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} actions={actions} />
      {node}
    </div>
  );
}
