"use client";

import { ArrowLeft, CheckSquare, ChevronDown, ChevronRight, Download, FolderOpen, GripVertical, Layers, MoreHorizontal, Pencil, Plus, Settings2, Sparkles, Trash2, Wand2, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { AssetCard, AssetViewer, type AssetActions } from "@/components/AssetCard";
import { Assistant } from "@/components/Assistant";
import { DropZone } from "@/components/DropZone";
import { Generator } from "@/components/Generator";
import { ResizablePanels } from "@/components/Resizable";
import { Empty, Modal, Spinner, useConfirm, useToast } from "@/components/ui";
import type { AssetView } from "@/lib/assets";
import { api, downloadZip, fmtCredits, fmtUsd, isAssetDrag, isFileDrag, readDraggedAssets, uploadFiles } from "@/lib/client";
import type { ProjectRow } from "@/lib/projects";

type Scene = { id: number; idx: number; name: string; description: string | null; scenario_id: number };
type Scenario = { id: number; idx: number; name: string; description: string | null; scenes: Scene[] };
type Data = { project: ProjectRow; tree: Scenario[]; assets: AssetView[]; totals: { credits: number; usd: number }; budget: number | null };
type Node = { type: "all" } | { type: "general" } | { type: "scenario"; id: number } | { type: "scene"; id: number; scenarioId: number };

const SCENARIO_MIME = "application/x-mega-scenario";
const SCENE_MIME = "application/x-mega-scene";
const pad = (n: number) => String(n).padStart(2, "0");

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const { confirm, node: confirmNode } = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [node, setNode] = useState<Node>({ type: "all" });
  const [filter, setFilter] = useState<"all" | "image" | "video" | "audio" | "upload" | "approved">("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const [tab, setTab] = useState<"gen" | "claude">("gen");
  const [injectRef, setInjectRef] = useState<{ asset: AssetView; nonce: number; asStart?: boolean } | null>(null);
  const [injectPrompt, setInjectPrompt] = useState<{ text: string; nonce: number } | null>(null);
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [editing, setEditing] = useState<{ kind: "scenario" | "scene" | "project"; id: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>(`/api/projects/${projectId}`));
    } catch (e) {
      toast("err", e instanceof Error ? e.message : "Projeto não encontrado");
      router.push("/projects");
    }
  }, [projectId, router, toast]);
  useEffect(() => { load(); }, [load]);

  // enquanto houver geração em andamento no projeto, recarrega periodicamente
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const r = await api<{ generations: { status: string }[] }>(`/api/generations?projectId=${projectId}&limit=20&scope=all`).catch(() => null);
      const still = r?.generations.filter((g) => g.status === "processing").length ?? 0;
      load();
      if (!still) setPending(0);
    }, 5000);
    return () => clearInterval(t);
  }, [pending, projectId, load]);

  const tree = data?.tree ?? [];
  const sceneById = useMemo(() => new Map(tree.flatMap((s) => s.scenes.map((c) => [c.id, c] as const))), [tree]);
  const scenarioById = useMemo(() => new Map(tree.map((s) => [s.id, s] as const)), [tree]);

  const destination = useMemo(() => {
    if (node.type === "scene") return { projectId, scenarioId: node.scenarioId, sceneId: node.id };
    if (node.type === "scenario") return { projectId, scenarioId: node.id, sceneId: null };
    return { projectId, scenarioId: null, sceneId: null };
  }, [node, projectId]);

  const visible = useMemo(() => {
    let list = data?.assets ?? [];
    if (node.type === "general") list = list.filter((a) => !a.scenario_id);
    if (node.type === "scenario") list = list.filter((a) => a.scenario_id === node.id);
    if (node.type === "scene") list = list.filter((a) => a.scene_id === node.id);
    if (filter === "upload") list = list.filter((a) => a.source === "upload");
    else if (filter === "approved") list = list.filter((a) => a.approved);
    else if (filter !== "all") list = list.filter((a) => a.kind === filter);
    return list;
  }, [data, node, filter]);

  // agrupa por cenário/cena para leitura de "família de cenas"
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; title: string; order: number; items: AssetView[] }>();
    for (const a of visible) {
      const sc = a.scenario_id ? scenarioById.get(a.scenario_id) : null;
      const se = a.scene_id ? sceneById.get(a.scene_id) : null;
      const key = `${a.scenario_id ?? 0}-${a.scene_id ?? 0}`;
      const title = sc ? `CEN${pad(sc.idx)} · ${sc.name}${se ? `  /  CENA${pad(se.idx)} · ${se.name}` : "  /  nível do cenário"}` : "Geral do projeto";
      const order = (sc?.idx ?? 0) * 1000 + (se?.idx ?? 0);
      if (!map.has(key)) map.set(key, { key, title, order, items: [] });
      map.get(key)!.items.push(a);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [visible, scenarioById, sceneById]);
  const flat = groups.flatMap((g) => g.items);

  async function moveAssets(ids: number[], target: { scenarioId: number | null; sceneId: number | null }) {
    try {
      for (const id of ids) await api(`/api/assets/${id}`, { method: "PATCH", json: { projectId, ...target } });
      toast("ok", `${ids.length} arquivo(s) movidos — nomes atualizados`);
      setSelected([]);
      load();
    } catch (e) {
      toast("err", e instanceof Error ? e.message : "Falha ao mover");
    }
  }

  async function patchAsset(a: AssetView, body: Record<string, unknown>) {
    await api(`/api/assets/${a.id}`, { method: "PATCH", json: body });
    load();
  }

  const actions: AssetActions = {
    onOpen: (a) => setViewer(flat.findIndex((x) => x.id === a.id)),
    onToggleSelect: (a, shift) => setSelected((s) => {
      if (shift && s.length) {
        const last = flat.findIndex((x) => x.id === s[s.length - 1]);
        const cur = flat.findIndex((x) => x.id === a.id);
        const range = flat.slice(Math.min(last, cur), Math.max(last, cur) + 1).map((x) => x.id);
        return [...new Set([...s, ...range])];
      }
      return s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id];
    }),
    onFavorite: (a) => patchAsset(a, { favorite: !a.favorite }),
    onApprove: (a) => patchAsset(a, { approved: !a.approved }),
    onUseAsReference: (a) => { setTab("gen"); setInjectRef({ asset: a, nonce: Date.now() }); },
    onMakeVideo: (a) => {
      // gera o vídeo na mesma cena da imagem
      if (a.scene_id && a.scenario_id) setNode({ type: "scene", id: a.scene_id, scenarioId: a.scenario_id });
      setTab("gen");
      setInjectRef({ asset: a, nonce: Date.now(), asStart: true });
      setViewer(null);
    },
    onUpscale: (a) => router.push(`/enhance?source=${a.id}`),
    onDelete: async (a) => {
      if (!(await confirm(`Excluir ${a.filename}?`))) return;
      await api(`/api/assets/${a.id}`, { method: "DELETE" });
      setViewer(null);
      load();
    },
  };

  async function addScenario() {
    const r = await api<{ id: number }>("/api/scenarios", { method: "POST", json: { projectId } });
    await load();
    setNode({ type: "scenario", id: r.id });
    setEditing({ kind: "scenario", id: r.id });
  }
  async function addScene(scenarioId: number) {
    const r = await api<{ id: number }>("/api/scenes", { method: "POST", json: { scenarioId } });
    setCollapsed((c) => c.filter((x) => x !== scenarioId));
    await load();
    setNode({ type: "scene", id: r.id, scenarioId });
  }
  async function reorder(kind: "scenarios" | "scenes", id: number, idx: number) {
    await api(`/api/${kind}/${id}`, { method: "PATCH", json: { idx } });
    load();
  }

  async function bulkDelete() {
    if (!(await confirm(`Excluir ${selected.length} arquivo(s)? Não pode ser desfeito.`))) return;
    let fail = 0;
    for (const id of selected) await api(`/api/assets/${id}`, { method: "DELETE" }).catch(() => fail++);
    if (fail) toast("err", `${fail} arquivo(s) não puderam ser excluídos (só o autor ou o gestor podem)`);
    setSelected([]);
    load();
  }

  async function download(body: Record<string, unknown>) {
    try {
      const errors = await downloadZip(body);
      if (errors) toast("err", `${errors} arquivo(s) falharam — veja _erros.txt no ZIP`);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : "Falha no download");
    }
  }

  if (!data) return <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  const p = data.project;
  const nodeTitle = node.type === "all" ? "Todos os arquivos" : node.type === "general" ? "Geral do projeto" : node.type === "scenario" ? `CEN${pad(scenarioById.get(node.id)?.idx ?? 0)} · ${scenarioById.get(node.id)?.name}` : `CENA${pad(sceneById.get(node.id)?.idx ?? 0)} · ${sceneById.get(node.id)?.name}`;
  const nodeDescription = node.type === "scenario" ? scenarioById.get(node.id)?.description : node.type === "scene" ? sceneById.get(node.id)?.description : null;

  return (
    <div className="flex h-full flex-col">
      {/* cabeçalho */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <Link href="/projects" className="btn-ghost p-1.5"><ArrowLeft className="h-4 w-4" /></Link>
        <span className="rounded bg-raised px-2 py-0.5 font-mono text-xs font-bold text-mega-yellow">{p.code}</span>
        <h1 className="truncate font-display text-lg font-extrabold">{p.name}</h1>
        {p.client && <span className="hidden text-sm text-muted md:inline">· {p.client}</span>}
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-muted">Gasto <b className="text-white">{fmtCredits(data.totals.credits)} cr</b> · {fmtUsd(data.totals.usd)}</span>
          {data.budget !== null && <span className={`rounded-md px-2 py-1 font-bold ${data.budget <= 0 ? "bg-red-500/10 text-red-400" : "bg-mega-yellow/10 text-mega-yellow"}`}>Verba: {fmtCredits(data.budget)} cr</span>}
          <button className="btn-outline !py-1.5 text-xs" onClick={() => download({ projectId })}><Download className="h-3.5 w-3.5" />Baixar projeto</button>
          <button className="btn-ghost p-1.5" title="Configurações do projeto" onClick={() => setEditing({ kind: "project", id: projectId })}><Settings2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ResizablePanels id="project" defaults={[19, 53, 28]} mins={[13, 30, 20]}>
          {/* ÁRVORE */}
          <div className="flex h-full flex-col border-r border-line bg-base">
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="label !mb-0">Cenários e cenas</span>
              <button className="btn-ghost p-1" title="Novo cenário" onClick={addScenario}><Plus className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
              <TreeItem active={node.type === "all"} icon={<Layers className="h-4 w-4" />} label="Todos" count={data.assets.length} onClick={() => setNode({ type: "all" })} />
              <TreeItem active={node.type === "general"} icon={<FolderOpen className="h-4 w-4" />} label="Geral do projeto" count={data.assets.filter((a) => !a.scenario_id).length}
                onClick={() => setNode({ type: "general" })} drop={{ projectId, scenarioId: null, sceneId: null }} onAssets={(ids) => moveAssets(ids, { scenarioId: null, sceneId: null })} onUploaded={load} />
              {tree.map((sc) => {
                const open = !collapsed.includes(sc.id);
                return (
                  <div key={sc.id}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData(SCENARIO_MIME, String(sc.id)); }}
                    onDragOver={(e) => { if (e.dataTransfer.types.includes(SCENARIO_MIME)) e.preventDefault(); }}
                    onDrop={(e) => { const from = Number(e.dataTransfer.getData(SCENARIO_MIME)); if (from && from !== sc.id) { e.preventDefault(); e.stopPropagation(); reorder("scenarios", from, sc.idx); } }}
                  >
                    <TreeItem
                      active={node.type === "scenario" && node.id === sc.id}
                      icon={<button onClick={(e) => { e.stopPropagation(); setCollapsed((c) => (open ? [...c, sc.id] : c.filter((x) => x !== sc.id))); }}>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>}
                      label={<><span className="font-mono text-[10.5px] text-mega-amber">CEN{pad(sc.idx)}</span> {sc.name}</>}
                      count={data.assets.filter((a) => a.scenario_id === sc.id).length}
                      grip
                      onClick={() => setNode({ type: "scenario", id: sc.id })}
                      drop={{ projectId, scenarioId: sc.id, sceneId: null }}
                      onAssets={(ids) => moveAssets(ids, { scenarioId: sc.id, sceneId: null })}
                      onUploaded={load}
                      menu={[
                        { label: "Editar / briefing", icon: Pencil, run: () => setEditing({ kind: "scenario", id: sc.id }) },
                        { label: "Nova cena", icon: Plus, run: () => addScene(sc.id) },
                        { label: "Baixar cenário", icon: Download, run: () => download({ projectId, scenarioId: sc.id }) },
                        { label: "Excluir cenário", icon: Trash2, danger: true, run: async () => { if (await confirm(`Excluir o cenário "${sc.name}"? Os arquivos voltam para "Geral do projeto".`)) { await api(`/api/scenarios/${sc.id}`, { method: "DELETE" }); setNode({ type: "all" }); load(); } } },
                      ]}
                    />
                    {open && (
                      <div className="ml-4 border-l border-line pl-1.5">
                        {sc.scenes.map((c) => (
                          <div key={c.id} draggable
                            onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData(SCENE_MIME, JSON.stringify({ id: c.id, scenario: sc.id })); }}
                            onDragOver={(e) => { if (e.dataTransfer.types.includes(SCENE_MIME)) e.preventDefault(); }}
                            onDrop={(e) => {
                              const raw = e.dataTransfer.getData(SCENE_MIME);
                              if (!raw) return;
                              const from = JSON.parse(raw) as { id: number; scenario: number };
                              e.preventDefault(); e.stopPropagation();
                              if (from.scenario !== sc.id) return toast("info", "Cenas só podem ser reordenadas dentro do mesmo cenário");
                              if (from.id !== c.id) reorder("scenes", from.id, c.idx);
                            }}>
                            <TreeItem
                              active={node.type === "scene" && node.id === c.id}
                              label={<><span className="font-mono text-[10.5px] text-muted">CENA{pad(c.idx)}</span> {c.name}</>}
                              count={data.assets.filter((a) => a.scene_id === c.id).length}
                              grip small
                              onClick={() => setNode({ type: "scene", id: c.id, scenarioId: sc.id })}
                              drop={{ projectId, scenarioId: sc.id, sceneId: c.id }}
                              onAssets={(ids) => moveAssets(ids, { scenarioId: sc.id, sceneId: c.id })}
                              onUploaded={load}
                              menu={[
                                { label: "Editar / briefing", icon: Pencil, run: () => setEditing({ kind: "scene", id: c.id }) },
                                { label: "Baixar cena", icon: Download, run: () => download({ projectId, sceneId: c.id }) },
                                { label: "Excluir cena", icon: Trash2, danger: true, run: async () => { if (await confirm(`Excluir a cena "${c.name}"? Os arquivos ficam no cenário.`)) { await api(`/api/scenes/${c.id}`, { method: "DELETE" }); setNode({ type: "scenario", id: sc.id }); load(); } } },
                              ]}
                            />
                          </div>
                        ))}
                        <button onClick={() => addScene(sc.id)} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted hover:text-mega-yellow"><Plus className="h-3 w-3" />Nova cena</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button onClick={addScenario} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 text-xs text-muted hover:border-mega-amber hover:text-mega-yellow"><Plus className="h-3.5 w-3.5" />Novo cenário</button>
              <p className="px-1 pt-3 text-[10.5px] leading-snug text-muted">Dica: arraste arquivos da pasta direto em um cenário/cena. Arraste imagens do quadro para mover entre cenas. Arraste cenários/cenas para reordenar.</p>
            </div>
          </div>

          {/* QUADRO */}
          <DropZone target={destination} onUploaded={() => load()} onAssetsDropped={node.type === "all" ? undefined : (ids) => moveAssets(ids, { scenarioId: destination.scenarioId, sceneId: destination.sceneId })}
            label={`Soltar em ${nodeTitle}`} className="flex h-full flex-col">
            <div className="border-b border-line px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{nodeTitle}</span>
                <span className="text-xs text-muted">{visible.length} arquivos</span>
                <div className="ml-auto flex flex-wrap gap-1">
                  {([["all", "Tudo"], ["image", "Imagens"], ["video", "Vídeos"], ["audio", "Áudio"], ["upload", "Referências"], ["approved", "Aprovados"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setFilter(k)} className={`chip ${filter === k ? "chip-active" : "hover:text-white"}`}>{l}</button>
                  ))}
                </div>
              </div>
              {nodeDescription && <p className="mt-1.5 line-clamp-2 text-xs text-muted">{nodeDescription}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setSelected(selected.length === visible.length ? [] : visible.map((a) => a.id))}><CheckSquare className="h-3.5 w-3.5" />{selected.length === visible.length && visible.length ? "Desmarcar" : "Selecionar tudo"}</button>
                <label className="btn-ghost cursor-pointer !px-2 !py-1 text-xs"><Plus className="h-3.5 w-3.5" />Adicionar arquivos
                  <input type="file" multiple accept="image/*,video/*,audio/*" hidden onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []); e.target.value = "";
                    if (!files.length) return;
                    try { const r = await uploadFiles(files, destination); toast("ok", `${r.assets.length} arquivo(s) adicionados`); load(); } catch (err) { toast("err", err instanceof Error ? err.message : "Falha"); }
                  }} />
                </label>
                {node.type !== "all" && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => download(node.type === "scene" ? { projectId, sceneId: node.id } : node.type === "scenario" ? { projectId, scenarioId: node.id } : { assetIds: visible.map((a) => a.id) })}><Download className="h-3.5 w-3.5" />Baixar esta pasta</button>}
                {selected.length > 0 && (
                  <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-mega-yellow/10 px-2 py-1">
                    <span className="text-xs font-bold text-mega-yellow">{selected.length} selecionados</span>
                    <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => download({ assetIds: selected })}><Download className="h-3.5 w-3.5" />Baixar lote</button>
                    <button className="btn-danger !px-2 !py-1 text-xs" onClick={bulkDelete}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {visible.length === 0 ? (
                <Empty icon={<FolderOpen className="h-8 w-8" />} title="Nada aqui ainda">
                  Arraste imagens de referência da sua pasta para cá (vários arquivos de uma vez) ou gere pelo painel à direita.
                </Empty>
              ) : (
                <div className="space-y-6">
                  {groups.map((g) => (
                    <section key={g.key}>
                      {(node.type === "all" || node.type === "scenario") && <div className="mb-2 font-mono text-[11px] font-semibold text-soft">{g.title}</div>}
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                        {g.items.map((a) => <AssetCard key={a.id} a={a} selected={selected.includes(a.id)} selectedIds={selected} actions={actions} />)}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </DropZone>

          {/* LATERAL: gerar / claude */}
          <div className="flex h-full flex-col border-l border-line bg-panel">
            <div className="grid grid-cols-2 gap-1 border-b border-line p-2">
              <button onClick={() => setTab("gen")} className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold ${tab === "gen" ? "bg-raised text-white" : "text-muted hover:text-white"}`}><Zap className="h-3.5 w-3.5 text-mega-yellow" />Gerar</button>
              <button onClick={() => setTab("claude")} className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold ${tab === "claude" ? "bg-raised text-white" : "text-muted hover:text-white"}`}><Sparkles className="h-3.5 w-3.5 text-mega-yellow" />Claude</button>
            </div>
            <div className="px-3 pt-2 text-[11px] text-muted">Destino: <span className="text-soft">{node.type === "scene" || node.type === "scenario" ? nodeTitle : "Geral do projeto"}</span></div>
            <div className="min-h-0 flex-1">
              <div className={tab === "gen" ? "h-full" : "hidden"}>
                <Generator kind="image" kinds={["image", "video"]} destination={destination} compact injectRef={injectRef} injectPrompt={injectPrompt}
                  onGenerated={() => { load(); setPending(Date.now()); }} />
              </div>
              <div className={tab === "claude" ? "h-full" : "hidden"}>
                <Assistant storageKey={`project-${projectId}`} context={destination} onUsePrompt={(t) => { setInjectPrompt({ text: t, nonce: Date.now() }); setTab("gen"); }} />
              </div>
            </div>
          </div>
        </ResizablePanels>
      </div>

      <AssetViewer assets={flat} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} actions={actions} />
      <EditDialog editing={editing} data={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} onDeleted={() => router.push("/projects")} />
      {confirmNode}
    </div>
  );
}

function TreeItem({ active, icon, label, count, onClick, drop, onAssets, onUploaded, menu, grip, small }: {
  active: boolean; icon?: React.ReactNode; label: React.ReactNode; count?: number; onClick: () => void;
  drop?: { projectId: number; scenarioId: number | null; sceneId: number | null };
  onAssets?: (ids: number[]) => void; onUploaded?: () => void;
  menu?: { label: string; icon: React.ElementType; run: () => void; danger?: boolean }[];
  grip?: boolean; small?: boolean;
}) {
  const toast = useToast();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={onClick}
      onDragOver={(e) => { if (drop && (isFileDrag(e) || isAssetDrag(e))) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        if (!drop || !(isFileDrag(e) || isAssetDrag(e))) return;
        e.preventDefault(); e.stopPropagation(); setOver(false);
        const ids = readDraggedAssets(e);
        if (ids.length) return onAssets?.(ids);
        const files = Array.from(e.dataTransfer.files);
        if (!files.length) return;
        setBusy(true);
        try { const r = await uploadFiles(files, drop); toast("ok", `${r.assets.length} arquivo(s) adicionados`); if (r.rejected.length) toast("err", `Ignorados: ${r.rejected.map((x) => x.name).join(", ")}`); onUploaded?.(); }
        catch (err) { toast("err", err instanceof Error ? err.message : "Falha no upload"); }
        finally { setBusy(false); }
      }}
      className={`group relative flex cursor-pointer items-center gap-1.5 rounded-md px-2 ${small ? "py-1 text-[12.5px]" : "py-1.5 text-[13px]"} transition ${over ? "bg-mega-yellow/15 ring-1 ring-mega-amber" : active ? "bg-raised text-white" : "text-soft hover:bg-card"}`}
    >
      {grip && <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-line-strong opacity-0 group-hover:opacity-100" />}
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {busy ? <Spinner className="h-3 w-3" /> : count !== undefined && <span className="text-[10px] tabular-nums text-muted">{count}</span>}
      {menu && (
        <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} className="rounded p-0.5 opacity-0 hover:bg-line group-hover:opacity-100"><MoreHorizontal className="h-3.5 w-3.5" /></button>
      )}
      {open && menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-lg border border-line-strong bg-raised p-1 shadow-2xl">
            {menu.map((m) => (
              <button key={m.label} onClick={(e) => { e.stopPropagation(); setOpen(false); m.run(); }} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-card ${m.danger ? "text-red-400" : "text-soft"}`}>
                <m.icon className="h-3.5 w-3.5" />{m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EditDialog({ editing, data, onClose, onSaved, onDeleted }: { editing: { kind: "scenario" | "scene" | "project"; id: number } | null; data: Data; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const { confirm, node } = useConfirm();
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!editing) return;
    if (editing.kind === "project") {
      const p = data.project;
      setF({ name: p.name, code: p.code, client: p.client ?? "", description: p.description ?? "", look: p.look ?? "", aspect_ratio: p.aspect_ratio ?? "16:9", status: p.status });
    } else if (editing.kind === "scenario") {
      const s = data.tree.find((x) => x.id === editing.id);
      setF({ name: s?.name ?? "", description: s?.description ?? "" });
    } else {
      const c = data.tree.flatMap((x) => x.scenes).find((x) => x.id === editing.id);
      setF({ name: c?.name ?? "", description: c?.description ?? "" });
    }
  }, [editing, data]);
  if (!editing) return null;

  const url = editing.kind === "project" ? `/api/projects/${editing.id}` : editing.kind === "scenario" ? `/api/scenarios/${editing.id}` : `/api/scenes/${editing.id}`;
  const save = async () => {
    try { await api(url, { method: "PATCH", json: f }); onSaved(); } catch (e) { toast("err", e instanceof Error ? e.message : "Erro ao salvar"); }
  };
  const title = editing.kind === "project" ? "Configurações do projeto" : editing.kind === "scenario" ? "Cenário (locação)" : "Cena";
  return (
    <Modal open onClose={onClose} title={title} footer={<>
      {editing.kind === "project" && <button className="btn-danger mr-auto" onClick={async () => { if (await confirm("Excluir o projeto e TODOS os arquivos dele? O histórico de custos é mantido.")) { await api(url, { method: "DELETE" }).then(onDeleted).catch((e) => toast("err", e.message)); } }}><Trash2 className="h-4 w-4" />Excluir projeto</button>}
      <button className="btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn-primary" onClick={save}>Salvar</button>
    </>}>
      <div className="space-y-3">
        <div><label className="label">Nome</label><input className="input" value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        {editing.kind === "project" && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Código (nomenclatura)</label><input className="input font-mono uppercase" value={f.code ?? ""} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
            <div><label className="label">Status</label><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="ativo">Ativo</option><option value="arquivado">Arquivado</option></select></div>
            <div><label className="label">Cliente</label><input className="input" value={f.client ?? ""} onChange={(e) => setF({ ...f, client: e.target.value })} /></div>
            <div><label className="label">Proporção</label><select className="input" value={f.aspect_ratio} onChange={(e) => setF({ ...f, aspect_ratio: e.target.value })}>{["16:9", "21:9", "9:16", "1:1", "4:5", "4:3"].map((a) => <option key={a}>{a}</option>)}</select></div>
          </div>
        )}
        <div>
          <label className="label">{editing.kind === "scenario" ? "Briefing do cenário — locação, luz, paleta, época" : editing.kind === "scene" ? "O que acontece na cena — ação, personagens, câmera" : "Sinopse"}</label>
          <textarea className="input" rows={5} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })}
            placeholder={editing.kind === "scenario" ? "Ex.: Vestiário antigo, azulejo verde, luz fluorescente fria com contraluz quente da porta, grading teal & orange suave" : undefined} />
          <p className="mt-1 text-[11px] text-muted"><Wand2 className="mr-1 inline h-3 w-3" />O Claude usa este texto no Enhance e no chat para manter a continuidade entre as cenas.</p>
        </div>
        {editing.kind === "project" && <div><label className="label">Look global</label><textarea className="input" rows={3} value={f.look ?? ""} onChange={(e) => setF({ ...f, look: e.target.value })} /></div>}
      </div>
      {node}
    </Modal>
  );
}
