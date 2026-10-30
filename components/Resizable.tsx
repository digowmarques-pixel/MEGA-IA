"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Painéis lado a lado com divisórias arrastáveis. Tamanhos em % são lembrados por `id`
 * (localStorage). Duplo clique na divisória restaura o padrão.
 */
export function ResizablePanels({ id, defaults, mins, children, className = "" }: {
  id: string;
  defaults: number[];
  mins?: number[];
  children: React.ReactNode[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<number[]>(defaults);
  const drag = useRef<{ i: number; x: number; start: number[] } | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`panels:${id}`) || "null");
      if (Array.isArray(saved) && saved.length === defaults.length) setSizes(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const persist = useCallback((s: number[]) => {
    try { localStorage.setItem(`panels:${id}`, JSON.stringify(s)); } catch {}
  }, [id]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !ref.current) return;
      const width = ref.current.getBoundingClientRect().width;
      const delta = ((e.clientX - d.x) / width) * 100;
      const minA = mins?.[d.i] ?? 12, minB = mins?.[d.i + 1] ?? 12;
      const pair = d.start[d.i] + d.start[d.i + 1];
      const a = Math.min(Math.max(d.start[d.i] + delta, minA), pair - minB);
      const next = [...d.start];
      next[d.i] = a;
      next[d.i + 1] = pair - a;
      setSizes(next);
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSizes((s) => { persist(s); return s; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [mins, persist]);

  return (
    <div ref={ref} className={`flex h-full min-h-0 w-full ${className}`}>
      {children.map((child, i) => (
        <div key={i} className="contents">
          <div style={{ width: `${sizes[i]}%` }} className="min-h-0 min-w-0 overflow-hidden">{child}</div>
          {i < children.length - 1 && (
            <div
              role="separator"
              title="Arraste para redimensionar · duplo clique para restaurar"
              onPointerDown={(e) => {
                drag.current = { i, x: e.clientX, start: sizes };
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
              }}
              onDoubleClick={() => { setSizes(defaults); persist(defaults); }}
              className="group relative w-[5px] shrink-0 cursor-col-resize bg-line/60 transition hover:bg-mega-amber/70"
            >
              <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
