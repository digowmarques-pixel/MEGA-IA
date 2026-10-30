"use client";

import { AlertTriangle, Camera, Clapperboard, Palette, Sparkles, Sun, Sunrise } from "lucide-react";
import type { EnhanceResult } from "@/lib/claude";
import { Modal } from "./ui";

/** Mostra o prompt otimizado + briefing do que melhorou + previsão do resultado (câmera, luz, grading). */
export function EnhanceDialog({ open, original, result, onClose, onUse, onEdit }: {
  open: boolean;
  original: string;
  result: EnhanceResult | null;
  onClose: () => void;
  onUse: (r: EnhanceResult) => void;
  onEdit: (r: EnhanceResult) => void;
}) {
  if (!result) return null;
  const p = result.prediction;
  const rows: [React.ElementType, string, string][] = [
    [Camera, "Enquadramento e ângulo", p.framing],
    [Clapperboard, "Câmera / lente / movimento", p.camera],
    [Sun, "Iluminação", p.lighting],
    [Palette, "Color grading", p.color_grading],
    [Sunrise, "Clima", p.mood],
  ];
  return (
    <Modal open={open} onClose={onClose} wide title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-mega-yellow" />Prompt otimizado pelo Claude</span>}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Manter original</button>
        <button className="btn-outline" onClick={() => onEdit(result)}>Editar antes de usar</button>
        <button className="btn-primary" onClick={() => onUse(result)}>Usar prompt otimizado</button>
      </>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <section>
            <div className="label">Como provavelmente vai ficar</div>
            <p className="rounded-lg border border-mega-amber/30 bg-mega-yellow/5 p-3 text-sm leading-relaxed">{p.summary}</p>
          </section>
          <section className="space-y-2.5">
            {rows.map(([Icon, label, text]) => (
              <div key={label} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-mega-amber" />
                <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div><div className="text-sm text-soft">{text}</div></div>
              </div>
            ))}
          </section>
          {(result.suggested.aspect_ratio || result.suggested.duration_seconds || result.suggested.model_id) && (
            <section className="flex flex-wrap gap-1.5">
              <span className="label w-full !mb-0">Sugestões aplicadas ao usar</span>
              {result.suggested.model_id && <span className="chip chip-active">{result.suggested.model_id}</span>}
              {result.suggested.aspect_ratio && <span className="chip chip-active">{result.suggested.aspect_ratio}</span>}
              {result.suggested.duration_seconds && <span className="chip chip-active">{result.suggested.duration_seconds}s</span>}
            </section>
          )}
        </div>
        <div className="space-y-4">
          <section>
            <div className="label">O que melhorou</div>
            <ul className="space-y-1.5 text-sm">
              {result.improvements.map((t, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mega-yellow" /><span className="text-soft">{t}</span></li>)}
            </ul>
          </section>
          {result.warnings.length > 0 && (
            <section className="rounded-lg border border-mega-orange/40 bg-mega-orange/5 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-mega-orange"><AlertTriangle className="h-3.5 w-3.5" />Atenção</div>
              <ul className="list-disc space-y-1 pl-4 text-sm text-soft">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </section>
          )}
          <section>
            <div className="label">Original</div>
            <p className="rounded-lg bg-card p-2.5 text-xs text-muted">{original}</p>
          </section>
          <section>
            <div className="label">Prompt final (enviado ao modelo)</div>
            <p className="max-h-48 overflow-y-auto rounded-lg border border-line bg-card p-2.5 font-mono text-xs leading-relaxed">{result.enhanced_prompt}</p>
          </section>
        </div>
      </div>
    </Modal>
  );
}
