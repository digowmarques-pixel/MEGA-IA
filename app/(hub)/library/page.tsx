"use client";

import { BookOpen, Copy, ExternalLink, Film, Plus, Search, Trash2, UploadCloud, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Empty, Modal, Spinner, useConfirm, useToast } from "@/components/ui";
import type { LibraryEntry } from "@/lib/library";
import { api, uploadFiles } from "@/lib/client";
import { getModel, MODELS } from "@/lib/models";

type Resp = { entries: LibraryEntry[]; total: number; categories: string[]; inputTypes: string[]; modes: Record<string, string> };
const PAGE = 48;
const EMPTY = { title: "", kind: "video", model: "seedance_2_5", category: "", prompt: "", notes: "", tags: "", inputs: [] as string[], assetId: null as number | null, videoName: "" };

export default function LibraryPage() {
  const toast = useToast();
  const router = useRouter();
  const { confirm, node } = useConfirm();
  const [data, setData] = useState<Resp | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [mode, setMode] = useState("");
  const [origin, setOrigin] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<LibraryEntry | null>(null);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [uploading, setUploading] = useState(false);

  const query = useCallback((offset: number) => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (q) p.set("q", q);
    if (cat) p.set("category", cat);
    if (mode) p.set("mode", mode);
    if (origin) p.set("origin", origin);
    return api<Resp>(`/api/library?${p}`);
  }, [q, cat, mode, origin]);
  const load = useCallback(() => { query(0).then(setData).catch(() => {}); }, [query]);
  async function more() {
    if (!data) return;
    setLoadingMore(true);
    try {
      const r = await query(data.entries.length);
      // evita duplicar se a lista mudou entre as páginas
      setData((d) => d && { ...r, entries: [...d.entries, ...r.entries.filter((e) => !d.entries.some((x) => x.id === e.id))] });
    } catch (e) { toast("err", e instanceof Error ? e.message : "Erro"); }
    finally { setLoadingMore(false); }
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  function use(e: LibraryEntry) {
    api(`/api/library/${e.id}`, { method: "PATCH", json: { use: true } }).catch(() => {});
    router.push(`/${e.kind === "image" ? "image" : "video"}?lib=${e.id}`);
  }

  async function save() {
    if (!form) return;
    try {
      await api("/api/library", { method: "POST", json: { ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) } });
      toast("ok", "Referência adicionada à biblioteca");
      setForm(null); load();
    } catch (e) { toast("err", e instanceof Error ? e.message : "Erro"); }
  }

  async function attachVideo(f: File) {
    setUploading(true);
    try { const r = await uploadFiles([f], {}); const a = r.assets[0]; if (a) setForm((x) => x && { ...x, assetId: a.id, videoName: f.name }); }
    catch (e) { toast("err", e instanceof Error ? e.message : "Falha no upload"); }
    finally { setUploading(false); }
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Biblioteca de prompts" subtitle="Prompts de referência aprovados, com o vídeo de resultado e os inputs que cada um precisa. O Enhance do Claude usa esta biblioteca como referência."
        actions={<button className="btn-primary" onClick={() => setForm({ ...EMPTY, category: data?.categories[0] ?? "" })}><Plus className="h-4 w-4" />Nova referência</button>} />
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <div className="relative w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" /><input className="input pl-9" placeholder="Buscar por técnica, câmera, grading…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input !w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas as categorias</option>{data?.categories.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="input !w-auto" value={mode} onChange={(e) => setMode(e.target.value)}><option value="">Todos os modos</option>{Object.entries(data?.modes ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {[["", "Todas"], ["mega", "Da Mega"], ["externo", "Comunidade"]].map(([k, l]) => <button key={k} onClick={() => setOrigin(k)} className={`chip ${origin === k ? "chip-active" : ""}`}>{l}</button>)}
        {data && <span className="ml-auto text-xs text-muted">{data.entries.length} de {data.total.toLocaleString("pt-BR")}</span>}
      </div>
      <div className="p-6">
        {!data ? <Spinner className="h-6 w-6" /> : data.entries.length === 0 ? <Empty icon={<BookOpen className="h-8 w-8" />} title="Nenhuma referência encontrada" /> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {data.entries.map((e) => (
              <div key={e.id} className="card flex flex-col overflow-hidden">
                <button onClick={() => setOpen(e)} className="relative aspect-video bg-card">
                  {e.video_url ? <CardVideo src={e.video_url} poster={e.thumb_url} />
                    : <div className="flex h-full flex-col items-center justify-center gap-1 text-muted"><Film className="h-6 w-6" /><span className="text-[11px]">sem vídeo de exemplo</span></div>}
                  <span className="absolute left-2 top-2 rounded bg-black/80 px-2 py-0.5 text-[10.5px] font-bold text-mega-yellow">{e.category}</span>
                  {(e.duration || e.ratio) && <span className="absolute right-2 top-2 rounded bg-black/80 px-2 py-0.5 text-[10.5px] text-white">{[e.duration && `${e.duration}s`, e.ratio].filter(Boolean).join(" · ")}</span>}
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="font-bold leading-tight">{e.title}</div>
                  <div className="text-[11px] text-muted">{getModel(e.model ?? "")?.name ?? e.model ?? "Qualquer modelo"}{e.mode ? ` · ${data.modes[e.mode] ?? e.mode}` : ""} · usado {e.uses}×{e.external ? ` · ${e.author ? `${e.author} · ` : ""}comunidade` : e.source_url ? ` · ${e.source_url}` : ""}</div>
                  <p className="line-clamp-3 font-mono text-[11px] leading-relaxed text-soft">{e.prompt}</p>
                  {e.inputs.length > 0 && <div className="flex flex-wrap gap-1">{e.inputs.map((i) => <span key={i} className="chip !text-[10px]">⤷ {i}</span>)}</div>}
                  <div className="mt-auto flex gap-1.5 pt-1">
                    <button className="btn-primary flex-1 !py-1.5 text-xs" onClick={() => use(e)}><Wand2 className="h-3.5 w-3.5" />Usar no gerador</button>
                    <button className="btn-outline !px-2 !py-1.5" title="Copiar prompt" onClick={() => { navigator.clipboard.writeText(e.prompt); toast("ok", "Prompt copiado"); }}><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {data && data.entries.length < data.total && (
          <div className="mt-6 flex justify-center"><button className="btn-outline" disabled={loadingMore} onClick={more}>{loadingMore ? <Spinner /> : null}Carregar mais ({(data.total - data.entries.length).toLocaleString("pt-BR")} restantes)</button></div>
        )}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} wide title={open?.title}
        footer={open && <>
          {open.external && open.source_url && <a className="btn-ghost" href={open.source_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Ver na fonte</a>}
          <button className="btn-danger mr-auto" onClick={async () => { if (await confirm("Excluir esta referência da biblioteca?")) { await api(`/api/library/${open.id}`, { method: "DELETE" }).then(() => { setOpen(null); load(); }).catch((e) => toast("err", e.message)); } }}><Trash2 className="h-4 w-4" />Excluir</button>
          <button className="btn-primary" onClick={() => use(open)}><Wand2 className="h-4 w-4" />Usar no gerador</button>
        </>}>
        {open && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              {open.video_url && <video src={open.video_url} controls className="w-full rounded-lg" />}
              <div className="flex flex-wrap gap-1">{open.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>
              {open.inputs.length > 0 && <div><div className="label">Inputs que este prompt precisa</div><ul className="space-y-1 text-sm text-soft">{open.inputs.map((i) => <li key={i}>⤷ {i}</li>)}</ul></div>}
              {open.notes && <div><div className="label">{open.external ? "Origem" : "Por que funciona"}</div><p className="text-sm text-soft">{open.notes}</p></div>}
              {open.external ? <p className="text-[11px] text-muted">Prompt da comunidade com crédito ao autor. O vídeo de exemplo é exibido direto da fonte e não pode ser reutilizado em entregas.</p> : null}
            </div>
            <div><div className="label">Prompt</div><p className="whitespace-pre-wrap rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed">{open.prompt}</p></div>
          </div>
        )}
      </Modal>

      <Modal open={!!form} onClose={() => setForm(null)} wide title="Nova referência" footer={<><button className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn-primary" disabled={!form?.title || !form?.prompt || !form?.category} onClick={save}>Salvar</button></>}>
        {form && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div><label className="label">Título</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Categoria</label><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{data?.categories.map((c) => <option key={c}>{c}</option>)}</select></div>
                <div><label className="label">Modelo</label><select className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value, kind: getModel(e.target.value)?.kind === "image" ? "image" : "video" })}>{MODELS.filter((m) => m.kind === "video" || m.kind === "image").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              </div>
              <div><label className="label">Inputs necessários</label><div className="flex flex-wrap gap-1">{data?.inputTypes.map((i) => <button key={i} onClick={() => setForm({ ...form, inputs: form.inputs.includes(i) ? form.inputs.filter((x) => x !== i) : [...form.inputs, i] })} className={`chip ${form.inputs.includes(i) ? "chip-active" : ""}`}>{i}</button>)}</div></div>
              <div><label className="label">Tags (separadas por vírgula)</label><input className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="dolly in, contraluz, teal & orange" /></div>
              <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) attachVideo(f); }} className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line-strong p-4 text-center text-xs text-muted hover:border-mega-amber">
                {uploading ? <Spinner /> : <UploadCloud className="h-5 w-5" />}{form.videoName || "Arraste o vídeo de resultado (exemplo)"}
                <input type="file" accept="video/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) attachVideo(f); }} />
              </label>
            </div>
            <div className="space-y-3">
              <div><label className="label">Prompt</label><textarea rows={9} className="input font-mono text-xs" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} /></div>
              <div><label className="label">Por que funciona / dicas de input</label><textarea rows={4} className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
          </div>
        )}
      </Modal>
      {node}
    </div>
  );
}

/** Miniatura como <img> sem referer (a CDN de miniaturas recusa hotlink com referer); o vídeo só carrega ao passar o mouse. */
function CardVideo({ src, poster }: { src: string; poster?: string | null }) {
  const [hover, setHover] = useState(false);
  const [posterOk, setPosterOk] = useState(!!poster);
  return (
    <div className="h-full w-full" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {posterOk && poster && !hover
        ? <img src={poster} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" onError={() => setPosterOk(false)} />
        : <video src={hover || !posterOk ? src + (hover ? "" : "#t=0.5") : undefined} preload={hover ? "auto" : "metadata"} autoPlay={hover} muted loop playsInline className="h-full w-full object-cover" />}
    </div>
  );
}
