"use client";

import { Clapperboard, Film, ImageIcon, Plus, Sparkles, Trash2, Wallet as WalletIcon, Wand2, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetView } from "@/lib/assets";
import type { EnhanceResult } from "@/lib/claude";
import { api, fmtCredits, fmtUsd, isAssetDrag, isFileDrag, readDraggedAssets, uid, uploadFiles } from "@/lib/client";
import { defaultFlags, defaultOptions, MODELS, type GenKind, type ModelDef } from "@/lib/models";
import { applySheet, SHEET_PRESETS } from "@/lib/sheets";
import { DestinationPicker, type Destination } from "./DestinationPicker";
import { EnhanceDialog } from "./EnhanceDialog";
import { Spinner, useToast } from "./ui";

type WalletOpt = { type: "project" | "user" | "personal"; id: number; label: string; balance: number };
type Estimate = { credits: number; usd: number; source: string; wallet: (WalletOpt & { balance: number }) | null; walletError?: string };
type Voice = { voice_id: string; name: string; labels?: Record<string, string> };

const KIND_LABEL: Record<GenKind, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", upscale_image: "Upscale imagem", upscale_video: "Upscale vídeo", avatar: "Avatar" };

export type GeneratorHandle = { addReference: (a: AssetView) => void; setSource: (a: AssetView) => void };

