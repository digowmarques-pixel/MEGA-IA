"use client";

import { ArrowUp, Copy, CornerDownLeft, Eraser, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner, useToast } from "./ui";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Decupe este projeto em cenas com shot list (plano, lente, movimento, duração)",
  "Escreva os prompts de imagem dos frames-chave do cenário atual mantendo continuidade",
  "Sugira um color grading e a linguagem de câmera para este filme",
  "Quantos créditos devo reservar para gerar todas as cenas em vídeo?",
];

/** Chat com o Claude dentro do projeto. Blocos de código viram botões "usar no gerador". */
export function Assistant({ storageKey, context, onUsePrompt }: { storageKey: string; context: { projectId?: number | null; scenarioId?: number | null; sceneId?: number | null }; onUsePrompt?: (p: string) => void }) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { try { setMsgs(JSON.parse(localStorage.getItem(`chat:${storageKey}`) || "[]")); } catch {} }, [storageKey]);
  useEffect(() => {
    if (!busy) try { localStorage.setItem(`chat:${storageKey}`, JSON.stringify(msgs.slice(-40))); } catch {}
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, storageKey]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: text.trim() }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history, ...context }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Erro ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...history, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      setMsgs([...history, { role: "assistant", content: `⚠️ ${e instanceof Error ? e.message : "Falha"}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-mega-yellow" />Claude no projeto</div>
            <p className="text-xs text-muted">Ele conhece os cenários, cenas e o look do projeto. Peça decupagem, prompts, continuidade, estimativa de créditos…</p>
            {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border border-line bg-card p-2.5 text-left text-xs text-soft hover:border-mega-amber/60 hover:text-white">{s}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-6 rounded-xl bg-raised px-3 py-2 text-sm" : "text-sm"}>
            {m.role === "assistant" ? (m.content ? <Rich text={m.content} onUse={onUsePrompt} onCopy={() => toast("ok", "Copiado")} /> : <Spinner className="h-4 w-4 text-mega-yellow" />) : <span className="whitespace-pre-wrap">{m.content}</span>}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3">
        <div className="relative">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} placeholder="Pergunte ao Claude… (Enter envia, Shift+Enter quebra linha)"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            className="input resize-none pr-11" />
          <button onClick={() => send(input)} disabled={busy || !input.trim()} className="btn-primary absolute bottom-2 right-2 !p-1.5"><ArrowUp className="h-4 w-4" /></button>
        </div>
        {msgs.length > 0 && <button className="btn-ghost mt-1 text-[11px]" onClick={() => setMsgs([])}><Eraser className="h-3 w-3" />Limpar conversa</button>}
      </div>
    </div>
  );
}

/** Markdown leve: blocos de código com ações, **negrito**, títulos e listas. */
function Rich({ text, onUse, onCopy }: { text: string; onUse?: (p: string) => void; onCopy: () => void }) {
  const parts = text.split(/```[a-zA-Z]*\n?([\s\S]*?)(?:```|$)/g);
  return (
    <div className="space-y-2 leading-relaxed text-soft">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <div key={i} className="overflow-hidden rounded-lg border border-line bg-black">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11.5px] text-white">{p.trim()}</pre>
            <div className="flex gap-1 border-t border-line bg-card px-2 py-1">
              <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => { navigator.clipboard.writeText(p.trim()); onCopy(); }}><Copy className="h-3 w-3" />Copiar</button>
              {onUse && <button className="btn-ghost !px-2 !py-1 text-[11px] text-mega-yellow" onClick={() => onUse(p.trim())}><CornerDownLeft className="h-3 w-3" />Usar no gerador</button>}
            </div>
          </div>
        ) : (
          <div key={i}>
            {p.split("\n").map((line, j) => {
              const html = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b class='text-white'>$1</b>").replace(/`([^`]+)`/g, "<code class='rounded bg-raised px-1 text-mega-yellow'>$1</code>");
              if (/^#{1,4}\s/.test(line)) return <div key={j} className="mt-2 font-bold text-white" dangerouslySetInnerHTML={{ __html: html.replace(/^#+\s/, "") }} />;
              if (/^\s*[-*]\s/.test(line)) return <div key={j} className="flex gap-2 pl-1"><span className="text-mega-amber">•</span><span dangerouslySetInnerHTML={{ __html: html.replace(/^\s*[-*]\s/, "") }} /></div>;
              return line.trim() ? <p key={j} dangerouslySetInnerHTML={{ __html: html }} /> : <div key={j} className="h-1" />;
            })}
          </div>
        ),
      )}
    </div>
  );
}
