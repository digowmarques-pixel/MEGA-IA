"use client";

import { AudioLines, ChevronDown, Mic2, Pause, Play, Plus, Search, Sparkles, Undo2, UploadCloud, UserRoundPlus, Wallet as WalletIcon, Wand2, Waves, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetView } from "@/lib/assets";
import { AUDIO_TAGS } from "@/lib/audio-tags";
import { api, fmtCredits, fmtUsd, isAssetDrag, isFileDrag, readDraggedAssets, uid } from "@/lib/client";
import { DestinationPicker, type Destination } from "./DestinationPicker";
import { Gallery } from "./Gallery";
import { ResizablePanels } from "./Resizable";
import { Spinner, useToast } from "./ui";

type Tab = "tts" | "design" | "sfx" | "isolate" | "changer";
type VoiceOpt = { id: string; name: string; category: string; labels: Record<string, string>; preview: string | null };
type Catalog = { mode: "live" | "mock"; ttsModels: { id: string; name: string; languages: { language_id: string; name: string }[] }[]; stsModels: { id: string; name: string }[]; voices: VoiceOpt[]; outputFormats: { id: string; label: string }[]; subscription: { character_count: number; character_limit: number } | null };
type WalletOpt = { type: "project" | "user" | "personal"; id: number; label: string; balance: number };
type Est = { elCredits: number; credits: number; usd: number; wallet: { balance: number } | null; walletError?: string };

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "tts", label: "Text to Speech", icon: AudioLines },
  { id: "design", label: "Criação de voz", icon: UserRoundPlus },
  { id: "sfx", label: "Sound Effects", icon: Sparkles },
  { id: "isolate", label: "Voice Isolator", icon: Waves },
  { id: "changer", label: "Voice Changer", icon: Mic2 },
];
const LANG_PT: Record<string, string> = { pt: "Português", en: "Inglês", es: "Espanhol", fr: "Francês", it: "Italiano", de: "Alemão", ja: "Japonês" };

export function AudioStudio() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("tts");
  const [cat, setCat] = useState<Catalog | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dest, setDest] = useState<Destination>({ projectId: null, scenarioId: null, sceneId: null });
  const [wallets, setWallets] = useState<WalletOpt[]>([]);
  const [wallet, setWallet] = useState<WalletOpt["type"] | "">("");
  const [busy, setBusy] = useState(false);
  const [inputAsset, setInputAsset] = useState<AssetView | null>(null);

  const loadCatalog = useCallback((fresh = false) => api<Catalog>(`/api/audio/catalog${fresh ? "?fresh=1" : ""}`).then(setCat).catch((e) => toast("err", e.message)), [toast]);
  useEffect(() => { loadCatalog(); }, [loadCatalog]);
  const loadWallets = useCallback(() => {
    api<{ wallets: WalletOpt[]; default: { type: WalletOpt["type"] } }>(`/api/wallets${dest.projectId ? `?projectId=${dest.projectId}` : ""}`)
      .then((r) => { setWallets(r.wallets); setWallet((c) => (c && r.wallets.some((w) => w.type === c) ? c : r.default.type)); }).catch(() => {});
  }, [dest.projectId]);
  useEffect(loadWallets, [loadWallets]);

  const done = () => { setRefreshKey((k) => k + 1); loadWallets(); window.dispatchEvent(new Event("mega:wallet")); };

  /** Envia o pedido (JSON ou FormData), com id único por clique para nunca cobrar duas vezes. */
  async function submit(url: string, body: Record<string, unknown> | FormData, okMsg: string) {
    setBusy(true);
    const rid = uid();
    try {
      let r: unknown;
      if (body instanceof FormData) {
        body.append("clientRequestId", rid);
        if (wallet) body.append("wallet", wallet);
        for (const [k, v] of Object.entries(dest)) if (v) body.append(k, String(v));
        r = await api(url, { method: "POST", body });
      } else r = await api(url, { method: "POST", json: { ...body, ...dest, wallet: wallet || null, clientRequestId: rid } });
      toast("ok", okMsg);
      return r;
    } catch (e) {
      toast("err", e instanceof Error ? e.message : "Falha");
      return null;
    } finally {
      setBusy(false);
      done();
    }
  }

  const common = { cat, busy, wallets, wallet, setWallet, dest, submit, inputAsset, setInputAsset };

  return (
    <ResizablePanels id="studio-audio" defaults={[34, 66]} mins={[26, 35]}>
      <div className="flex h-full flex-col border-r border-line bg-panel">
        <div className="grid grid-cols-5 gap-0.5 border-b border-line p-1.5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} title={t.label}
              className={`flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10.5px] font-semibold leading-tight transition ${tab === t.id ? "bg-raised text-white" : "text-muted hover:text-white"}`}>
              <t.icon className={`h-4 w-4 ${tab === t.id ? "text-mega-yellow" : ""}`} />{t.label}
            </button>
          ))}
        </div>
        {cat?.mode === "mock" && <div className="border-b border-line bg-mega-orange/10 px-3 py-1.5 text-[11px] text-mega-orange">Simulação: configure ELEVENLABS_API_KEY no servidor para usar a conta da empresa.</div>}
        {!cat ? <div className="flex flex-1 items-center justify-center"><Spinner className="h-5 w-5" /></div> : (
          <div className="min-h-0 flex-1">
            {tab === "tts" && <TtsPanel {...common} />}
            {tab === "design" && <DesignPanel {...common} onVoiceSaved={() => loadCatalog(true)} />}
            {tab === "sfx" && <SfxPanel {...common} />}
            {tab === "isolate" && <InputPanel {...common} op="isolate" />}
            {tab === "changer" && <InputPanel {...common} op="changer" />}
          </div>
        )}
        <div className="border-t border-line px-3 py-2">
          <div className="label !mb-1">Salvar em</div>
          <DestinationPicker value={dest} onChange={setDest} />
        </div>
      </div>
      <Gallery kinds={["audio"]} refreshKey={refreshKey} onUseAsReference={(a) => { if (a.kind !== "image") { setInputAsset(a); setTab((t) => (t === "changer" ? "changer" : "isolate")); } }} />
    </ResizablePanels>
  );
}

