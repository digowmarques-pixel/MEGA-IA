"use client";

import { Check, CheckCircle2, ChevronLeft, ChevronRight, Download, Film, Heart, ImageIcon, Music, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AssetView } from "@/lib/assets";
import { ASSET_MIME, downloadZip } from "@/lib/client";

export const isPlaceholder = (url: string) => url.startsWith("/api/placeholder");

export function AssetMedia({ a, className = "", controls = false }: { a: AssetView; className?: string; controls?: boolean }) {
  if (a.kind === "audio") {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-raised to-ink p-4 ${className}`}>
        <Music className="h-8 w-8 text-mega-amber" />
        <audio src={a.url} controls className="w-full max-w-xs" onClick={(e) => e.stopPropagation()} />
      </div>
    );
  }
  if (a.kind === "video" && !isPlaceholder(a.url)) {
    return <video src={a.url} poster={a.thumb_url ?? undefined} className={`bg-black object-contain ${className}`} controls={controls} muted={!controls} loop playsInline
      onMouseEnter={(e) => !controls && e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => !controls && e.currentTarget.pause()} />;
  }
  return <SafeImg src={a.thumb_url || a.url} alt={a.filename} className={`bg-black object-cover ${className}`} />;
}

/** Imagem com fallback visível se o arquivo não carregar (link expirado, arquivo corrompido). */
function SafeImg({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <div className={`flex flex-col items-center justify-center gap-1 text-muted ${className}`}><ImageIcon className="h-6 w-6" /><span className="text-[10px]">não foi possível carregar</span></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" draggable={false} onError={() => setBroken(true)} className={className} />;
}

export type AssetActions = {
  onOpen?: (a: AssetView) => void;
  onToggleSelect?: (a: AssetView, shift: boolean) => void;
  onFavorite?: (a: AssetView) => void;
  onApprove?: (a: AssetView) => void;
  onUseAsReference?: (a: AssetView) => void;
  onMakeVideo?: (a: AssetView) => void;
  onUpscale?: (a: AssetView) => void;
  onDelete?: (a: AssetView) => void;
};

export function AssetCard({ a, selected, selectedIds, actions, compact = false }: { a: AssetView; selected?: boolean; selectedIds?: number[]; actions: AssetActions; compact?: boolean }) {
  const KindIcon = a.kind === "video" ? Film : a.kind === "audio" ? Music : ImageIcon;
  return (
    <div
      draggable
      onDragStart={(e) => {
        // arrasta a seleção inteira se o card fizer parte dela
        const ids = selected && selectedIds?.length ? selectedIds : [a.id];
        e.dataTransfer.setData(ASSET_MIME, JSON.stringify(ids));
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      onClick={(e) => (e.metaKey || e.ctrlKey || e.shiftKey) && actions.onToggleSelect ? actions.onToggleSelect(a, e.shiftKey) : actions.onOpen?.(a)}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition ${selected ? "border-mega-yellow ring-2 ring-mega-yellow/40" : "border-line hover:border-line-strong"}`}
    >
      <AssetMedia a={a} className={`w-full ${compact ? "aspect-square" : "aspect-video"}`} />

      {/* topo: seleção + badges */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
        {actions.onToggleSelect && (
          <button
            onClick={(e) => { e.stopPropagation(); actions.onToggleSelect!(a, e.shiftKey); }}
            className={`flex h-6 w-6 items-center justify-center rounded-md border transition ${selected ? "border-mega-yellow bg-mega-yellow text-black" : "border-white/40 bg-black/50 text-transparent opacity-0 group-hover:opacity-100"}`}
            aria-label="Selecionar"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
        <div className="ml-auto flex gap-1">
          {a.source === "upload" && <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-soft">REF</span>}
          {a.approved ? <span className="rounded bg-mega-yellow px-1.5 py-0.5 text-[10px] font-bold text-black">APROVADO</span> : null}
          {a.favorite ? <Heart className="h-4 w-4 fill-mega-orange text-mega-orange drop-shadow" /> : null}
        </div>
      </div>

      {/* ações rápidas */}
      <div className="absolute inset-x-0 bottom-[34px] flex justify-center gap-1 p-2 opacity-0 transition group-hover:opacity-100">
        {a.kind === "image" && actions.onMakeVideo && <Quick title="Gerar vídeo desta imagem" onClick={() => actions.onMakeVideo!(a)}><Film className="h-3.5 w-3.5" /></Quick>}
        {a.kind !== "audio" && actions.onUseAsReference && <Quick title="Usar como referência" onClick={() => actions.onUseAsReference!(a)}><Sparkles className="h-3.5 w-3.5" /></Quick>}
        {a.kind !== "audio" && actions.onUpscale && <Quick title="Upscale / enhance" onClick={() => actions.onUpscale!(a)}><Wand2 className="h-3.5 w-3.5" /></Quick>}
        {actions.onFavorite && <Quick title="Favoritar" onClick={() => actions.onFavorite!(a)}><Heart className={`h-3.5 w-3.5 ${a.favorite ? "fill-mega-orange text-mega-orange" : ""}`} /></Quick>}
        {actions.onApprove && <Quick title={a.approved ? "Remover aprovação" : "Aprovar"} onClick={() => actions.onApprove!(a)}><CheckCircle2 className={`h-3.5 w-3.5 ${a.approved ? "text-mega-yellow" : ""}`} /></Quick>}
        <Quick title="Baixar" onClick={() => downloadZip({ assetIds: [a.id], flat: true })}><Download className="h-3.5 w-3.5" /></Quick>
      </div>

      <div className="flex items-center gap-1.5 border-t border-line px-2 py-1.5">
        <KindIcon className="h-3 w-3 shrink-0 text-muted" />
        <span className="truncate font-mono text-[10.5px] text-soft" title={a.filename}>{a.filename}</span>
      </div>
    </div>
  );
}

function Quick({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={(e) => { e.stopPropagation(); onClick(); }} className="rounded-md bg-black/80 p-1.5 text-white backdrop-blur hover:bg-mega-yellow hover:text-black">
      {children}
    </button>
  );
}

/** Visualizador em tela cheia com navegação por setas. */
export function AssetViewer({ assets, index, onIndex, onClose, actions }: { assets: AssetView[]; index: number | null; onIndex: (i: number) => void; onClose: () => void; actions: AssetActions }) {
  const a = index !== null ? assets[index] : null;
  useEffect(() => {
    if (index === null) return;
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < assets.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key.toLowerCase() === "f" && a && actions.onFavorite) actions.onFavorite(a);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [index, assets.length, onIndex, onClose, a, actions]);
  if (!a || index === null) return null;
  return (
    <div className="fixed inset-0 z-50 flex bg-black/95">
      <div className="relative flex flex-1 items-center justify-center p-6" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full">
          <AssetMedia a={a} controls className="max-h-[85vh] max-w-full rounded-lg !object-contain" />
        </div>
        {index > 0 && <button className="absolute left-4 top-1/2 rounded-full bg-raised p-2 hover:bg-mega-yellow hover:text-black" onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}><ChevronLeft /></button>}
        {index < assets.length - 1 && <button className="absolute right-4 top-1/2 rounded-full bg-raised p-2 hover:bg-mega-yellow hover:text-black" onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}><ChevronRight /></button>}
        <button className="absolute right-4 top-4 rounded-full bg-raised p-2 hover:bg-white hover:text-black" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
      <aside className="hidden w-[340px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-panel p-5 md:flex">
        <div>
          <div className="label">Arquivo</div>
          <div className="break-all font-mono text-xs text-mega-yellow">{a.filename}</div>
          <div className="mt-1 text-xs text-muted">{index + 1} de {assets.length} · {a.user_name}{a.width ? ` · ${a.width}×${a.height}` : ""}</div>
        </div>
        {a.model && <div><div className="label">Modelo</div><div className="text-sm">{a.model}</div></div>}
        {a.original_name && <div><div className="label">Nome original</div><div className="text-sm">{a.original_name}</div></div>}
        {a.prompt && (
          <div>
            <div className="label">Prompt</div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-soft">{a.prompt}</p>
            <button className="btn-ghost mt-1 -ml-2 text-xs" onClick={() => navigator.clipboard.writeText(a.prompt!)}>Copiar prompt</button>
          </div>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2">
          {a.kind === "image" && actions.onMakeVideo && <button className="btn-primary col-span-2" onClick={() => actions.onMakeVideo!(a)}><Film className="h-4 w-4" />Gerar vídeo</button>}
          {actions.onUseAsReference && a.kind !== "audio" && <button className="btn-outline" onClick={() => actions.onUseAsReference!(a)}><Sparkles className="h-4 w-4" />Referência</button>}
          {actions.onUpscale && a.kind !== "audio" && <button className="btn-outline" onClick={() => actions.onUpscale!(a)}><Wand2 className="h-4 w-4" />Upscale</button>}
          {actions.onFavorite && <button className="btn-outline" onClick={() => actions.onFavorite!(a)}><Heart className={`h-4 w-4 ${a.favorite ? "fill-mega-orange text-mega-orange" : ""}`} />Favorito</button>}
          {actions.onApprove && <button className="btn-outline" onClick={() => actions.onApprove!(a)}><CheckCircle2 className="h-4 w-4" />{a.approved ? "Desaprovar" : "Aprovar"}</button>}
          <button className="btn-outline" onClick={() => downloadZip({ assetIds: [a.id], flat: true })}><Download className="h-4 w-4" />Baixar</button>
          {actions.onDelete && <button className="btn-danger" onClick={() => actions.onDelete!(a)}><Trash2 className="h-4 w-4" />Excluir</button>}
        </div>
        <div className="text-[11px] text-muted">Atalhos: ← → navegar · F favoritar · Esc fechar</div>
      </aside>
    </div>
  );
}
