"use client";

import { Loader2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function Modal({ open, onClose, title, children, wide = false, footer }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card flex max-h-[90vh] w-full flex-col shadow-2xl ${wide ? "max-w-4xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="text-[15px] font-bold">{title}</div>
          <button className="btn-ghost -mr-2 p-1.5" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

type Toast = { id: number; kind: "ok" | "err" | "info"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "err" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[60] flex w-[380px] -translate-x-1/2 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-xl ${t.kind === "err" ? "border-red-500/40 bg-[#1a0d0d] text-red-200" : t.kind === "ok" ? "border-mega-amber/40 bg-[#1a1608] text-mega-yellow" : "border-line bg-card text-white"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, accent = false }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="label !mb-1">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${accent ? "text-mega-yellow" : ""}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Confirmação simples reutilizável. */
export function useConfirm() {
  const [state, setState] = useState<{ text: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = (text: string) => new Promise<boolean>((resolve) => setState({ text, resolve }));
  const node = (
    <Modal open={!!state} onClose={() => { state?.resolve(false); setState(null); }} title="Confirmar"
      footer={<>
        <button className="btn-ghost" onClick={() => { state?.resolve(false); setState(null); }}>Cancelar</button>
        <button className="btn-primary" autoFocus onClick={() => { state?.resolve(true); setState(null); }}>Confirmar</button>
      </>}>
      <p className="text-sm text-soft">{state?.text}</p>
    </Modal>
  );
  return { confirm, node };
}