type Common = {
  cat: Catalog | null; busy: boolean; wallets: WalletOpt[]; wallet: WalletOpt["type"] | ""; setWallet: (w: WalletOpt["type"]) => void; dest: Destination;
  submit: (url: string, body: Record<string, unknown> | FormData, okMsg: string) => Promise<unknown>;
  inputAsset: AssetView | null; setInputAsset: (a: AssetView | null) => void;
};

/** Rodapé com carteira, custo estimado e botão de ação. */
function Footer({ op, payload, wallets, wallet, setWallet, dest, busy, disabled, label, onClick }: Common & { op: string; payload: Record<string, unknown>; disabled: boolean; label: string; onClick: () => void }) {
  const [est, setEst] = useState<Est | null>(null);
  const key = JSON.stringify({ op, payload, wallet, dest });
  useEffect(() => {
    const t = setTimeout(() => api<Est>("/api/audio/estimate", { method: "POST", json: { op, ...payload, ...dest, wallet: wallet || null } }).then(setEst).catch(() => setEst(null)), 350);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const insufficient = !!est?.wallet && est.credits > est.wallet.balance + 1e-9;
  return (
    <div className="space-y-2 border-t border-line bg-panel p-3">
      <div className="flex items-center gap-2">
        <WalletIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
        <select className="input !py-1 text-xs" value={wallet} onChange={(e) => setWallet(e.target.value as WalletOpt["type"])}>
          {wallets.map((w) => <option key={w.type} value={w.type}>{w.label} — {fmtCredits(w.balance)} créditos</option>)}
        </select>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Custo estimado {est ? <span className="text-[10.5px]">({fmtCredits(est.elCredits)} créd. ElevenLabs)</span> : null}</span>
        <span className={`font-bold tabular-nums ${insufficient ? "text-red-400" : ""}`}>{est ? `${fmtCredits(est.credits)} cr · ${fmtUsd(est.usd)}` : "—"}</span>
      </div>
      {insufficient && <p className="text-[11px] text-red-400">Saldo insuficiente nesta carteira.</p>}
      {est?.walletError && <p className="text-[11px] text-red-400">{est.walletError}</p>}
      <button className="btn-primary w-full py-2.5" disabled={busy || disabled || insufficient || !!est?.walletError} onClick={onClick}>
        {busy ? <Spinner /> : <Zap className="h-4 w-4" />}{busy ? "Gerando…" : label}
      </button>
    </div>
  );
}

function Slider({ label, left, right, value, onChange, min = 0, max = 1, step = 0.01, fmt }: { label: string; left?: string; right?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; fmt?: (v: number) => string }) {
  return (
    <div>
      <div className="flex justify-between"><span className="label !mb-0.5">{label}</span><span className="text-[11px] tabular-nums text-soft">{fmt ? fmt(value) : value.toFixed(2)}</span></div>
      {(left || right) && <div className="flex justify-between text-[10.5px] text-muted"><span>{left}</span><span>{right}</span></div>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#FDC010]" />
    </div>
  );
}

function VoicePicker({ voices, value, onChange }: { voices: VoiceOpt[]; value: string; onChange: (v: VoiceOpt) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cur = voices.find((v) => v.id === value);
  const list = voices.filter((v) => `${v.name} ${Object.values(v.labels).join(" ")} ${v.category}`.toLowerCase().includes(q.toLowerCase()));
  const play = (v: VoiceOpt) => {
    audio.current?.pause();
    if (playing === v.id || !v.preview) { setPlaying(null); return; }
    audio.current = new Audio(v.preview);
    audio.current.onended = () => setPlaying(null);
    audio.current.play().catch(() => setPlaying(null));
    setPlaying(v.id);
  };
  useEffect(() => () => audio.current?.pause(), []);
  return (
    <div className="relative">
      <div className="label">Voz</div>
      <button onClick={() => setOpen((o) => !o)} className="input flex items-center justify-between text-left">
        <span className="flex items-center gap-2"><span className="mega-stripes flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black text-black">{cur?.name.slice(0, 1) ?? "?"}</span><span className="font-semibold">{cur?.name ?? "Escolha uma voz"}</span></span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-full rounded-xl border border-line-strong bg-raised p-1.5 shadow-2xl">
            <div className="relative mb-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" /><input autoFocus className="input !py-1.5 pl-8 text-xs" placeholder="Buscar voz, sotaque, gênero…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="max-h-72 overflow-y-auto">
              {list.map((v) => (
                <div key={v.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-card ${v.id === value ? "bg-card" : ""}`}>
                  <button className="rounded-full bg-black p-1.5 hover:bg-mega-yellow hover:text-black disabled:opacity-30" disabled={!v.preview} title="Ouvir prévia" onClick={() => play(v)}>{playing === v.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}</button>
                  <button className="min-w-0 flex-1 text-left" onClick={() => { onChange(v); setOpen(false); }}>
                    <div className="truncate text-sm font-semibold">{v.name}</div>
                    <div className="truncate text-[10.5px] text-muted">{[v.category, ...Object.values(v.labels)].filter(Boolean).join(" · ")}</div>
                  </button>
                </div>
              ))}
              {list.length === 0 && <p className="p-3 text-center text-xs text-muted">Nenhuma voz encontrada.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Text to Speech ----------------
function TtsPanel(c: Common) {
  const toast = useToast();
  const cat = c.cat!;
  const [text, setText] = useState("");
  const [prevText, setPrevText] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceOpt | null>(cat.voices[0] ?? null);
  const [modelId, setModelId] = useState(cat.ttsModels[0]?.id ?? "");
  const [stability, setStability] = useState(0.45);
  const [similarity, setSimilarity] = useState(0.9);
  const [style, setStyle] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [boost, setBoost] = useState(true);
  const [lang, setLang] = useState("");
  const [format, setFormat] = useState("mp3_44100_192");
  const [advanced, setAdvanced] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagQ, setTagQ] = useState("");
  const [direction, setDirection] = useState("");
  const [tagging, setTagging] = useState(false);
  const [note, setNote] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  const model = cat.ttsModels.find((m) => m.id === modelId);

  function insertTag(tag: string) {
    const el = ta.current;
    const start = el?.selectionStart ?? text.length, end = el?.selectionEnd ?? text.length;
    const before = text.slice(0, start), after = text.slice(end);
    const pad = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
    const next = `${before}${pad}${tag} ${after.replace(/^\s+/, "")}`;
    setText(next);
    setTagsOpen(false);
    requestAnimationFrame(() => { const pos = (before + pad + tag + " ").length; el?.focus(); el?.setSelectionRange(pos, pos); });
  }

  async function autoTag() {
    if (!text.trim()) return toast("err", "Escreva o texto primeiro");
    setTagging(true);
    try {
      const r = await api<{ tagged_text: string; tags_used: string[]; note: string }>("/api/audio/autotag", { method: "POST", json: { text, direction } });
      setPrevText(text);
      setText(r.tagged_text);
      setNote(`${r.tags_used.length} tags · ${r.note}`);
    } catch (e) { toast("err", e instanceof Error ? e.message : "Falha nas tags automáticas"); }
    finally { setTagging(false); }
  }

  const filteredTags = AUDIO_TAGS.map((g) => ({ ...g, tags: g.tags.filter((t) => t.toLowerCase().includes(tagQ.toLowerCase())) })).filter((g) => g.tags.length);
  const payload = { chars: text.length, modelId };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <VoicePicker voices={cat.voices} value={voice?.id ?? ""} onChange={setVoice} />
        <div>
          <div className="label">Modelo</div>
          <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {cat.ttsModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between"><span className="label !mb-0">Texto</span><span className={`text-[10.5px] tabular-nums ${text.length > 10000 ? "text-red-400" : "text-muted"}`}>{text.length.toLocaleString("pt-BR")} / 10.000 caracteres</span></div>
          <textarea ref={ta} value={text} onChange={(e) => { setText(e.target.value); setNote(""); }} rows={9} className="input resize-y leading-relaxed" placeholder="Digite o texto da locução. Use [tags] para direcionar a interpretação, ou clique em “Adicionar tags automaticamente”." />
          <div className="relative mt-2 flex gap-1.5">
            <button className="btn-outline flex-1 !px-2 text-xs" disabled={tagging || !text.trim()} onClick={autoTag}>
              {tagging ? <Spinner /> : <Wand2 className="h-3.5 w-3.5 text-mega-yellow" />}Adicionar tags automaticamente
            </button>
            <button className="btn-outline !px-2 text-xs" onClick={() => setTagsOpen((o) => !o)} title="Inserir tag manualmente"><Plus className="h-3.5 w-3.5" />Tag</button>
            {prevText !== null && <button className="btn-ghost !px-2 text-xs" title="Desfazer tags automáticas" onClick={() => { setText(prevText); setPrevText(null); setNote(""); }}><Undo2 className="h-3.5 w-3.5" /></button>}
            {tagsOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setTagsOpen(false)} />
                <div className="absolute bottom-full right-0 z-30 mb-1 w-full rounded-xl border border-line-strong bg-raised p-2 shadow-2xl">
                  <div className="relative mb-2"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" /><input autoFocus className="input !py-1.5 pl-8 text-xs" placeholder="Pesquisar tags" value={tagQ} onChange={(e) => setTagQ(e.target.value)} /></div>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {filteredTags.map((g) => (
                      <div key={g.group}>
                        <div className="mb-1 text-[10.5px] font-semibold text-muted">{g.group}</div>
                        <div className="flex flex-wrap gap-1">{g.tags.map((t) => <button key={t} onClick={() => insertTag(t)} className="chip hover:border-mega-amber hover:text-white">{t}</button>)}</div>
                      </div>
                    ))}
                    {tagQ && !filteredTags.length && <button className="chip" onClick={() => insertTag(`[${tagQ.replace(/[[\]]/g, "")}]`)}>Usar “[{tagQ}]”</button>}
                  </div>
                </div>
              </>
            )}
          </div>
          <input className="input mt-1.5 !py-1.5 text-xs" value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="Direção para as tags (opcional): ex. narrador épico de trailer, crescendo no final" />
          {note && <p className="mt-1.5 text-[11px] text-mega-yellow">{note}</p>}
        </div>

        <Slider label="Estabilidade" left="Criativo" right="Robusto" value={stability} onChange={setStability} />
        <Slider label="Similaridade" left="Baixa" right="Alta" value={similarity} onChange={setSimilarity} />
        <div>
          <div className="label">Idioma</div>
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="">Automático</option>
            {(model?.languages ?? []).map((l) => <option key={l.language_id} value={l.language_id}>{LANG_PT[l.language_id] ?? l.name}</option>)}
          </select>
        </div>
        <div>
          <div className="label">Formato de saída</div>
          <select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>{cat.outputFormats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
        </div>
        <button className="flex w-full items-center justify-between text-xs font-semibold text-soft" onClick={() => setAdvanced((a) => !a)}>Mais ajustes <ChevronDown className={`h-4 w-4 transition ${advanced ? "rotate-180" : ""}`} /></button>
        {advanced && (
          <div className="space-y-4">
            <Slider label="Exagero de estilo" left="Nenhum" right="Máximo" value={style} onChange={setStyle} />
            <Slider label="Velocidade" left="Mais lenta" right="Mais rápida" value={speed} onChange={setSpeed} min={0.7} max={1.2} step={0.01} fmt={(v) => `${v.toFixed(2)}×`} />
            <label className="flex items-center justify-between text-xs font-semibold"><span>Speaker boost (mais semelhança, um pouco mais lento)</span><input type="checkbox" checked={boost} onChange={(e) => setBoost(e.target.checked)} className="h-4 w-4 accent-[#FDC010]" /></label>
          </div>
        )}
      </div>
      <Footer {...c} op="tts" payload={payload} disabled={!text.trim() || text.length > 10000 || !voice} label="Gerar fala"
        onClick={() => c.submit("/api/audio/tts", { text, voiceId: voice!.id, voiceName: voice!.name, modelId, stability, similarity, style, speed, speakerBoost: boost, languageCode: lang || null, outputFormat: format }, "Locução gerada")} />
    </div>
  );
}

// ---------------- Criação de voz ----------------
function DesignPanel(c: Common & { onVoiceSaved: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"design" | "clone">("design");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [previews, setPreviews] = useState<{ generatedVoiceId: string; url: string }[]>([]);
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [noise, setNoise] = useState(true);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      if (mode === "design") await api("/api/audio/design/save", { method: "POST", json: { name, description, generatedVoiceId: chosen } });
      else {
        const fd = new FormData();
        fd.append("name", name); fd.append("description", description); fd.append("consent", String(consent)); fd.append("removeBackgroundNoise", String(noise));
        files.forEach((f) => fd.append("files", f));
        await api("/api/audio/clone", { method: "POST", body: fd });
      }
      toast("ok", `Voz “${name}” salva na conta ElevenLabs — já aparece na lista de vozes`);
      setPreviews([]); setChosen(""); setName(""); setFiles([]); setConsent(false);
      c.onVoiceSaved();
    } catch (e) { toast("err", e instanceof Error ? e.message : "Falha ao salvar a voz"); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-card p-1">
          {([["design", "Desenhar por descrição"], ["clone", "Clonar de amostras"]] as const).map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-md py-1.5 text-xs font-semibold ${mode === m ? "bg-mega-yellow text-black" : "text-soft"}`}>{l}</button>
          ))}
        </div>
        <div>
          <div className="label">{mode === "design" ? "Descreva a voz" : "Descrição (opcional)"}</div>
          <textarea rows={4} className="input resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: homem brasileiro, 40 anos, voz grave e aveludada, ritmo calmo, tom de narrador de documentário, leve rouquidão" />
        </div>
        {mode === "design" ? (
          <>
            <div>
              <div className="label">Texto da prévia (opcional, mín. 100 caracteres)</div>
              <textarea rows={3} className="input resize-y" value={text} onChange={(e) => setText(e.target.value)} placeholder="Se deixar vazio, a ElevenLabs cria um texto adequado à voz." />
            </div>
            {previews.length > 0 && (
              <div className="space-y-2">
                <div className="label">Escolha uma prévia</div>
                {previews.map((p, i) => (
                  <label key={p.generatedVoiceId} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 ${chosen === p.generatedVoiceId ? "border-mega-amber bg-mega-yellow/5" : "border-line"}`}>
                    <input type="radio" name="preview" checked={chosen === p.generatedVoiceId} onChange={() => setChosen(p.generatedVoiceId)} className="accent-[#FDC010]" />
                    <span className="w-14 text-xs font-bold">Prévia {i + 1}</span>
                    <audio src={p.url} controls className="h-8 min-w-0 flex-1" />
                  </label>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFiles((f) => [...f, ...Array.from(e.dataTransfer.files).filter((x) => /^(audio|video)\//.test(x.type))]); }}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line-strong p-5 text-center text-xs text-muted hover:border-mega-amber">
              <UploadCloud className="h-6 w-6" />Arraste as amostras de áudio (1 a 3 minutos no total, voz limpa, sem música)
              <input type="file" accept="audio/*,video/*" multiple hidden onChange={(e) => { setFiles((f) => [...f, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
            </label>
            {files.map((f, i) => <div key={i} className="flex items-center justify-between rounded-lg bg-card px-3 py-1.5 text-xs"><span className="truncate">{f.name}</span><button onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button></div>)}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={noise} onChange={(e) => setNoise(e.target.checked)} className="accent-[#FDC010]" />Remover ruído de fundo das amostras</label>
            <label className="flex items-start gap-2 rounded-lg border border-mega-orange/40 bg-mega-orange/5 p-2.5 text-xs"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[#FDC010]" />Confirmo que a dona ou o dono desta voz autorizou a clonagem para uso da produtora.</label>
          </>
        )}
        {(mode === "clone" || chosen) && (
          <div className="space-y-2 rounded-xl border border-line p-3">
            <div className="label">Nome da voz</div>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: OTTO - VOZ" />
            <button className="btn-outline w-full" disabled={saving || !name.trim() || (mode === "clone" ? !files.length || !consent : !chosen)} onClick={save}>{saving ? <Spinner /> : <UserRoundPlus className="h-4 w-4" />}Salvar voz na conta</button>
          </div>
        )}
      </div>
      {mode === "design" && (
        <Footer {...c} op="design" payload={{ chars: text.length }} disabled={description.trim().length < 20} label="Gerar 3 prévias"
          onClick={async () => {
            const r = (await c.submit("/api/audio/design", { description, text }, "Prévias prontas — escolha uma e salve")) as { previews?: { generatedVoiceId: string; url: string }[] } | null;
            if (r?.previews) { setPreviews(r.previews); setChosen(r.previews[0]?.generatedVoiceId ?? ""); }
          }} />
      )}
    </div>
  );
}

// ---------------- Sound Effects ----------------
function SfxPanel(c: Common) {
  const cat = c.cat!;
  const [text, setText] = useState("");
  const [auto, setAuto] = useState(true);
  const [duration, setDuration] = useState(5);
  const [influence, setInfluence] = useState(0.3);
  const [loop, setLoop] = useState(false);
  const [format, setFormat] = useState("mp3_44100_192");
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <div className="label">Descreva o som</div>
          <textarea rows={5} className="input resize-y" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: torcida de estádio explodindo em comemoração ao gol, eco grande, chuva leve ao fundo" />
        </div>
        <label className="flex items-center justify-between text-xs font-semibold"><span>Duração automática</span><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[#FDC010]" /></label>
        {!auto && <Slider label="Duração" value={duration} onChange={setDuration} min={0.5} max={30} step={0.5} fmt={(v) => `${v}s`} />}
        <Slider label="Fidelidade ao texto" left="Mais criativo" right="Mais literal" value={influence} onChange={setInfluence} />
        <label className="flex items-center justify-between text-xs font-semibold"><span>Loop contínuo (para ambiências)</span><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="h-4 w-4 accent-[#FDC010]" /></label>
        <div><div className="label">Formato de saída</div><select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>{cat.outputFormats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
      </div>
      <Footer {...c} op="sfx" payload={{ durationSec: auto ? null : duration }} disabled={!text.trim()} label="Gerar efeito"
        onClick={() => c.submit("/api/audio/sfx", { text, durationSec: auto ? null : duration, promptInfluence: influence, loop, outputFormat: format }, "Efeito sonoro gerado")} />
    </div>
  );
}

// ---------------- Voice Isolator / Voice Changer ----------------
function InputPanel(c: Common & { op: "isolate" | "changer" }) {
  const toast = useToast();
  const cat = c.cat!;
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [voice, setVoice] = useState<VoiceOpt | null>(cat.voices[0] ?? null);
  const [stsModel, setStsModel] = useState(cat.stsModels[0]?.id ?? "eleven_multilingual_sts_v2");
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.85);
  const [style, setStyle] = useState(0);
  const [noise, setNoise] = useState(false);
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  const src = fileUrl ?? c.inputAsset?.url ?? null;
  const name = file?.name ?? c.inputAsset?.filename ?? null;

  async function onDrop(e: React.DragEvent) {
    e.preventDefault(); setOver(false);
    const ids = readDraggedAssets(e);
    if (ids.length) {
      const r = await api<{ asset: AssetView }>(`/api/assets/${ids[0]}`);
      if (r.asset.kind === "image") return toast("err", "Escolha um áudio ou vídeo");
      setFile(null); setDuration(null); c.setInputAsset(r.asset); return;
    }
    const f = Array.from(e.dataTransfer.files).find((x) => /^(audio|video)\//.test(x.type));
    if (f) { setFile(f); setDuration(null); c.setInputAsset(null); } else toast("err", "Arquivo não é áudio nem vídeo");
  }

  const payload = useMemo(() => ({ durationSec: duration ?? 60 }), [duration]);
  const ready = !!src && (c.op === "isolate" || !!voice);
  const run = () => {
    const fd = new FormData();
    if (file) fd.append("file", file); else if (c.inputAsset) fd.append("assetId", String(c.inputAsset.id));
    if (duration) fd.append("durationSec", String(duration));
    if (c.op === "changer") {
      fd.append("voiceId", voice!.id); fd.append("voiceName", voice!.name); fd.append("modelId", stsModel);
      fd.append("stability", String(stability)); fd.append("similarity", String(similarity)); fd.append("style", String(style));
      fd.append("removeBackgroundNoise", String(noise));
    }
    return c.submit(c.op === "isolate" ? "/api/audio/isolate" : "/api/audio/changer", fd, c.op === "isolate" ? "Voz isolada" : "Voz trocada");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-xs text-muted">{c.op === "isolate" ? "Remove música, ruído e ambiente, deixando só a voz. Aceita áudio ou vídeo." : "Mantém a interpretação (ritmo, emoção, entonação) e troca o timbre pela voz escolhida."}</p>
        <label onDragOver={(e) => { if (isFileDrag(e) || isAssetDrag(e)) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed p-6 text-center text-xs transition ${over ? "border-mega-yellow bg-mega-yellow/5 text-mega-yellow" : "border-line-strong text-muted hover:border-mega-amber"}`}>
          <UploadCloud className="h-7 w-7" />
          {name ? <span className="font-semibold text-white">{name}</span> : "Arraste um áudio ou vídeo (do computador ou da galeria)"}
          {duration ? <span>{Math.round(duration)}s</span> : null}
          <input type="file" accept="audio/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setDuration(null); c.setInputAsset(null); } e.target.value = ""; }} />
        </label>
        {src && <audio key={src} src={src} controls className="w-full" onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)} />}
        {c.op === "changer" && (
          <>
            <VoicePicker voices={cat.voices} value={voice?.id ?? ""} onChange={setVoice} />
            {cat.stsModels.length > 1 && <div><div className="label">Modelo</div><select className="input" value={stsModel} onChange={(e) => setStsModel(e.target.value)}>{cat.stsModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
            <Slider label="Estabilidade" left="Criativo" right="Robusto" value={stability} onChange={setStability} />
            <Slider label="Similaridade" left="Baixa" right="Alta" value={similarity} onChange={setSimilarity} />
            <Slider label="Exagero de estilo" value={style} onChange={setStyle} />
            <label className="flex items-center justify-between text-xs font-semibold"><span>Remover ruído de fundo</span><input type="checkbox" checked={noise} onChange={(e) => setNoise(e.target.checked)} className="h-4 w-4 accent-[#FDC010]" /></label>
          </>
        )}
      </div>
      <Footer {...c} op={c.op} payload={payload} disabled={!ready} label={c.op === "isolate" ? "Isolar voz" : "Trocar voz"} onClick={run} />
    </div>
  );
}
