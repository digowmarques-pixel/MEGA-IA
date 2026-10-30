"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { AssetView } from "@/lib/assets";
import type { GenKind } from "@/lib/models";
import { Gallery } from "./Gallery";
import { Generator } from "./Generator";
import { ResizablePanels } from "./Resizable";

/** Página de estúdio: gerador à esquerda + galeria à direita (painéis redimensionáveis). */
export function Studio({ kind, kinds, galleryKinds }: { kind: GenKind; kinds?: GenKind[]; galleryKinds: string[] }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [injectRef, setInjectRef] = useState<{ asset: AssetView; nonce: number; asStart?: boolean } | null>(null);
  const [injectSource, setInjectSource] = useState<{ asset: AssetView; nonce: number } | null>(null);
  const [injectPrompt, setInjectPrompt] = useState<{ text: string; nonce: number; model?: string | null; flags?: Record<string, boolean> } | null>(null);
  const router = useRouter();

  // chegada vinda de outra tela: /video?from=ID (imagem → vídeo) ou /enhance?source=ID
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const from = Number(q.get("from")), src = Number(q.get("source")), vref = Number(q.get("vref")), lib = Number(q.get("lib"));
    if (lib) api<{ entry: { prompt: string; model: string | null } }>(`/api/library/${lib}`).then((r) => setInjectPrompt({ text: r.entry.prompt, model: r.entry.model, nonce: Date.now() })).catch(() => {});
    // vindo do blocking 3D: vídeo vira referência e a legenda de cores vai para o prompt
    if (vref) api<{ asset: AssetView }>(`/api/assets/${vref}`).then((r) => {
      setInjectRef({ asset: r.asset, nonce: Date.now() });
      // prompts antigos eram só a legenda de cores; os novos já vêm completos (cena, luz, estilo, evitar)
      if (r.asset.prompt) setInjectPrompt({ text: r.asset.prompt.includes("\nAvoid:") ? r.asset.prompt : `${r.asset.prompt}\n\nScene: `, nonce: Date.now(), model: "seedance_2_5", flags: { draft: true } });
    }).catch(() => {});
    if (from) api<{ asset: AssetView }>(`/api/assets/${from}`).then((r) => setInjectRef({ asset: r.asset, nonce: Date.now(), asStart: true })).catch(() => {});
    if (src) api<{ asset: AssetView }>(`/api/assets/${src}`).then((r) => setInjectSource({ asset: r.asset, nonce: Date.now() })).catch(() => {});
  }, []);
  return (
    <ResizablePanels id={`studio-${kind}`} defaults={[30, 70]} mins={[22, 35]}>
      <div className="h-full border-r border-line bg-panel">
        <Generator kind={kind} kinds={kinds} onGenerated={() => setRefreshKey((k) => k + 1)} injectRef={injectRef} injectSource={injectSource} injectPrompt={injectPrompt} />
      </div>
      <Gallery
        kinds={galleryKinds}
        refreshKey={refreshKey}
        onUseAsReference={(a) => setInjectRef({ asset: a, nonce: Date.now() })}
        onMakeVideo={(a) => (kind === "video" || kinds?.includes("video") ? setInjectRef({ asset: a, nonce: Date.now(), asStart: true }) : router.push(`/video?from=${a.id}`))}
        onUpscale={(a) => (kind.startsWith("upscale") ? setInjectSource({ asset: a, nonce: Date.now() }) : router.push(`/enhance?source=${a.id}`))}
      />
    </ResizablePanels>
  );
}