export function Generator({ kind: initialKind, kinds, destination: fixedDest, onGenerated, injectRef, injectSource, injectPrompt, compact = false }: {
  kind: GenKind;
  /** tipos alternáveis no topo (ex.: imagem/vídeo dentro do projeto) */
  kinds?: GenKind[];
  /** destino fixo (dentro do projeto). Sem isso, mostra o seletor de destino. */
  destination?: Destination;
  onGenerated?: () => void;
  /** asset enviado de fora para virar referência / origem (muda a cada clique) */
  injectRef?: { asset: AssetView; nonce: number; asStart?: boolean } | null;
  injectSource?: { asset: AssetView; nonce: number } | null;
  injectPrompt?: { text: string; nonce: number; model?: string | null; flags?: Record<string, boolean> } | null;
  compact?: boolean;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<GenKind>(initialKind);
  const models = useMemo(() => MODELS.filter((m) => m.kind === kind), [kind]);
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const model = models.find((m) => m.id === modelId) ?? models[0];

  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const [count, setCount] = useState(1);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const pendingFlags = useRef<{ model: string; flags: Record<string, boolean> } | null>(null);
  const [multiShot, setMultiShot] = useState(false);
  const [shots, setShots] = useState<{ prompt: string; duration: number }[]>([{ prompt: "", duration: 5 }, { prompt: "", duration: 5 }]);
  const [refs, setRefs] = useState<AssetView[]>([]);
  const [source, setSource] = useState<AssetView | null>(null);
  const [dest, setDest] = useState<Destination>(fixedDest ?? { projectId: null, scenarioId: null, sceneId: null });
  const [wallets, setWallets] = useState<WalletOpt[]>([]);
  const [walletChoice, setWalletChoice] = useState<WalletOpt["type"] | "">("");
  const [est, setEst] = useState<Estimate | null>(null);
  const [estLoading, setEstLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [enhance, setEnhance] = useState<EnhanceResult | null>(null);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [voiceSettings, setVoiceSettings] = useState({ stability: 0.5, similarity: 0.75, style: 0 });
  const [refOver, setRefOver] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const sheetSubject = useRef("");
  const requestId = useRef<string | null>(null);

  // destino fixo do projeto acompanha a seleção de cena
  useEffect(() => { if (fixedDest) setDest(fixedDest); }, [fixedDest?.projectId, fixedDest?.scenarioId, fixedDest?.sceneId]); // eslint-disable-line react-hooks/exhaustive-deps

  // troca de tipo → primeiro modelo do tipo + padrões
  useEffect(() => {
    const m = MODELS.find((x) => x.kind === kind);
    if (m) setModelId(m.id);
  }, [kind]);
  useEffect(() => {
    if (!model) return;
    setOptions(defaultOptions(model));
    // flags pedidas por quem abriu o gerador (ex.: rascunho 480p vindo do blocking) sobrevivem à troca de modelo
    const pending = pendingFlags.current?.model === model.id ? pendingFlags.current.flags : null;
    if (pending) pendingFlags.current = null;
    setFlags({ ...defaultFlags(model), ...pending });
    if (!model.multiShot) setMultiShot(false);
    setCount((c) => Math.min(c, model.maxCount ?? 1));
    if (model.aspectRatios && !model.aspectRatios.includes(aspect)) setAspect(model.aspectRatios[0]);
    if (model.durations) setDuration((d) => Math.min(Math.max(d, model.durations!.min), model.durations!.max));
    if (!model.mediaRoles) setRefs([]);
  }, [model?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (injectRef) addRef(injectRef.asset, injectRef.asStart); }, [injectRef?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!injectPrompt) return;
    const m = injectPrompt.model ? MODELS.find((x) => x.id === injectPrompt.model) : null;
    if (m && (m.kind === kind || kinds?.includes(m.kind))) {
      if (injectPrompt.flags) {
        const valid = Object.fromEntries(Object.entries(injectPrompt.flags).filter(([k]) => m.flags?.some((f) => f.name === k)));
        if (m.id === model?.id) setFlags((f) => ({ ...f, ...valid })); else pendingFlags.current = { model: m.id, flags: valid };
      }
      setKind(m.kind); setTimeout(() => setModelId(m.id), 0);
    }
    setPrompt(injectPrompt.text);
    promptRef.current?.focus();
  }, [injectPrompt?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!injectSource) return;
    const a = injectSource.asset;
    setKind(a.kind === "video" ? "upscale_video" : "upscale_image");
    setSource(a);
  }, [injectSource?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // carteiras disponíveis para o destino atual
  const loadWallets = useCallback(() => {
    api<{ wallets: WalletOpt[]; default: { type: WalletOpt["type"] } }>(`/api/wallets${dest.projectId ? `?projectId=${dest.projectId}` : ""}`)
      .then((r) => { setWallets(r.wallets); setWalletChoice((c) => (c && r.wallets.some((w) => w.type === c) ? c : r.default.type)); })
      .catch(() => {});
  }, [dest.projectId]);
  useEffect(loadWallets, [loadWallets]);

  useEffect(() => {
    if (kind !== "audio" || voices) return;
    api<{ configured: boolean; voices: Voice[] }>("/api/elevenlabs/voices").then((r) => { setVoices(r.voices); if (r.voices[0]) setVoiceId(r.voices[0].voice_id); }).catch(() => setVoices([]));
  }, [kind, voices]);

  const roles = model?.mediaRoles ?? [];
  const isUpscale = kind === "upscale_image" || kind === "upscale_video";
  const maxRefs = roles.length ? model?.maxRefs ?? (roles[0] === "image" ? 1 : 8) : 0;
  const useShots = !!model?.multiShot && multiShot;
  const shotsTotal = shots.reduce((t, s) => t + (Number(s.duration) || 0), 0);
  const roleFor = (i: number) => {
    if (kind !== "video") return roles[0];
    if (i === 0 && roles.includes("start_image")) return "start_image";
    if (i === 1 && roles.includes("end_image")) return "end_image";
    return roles.includes("image_references") ? "image_references" : roles[roles.length - 1];
  };
  /** Vídeos vão como video_references; imagens seguem a ordem frame inicial → final → referências. */
  const roleOf = (r: AssetView, i: number) => (r.kind === "video" ? "video_references" : roleFor(refs.slice(0, i).filter((x) => x.kind !== "video").length));
  const roleLabel = (r: string) => ({ video_references: "Vídeo ref.",  start_image: "Frame inicial", end_image: "Frame final", image_references: "Referência", image: "Referência" } as Record<string, string>)[r] ?? r;

  function addRef(a: AssetView, asStart = false) {
    if (a.kind === "audio") return toast("err", "Áudio não pode ser usado como referência aqui");
    if (a.kind === "video") {
      // vídeo de referência (ex.: blocking 3D): só modelos com video_references — padrão Seedance 2.5
      setKind("video");
      if (!roles.includes("video_references")) setModelId("seedance_2_5");
      setRefs((r) => (r.some((x) => x.id === a.id) ? r : [...r.filter((x) => x.kind !== "video"), a]));
      // a duração do vídeo final acompanha a do blocking (respeitando o mínimo do modelo)
      if (a.duration) setDuration(Math.min(30, Math.max(4, Math.round(a.duration))));
      return;
    }
    if (asStart) setKind("video");
    setRefs((r) => {
      if (r.some((x) => x.id === a.id)) return r;
      const next = asStart ? [a, ...r] : [...r, a];
      return next.slice(0, Math.max(maxRefs, asStart ? 2 : 1));
    });
  }

  const request = useMemo(() => ({
    kind, model: model?.id, prompt,
    aspectRatio: model?.aspectRatios ? aspect : undefined,
    duration: model?.durations ? duration : undefined,
    count: model?.maxCount ? count : 1,
    options,
    flags,
    shots: useShots ? shots : undefined,
    projectId: dest.projectId, scenarioId: dest.scenarioId, sceneId: dest.sceneId,
    references: refs.map((r, i) => ({ assetId: r.id, role: roleOf(r, i) })),
    sourceAssetId: isUpscale ? source?.id : undefined,
    wallet: walletChoice || null,
    voiceId: kind === "audio" ? voiceId : undefined,
    voiceSettings: kind === "audio" ? voiceSettings : undefined,
  }), [kind, model?.id, prompt, aspect, duration, count, options, flags, useShots, shots, dest, refs, isUpscale, source, walletChoice, voiceId, voiceSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  // prévia de custo (debounce) — usa o get_cost real do Higgsfield quando disponível
  const estKey = JSON.stringify({ ...request, prompt: kind === "audio" ? request.prompt : request.prompt ? "x" : "" });
  useEffect(() => {
    if (!model) return;
    setEstLoading(true);
    const t = setTimeout(() => {
      api<Estimate>("/api/generate/estimate", { method: "POST", json: request })
        .then(setEst)
        .catch(() => setEst(null))
        .finally(() => setEstLoading(false));
    }, 450);
    return () => clearTimeout(t);
  }, [estKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const insufficient = !!est?.wallet && est.credits > est.wallet.balance + 1e-9;
  const shotsInvalid = useShots && (shots.some((s) => !s.prompt.trim() || !(s.duration >= 1)) || (model?.durations && (shotsTotal < model.durations.min || shotsTotal > model.durations.max)));
  const missing = isUpscale ? !source : !prompt.trim() || (kind === "audio" && !voiceId) || !!shotsInvalid;
  const canGenerate = !busy && !missing && !insufficient && !est?.walletError;

  async function doEnhance() {
    if (!prompt.trim()) return toast("err", "Escreva uma ideia, mesmo simples, para o Claude otimizar");
    setEnhancing(true);
    try {
      const r = await api<EnhanceResult>("/api/enhance", { method: "POST", json: { kind: kind === "avatar" ? "image" : kind, prompt, model: model?.id, aspectRatio: aspect, duration: model?.durations ? duration : undefined, hasReferences: refs.length > 0, ...dest } });
      setEnhance(r);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : "Falha no enhance");
    } finally {
      setEnhancing(false);
    }
  }

  function applyEnhance(r: EnhanceResult, focus = false) {
    setPrompt(r.enhanced_prompt);
    if (r.suggested.model_id && models.some((m) => m.id === r.suggested.model_id)) setModelId(r.suggested.model_id);
    if (r.suggested.aspect_ratio && model?.aspectRatios?.includes(r.suggested.aspect_ratio)) setAspect(r.suggested.aspect_ratio);
    if (r.suggested.duration_seconds && model?.durations) setDuration(Math.min(Math.max(Math.round(r.suggested.duration_seconds), model.durations.min), model.durations.max));
    setEnhance(null);
    if (focus) setTimeout(() => promptRef.current?.focus(), 50);
  }

  async function generate() {
    if (!canGenerate) return;
    setBusy(true);
    requestId.current ??= uid(); // mesmo id em re-tentativas do mesmo clique
    try {
      const r = await api<{ generation: { status: string } }>("/api/generate", { method: "POST", json: { ...request, clientRequestId: requestId.current } });
      toast("ok", r.generation.status === "completed" ? "Pronto!" : "Geração enviada — acompanhe na galeria");
      requestId.current = null;
      onGenerated?.();
      loadWallets();
      window.dispatchEvent(new Event("mega:wallet"));
    } catch (e) {
      requestId.current = null;
      toast("err", e instanceof Error ? e.message : "Falha ao gerar");
      onGenerated?.();
      loadWallets();
    } finally {
      setBusy(false);
    }
  }

  async function dropOnRefs(e: React.DragEvent) {
    e.preventDefault();
    setRefOver(false);
    const ids = readDraggedAssets(e);
    if (ids.length) {
      const r = await api<{ assets: AssetView[] }>(`/api/assets?limit=1000`);
      ids.forEach((id) => { const a = r.assets.find((x) => x.id === id); if (a) isUpscale ? setSource(a) : addRef(a); });
      return;
    }
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    try {
      const up = await uploadFiles(files, dest);
      up.assets.forEach((a) => (isUpscale ? setSource(a) : addRef(a)));
      if (up.rejected.length) toast("err", `Ignorados: ${up.rejected.map((x) => x.name).join(", ")}`);
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "Falha no upload");
    }
  }

  if (!model) return null;
  const refsDroppable = isUpscale || maxRefs > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {kinds && kinds.length > 1 && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-card p-1">
            {kinds.map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${kind === k ? "bg-mega-yellow text-black" : "text-soft hover:text-white"}`}>
                {k === "video" ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}{KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        {!fixedDest && (
          <div>
            <div className="label">Salvar em</div>
            <DestinationPicker value={dest} onChange={setDest} />
          </div>
        )}

        <ModelSelect models={models} value={model.id} onChange={setModelId} />

        {refsDroppable && (
          <div
            onDragOver={(e) => { if (isFileDrag(e) || isAssetDrag(e)) { e.preventDefault(); setRefOver(true); } }}
            onDragLeave={() => setRefOver(false)}
            onDrop={dropOnRefs}
            className={`rounded-xl border border-dashed p-2.5 transition ${refOver ? "border-mega-yellow bg-mega-yellow/5" : "border-line-strong"}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="label !mb-0">{isUpscale ? "Arquivo de origem" : kind === "video" ? "Frames e referências" : "Imagens de referência"}</span>
              <span className="text-[10px] text-muted">{isUpscale ? "1" : `${refs.length}/${maxRefs}`}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {isUpscale ? (
                source ? <Thumb a={source} label={source.kind === "video" ? "Vídeo" : "Imagem"} onRemove={() => setSource(null)} /> : null
              ) : refs.map((r, i) => <Thumb key={r.id} a={r} label={roleLabel(roleOf(r, i))} onRemove={() => setRefs((x) => x.filter((y) => y.id !== r.id))} />)}
              {(isUpscale ? !source : refs.length < maxRefs) && (
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-line bg-card text-[9px] text-muted hover:border-mega-amber hover:text-mega-yellow">
                  <Plus className="h-4 w-4" />Arraste
                  <input type="file" accept="image/*,video/*" multiple={!isUpscale} hidden onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (!files.length) return;
                    try { const up = await uploadFiles(files, dest); up.assets.forEach((a) => (isUpscale ? setSource(a) : addRef(a))); } catch (err) { toast("err", err instanceof Error ? err.message : "Falha no upload"); }
                  }} />
                </label>
              )}
            </div>
            <p className="mt-1.5 text-[10.5px] leading-snug text-muted">Arraste da pasta do computador ou de qualquer imagem do Hub.{kind === "video" && " A 1ª vira o frame inicial."}</p>
          </div>
        )}

        {!isUpscale && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label !mb-0">{kind === "audio" ? "Texto da locução" : "Prompt"}</span>
              <span className="text-[10px] text-muted">{prompt.length} caracteres</span>
            </div>
            {kind === "image" && (
              <div className="mb-2 flex flex-wrap gap-1">
                <span className="w-full text-[10.5px] text-muted">Folha de referência (descreva o assunto e clique):</span>
                {SHEET_PRESETS.map((p) => (
                  <button key={p.id} title={p.hint} className="chip !text-[10.5px]" onClick={() => {
                    // usa o texto atual como assunto; se já era uma folha, mantém só o assunto anterior
                    const prev = sheetSubject.current && prompt.includes(sheetSubject.current) ? sheetSubject.current : prompt;
                    sheetSubject.current = prev.trim();
                    setPrompt(applySheet(p, prev));
                    if (model?.aspectRatios?.includes(p.aspect)) setAspect(p.aspect);
                    promptRef.current?.focus();
                  }}>{p.label}</button>
                ))}
              </div>
            )}
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
              rows={compact ? 5 : 7}
              placeholder={kind === "audio" ? "Digite o texto que será narrado…" : kind === "video" ? "Ex.: mulher caminhando na praia ao pôr do sol — descreva simples, o Enhance cuida da câmera, luz e grading" : "Descreva a imagem. Pode ser simples: o Enhance detalha ângulo, lente, luz e color grading."}
              className="input resize-y leading-relaxed"
            />
            {kind !== "audio" && (
              <button onClick={doEnhance} disabled={enhancing || !prompt.trim()} className="btn-outline mt-2 w-full">
                {enhancing ? <Spinner /> : <Sparkles className="h-4 w-4 text-mega-yellow" />}
                {enhancing ? "Claude otimizando…" : "Enhance com Claude"}
              </button>
            )}
          </div>
        )}

        {kind === "audio" && (
          <div className="space-y-3">
            <div>
              <div className="label">Voz</div>
              {voices === null ? <Spinner /> : voices.length ? (
                <select className="input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                  {voices.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}{v.labels?.accent ? ` · ${v.labels.accent}` : ""}</option>)}
                </select>
              ) : <p className="text-xs text-mega-orange">ElevenLabs não configurado — adicione ELEVENLABS_API_KEY no servidor.</p>}
            </div>
            {(["stability", "similarity", "style"] as const).map((k) => (
              <div key={k}>
                <div className="flex justify-between text-[11px] text-muted"><span>{{ stability: "Estabilidade", similarity: "Similaridade", style: "Exagero de estilo" }[k]}</span><span>{voiceSettings[k].toFixed(2)}</span></div>
                <input type="range" min={0} max={1} step={0.05} value={voiceSettings[k]} onChange={(e) => setVoiceSettings((s) => ({ ...s, [k]: Number(e.target.value) }))} className="w-full accent-[#FDC010]" />
              </div>
            ))}
          </div>
        )}

        {model.aspectRatios && (
          <div>
            <div className="label">Proporção</div>
            <div className="flex flex-wrap gap-1.5">
              {model.aspectRatios.map((ar) => <button key={ar} onClick={() => setAspect(ar)} className={`chip ${aspect === ar ? "chip-active" : "hover:text-white"}`}>{ar}</button>)}
            </div>
          </div>
        )}

        {model.multiShot && (
          <div className="rounded-xl border border-line p-2.5">
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold"><Clapperboard className="h-3.5 w-3.5 text-mega-yellow" />Roteiro multi-shot</span>
              <input type="checkbox" checked={multiShot} onChange={(e) => setMultiShot(e.target.checked)} className="h-4 w-4 accent-[#FDC010]" />
            </label>
            {multiShot && (
              <div className="mt-2.5 space-y-2">
                {shots.map((s, i) => (
                  <div key={i} className="rounded-lg bg-card p-2">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                      <span className="font-mono font-bold text-mega-amber">PLANO {String(i + 1).padStart(2, "0")}</span>
                      <span className="flex items-center gap-1">
                        <input type="number" min={1} max={15} value={s.duration} onChange={(e) => setShots((x) => x.map((y, j) => (j === i ? { ...y, duration: Number(e.target.value) } : y)))} className="input !w-14 !px-1.5 !py-0.5 text-right text-xs" />s
                        {shots.length > 2 && <button onClick={() => setShots((x) => x.filter((_, j) => j !== i))} className="p-0.5 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>}
                      </span>
                    </div>
                    <textarea rows={2} value={s.prompt} onChange={(e) => setShots((x) => x.map((y, j) => (j === i ? { ...y, prompt: e.target.value } : y)))} placeholder="Ex.: plano geral do estádio, câmera sobe em grua" className="input resize-y !py-1.5 text-xs" />
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <button className="btn-ghost !px-2 !py-1 text-xs" disabled={shots.length >= 6} onClick={() => setShots((x) => [...x, { prompt: "", duration: 3 }])}><Plus className="h-3 w-3" />Plano</button>
                  <span className={`text-[11px] ${model.durations && (shotsTotal < model.durations.min || shotsTotal > model.durations.max) ? "text-red-400" : "text-muted"}`}>Total {shotsTotal}s {model.durations ? `(${model.durations.min}–${model.durations.max}s)` : ""}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {model.durations && !useShots && (
          <div>
            <div className="flex justify-between"><span className="label">Duração</span><span className="text-xs font-bold text-mega-yellow">{duration}s</span></div>
            <input type="range" min={model.durations.min} max={model.durations.max} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-[#FDC010]" />
          </div>
        )}

        {(model.maxCount ?? 1) > 1 && (
          <div>
            <div className="label">{kind === "video" ? "Variações (cada uma é cobrada)" : "Quantidade"}</div>
            <div className="flex gap-1.5">{Array.from({ length: model.maxCount ?? 1 }, (_, i) => i + 1).map((n) => <button key={n} onClick={() => setCount(n)} className={`chip flex-1 justify-center py-1 ${count === n ? "chip-active" : ""}`}>{n}</button>)}</div>
          </div>
        )}

        {model.options?.map((o) => (
          <div key={o.name}>
            <div className="label">{o.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {o.values.map((v) => <button key={v} onClick={() => setOptions((x) => ({ ...x, [o.name]: v }))} className={`chip ${options[o.name] === v ? "chip-active" : ""}`}>{o.labels?.[v] ?? v}</button>)}
            </div>
            {o.hint && <p className="mt-1 text-[10.5px] text-muted">{o.hint}</p>}
          </div>
        ))}

        {model.flags?.map((f) => (
          <label key={f.name} className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-line px-3 py-2">
            <span><span className="text-xs font-semibold">{f.label}</span>{f.hint && <span className="mt-0.5 block text-[10.5px] text-muted">{f.hint}</span>}</span>
            <input type="checkbox" checked={!!flags[f.name]} onChange={(e) => setFlags((x) => ({ ...x, [f.name]: e.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[#FDC010]" />
          </label>
        ))}
      </div>

      {/* rodapé: carteira + custo + gerar */}
      <div className="space-y-2 border-t border-line bg-panel p-3">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
          <select className="input !py-1 text-xs" value={walletChoice} onChange={(e) => setWalletChoice(e.target.value as WalletOpt["type"])}>
            {wallets.map((w) => <option key={w.type} value={w.type}>{w.label} — {fmtCredits(w.balance)} créditos</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Custo {est?.source === "higgsfield" ? "(Higgsfield)" : est?.source === "tabela" ? "(estimado)" : ""}</span>
          <span className={`font-bold tabular-nums ${insufficient ? "text-red-400" : "text-white"}`}>
            {estLoading ? <Spinner className="h-3 w-3" /> : est ? `${fmtCredits(est.credits)} créditos · ${fmtUsd(est.usd)}` : "—"}
          </span>
        </div>
        {insufficient && <p className="text-[11px] text-red-400">Saldo insuficiente nesta carteira. Escolha outra ou peça créditos ao gestor.</p>}
        {est?.walletError && <p className="text-[11px] text-red-400">{est.walletError}</p>}
        <button onClick={generate} disabled={!canGenerate} className="btn-primary w-full py-2.5 text-[15px]">
          {busy ? <Spinner /> : isUpscale ? <Wand2 className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          {busy ? "Enviando…" : isUpscale ? "Fazer upscale" : `Gerar ${KIND_LABEL[kind].toLowerCase()}`}
        </button>
        <div className="text-center text-[10px] text-muted">Ctrl + Enter para gerar</div>
      </div>

      <EnhanceDialog open={!!enhance} original={prompt} result={enhance} onClose={() => setEnhance(null)} onUse={(r) => applyEnhance(r)} onEdit={(r) => applyEnhance(r, true)} />
    </div>
  );
}

function Thumb({ a, label, onRemove }: { a: AssetView; label: string; onRemove: () => void }) {
  return (
    <div className="group relative h-16 w-16 overflow-hidden rounded-lg border border-line bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {a.kind === "video" && !a.thumb_url ? <div className="flex h-full items-center justify-center text-mega-amber"><Film className="h-5 w-5" /></div> : <img src={a.thumb_url || a.url} alt="" className="h-full w-full object-cover" />}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 text-center text-[8.5px] font-semibold text-mega-yellow">{label}</span>
      <button onClick={onRemove} className="absolute right-0.5 top-0.5 rounded bg-black/80 p-0.5 opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
    </div>
  );
}

function ModelSelect({ models, value, onChange }: { models: ModelDef[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const m = models.find((x) => x.id === value) ?? models[0];
  const unit = (x: ModelDef) => (x.provider === "elevenlabs" ? "por caractere" : `${fmtCredits(x.credits)} cr${x.perSecond ? "/s" : ""}`);
  return (
    <div className="relative">
      <div className="label">Modelo</div>
      <button onClick={() => setOpen((o) => !o)} className="input flex items-center justify-between text-left">
        <span><span className="font-semibold">{m.name}</span>{m.tag && <span className="ml-2 rounded bg-mega-yellow/15 px-1.5 py-0.5 text-[10px] font-bold text-mega-yellow">{m.tag}</span>}</span>
        <span className="text-[11px] text-muted">{unit(m)}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-line-strong bg-raised p-1 shadow-2xl">
            {models.map((x) => (
              <button key={x.id} onClick={() => { onChange(x.id); setOpen(false); }} className={`w-full rounded-lg px-3 py-2 text-left hover:bg-card ${x.id === value ? "bg-card" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{x.name}{x.tag && <span className="ml-2 rounded bg-mega-yellow/15 px-1.5 py-0.5 text-[10px] font-bold text-mega-yellow">{x.tag}</span>}</span>
                  <span className="shrink-0 text-[11px] text-muted">{unit(x)}</span>
                </div>
                <div className="text-xs text-muted">{x.description}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
