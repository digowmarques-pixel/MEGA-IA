"use client";

import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { isAssetDrag, isFileDrag, readDraggedAssets, uploadFiles } from "@/lib/client";
import type { AssetView } from "@/lib/assets";
import { useToast } from "./ui";

/**
 * Área que aceita arquivos arrastados da pasta do computador (upload em lote)
 * e/ou assets arrastados de outros painéis do Hub.
 */
export function DropZone({ target, onUploaded, onAssetsDropped, label, children, className = "", disabled = false }: {
  target: { projectId?: number | null; scenarioId?: number | null; sceneId?: number | null };
  onUploaded?: (assets: AssetView[]) => void;
  onAssetsDropped?: (ids: number[]) => void;
  label?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const depth = useRef(0);
  const toast = useToast();

  const accepts = (e: React.DragEvent) => !disabled && (isFileDrag(e) || (!!onAssetsDropped && isAssetDrag(e)));

  return (
    <div
      className={`relative ${className}`}
      onDragEnter={(e) => { if (!accepts(e)) return; e.preventDefault(); depth.current++; setOver(true); }}
      onDragOver={(e) => { if (!accepts(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = isFileDrag(e) ? "copy" : "move"; }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
      onDrop={async (e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        depth.current = 0;
        setOver(false);
        const ids = readDraggedAssets(e);
        if (ids.length && onAssetsDropped) return onAssetsDropped(ids);
        const files = Array.from(e.dataTransfer.files);
        if (!files.length) return;
        setProgress(0);
        try {
          const r = await uploadFiles(files, target, setProgress);
          if (r.assets.length) toast("ok", `${r.assets.length} arquivo(s) adicionados`);
          if (r.rejected.length) toast("err", `Ignorados: ${r.rejected.map((x) => `${x.name} (${x.reason})`).join(", ")}`);
          onUploaded?.(r.assets);
        } catch (err) {
          toast("err", err instanceof Error ? err.message : "Falha no upload");
        } finally {
          setProgress(null);
        }
      }}
    >
      {children}
      {(over || progress !== null) && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-mega-amber bg-black/70 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 text-mega-yellow">
            <UploadCloud className="h-9 w-9" />
            <div className="text-sm font-semibold">{progress !== null ? `Enviando… ${progress}%` : label || "Solte para adicionar"}</div>
            {progress !== null && <div className="h-1.5 w-48 overflow-hidden rounded bg-line"><div className="mega-stripes h-full transition-all" style={{ width: `${progress}%` }} /></div>}
          </div>
        </div>
      )}
    </div>
  );
}
