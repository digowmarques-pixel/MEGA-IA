"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export type Destination = { projectId: number | null; scenarioId: number | null; sceneId: number | null };
type Tree = { id: number; idx: number; name: string; scenes: { id: number; idx: number; name: string }[] }[];

/** Escolha de projeto → cenário → cena para onde a geração vai (define pasta e nomenclatura). */
export function DestinationPicker({ value, onChange }: { value: Destination; onChange: (d: Destination) => void }) {
  const [projects, setProjects] = useState<{ id: number; name: string; code: string; status: string }[]>([]);
  const [tree, setTree] = useState<Tree>([]);

  useEffect(() => {
    api<{ projects: { id: number; name: string; code: string; status: string }[] }>("/api/projects").then((r) => setProjects(r.projects.filter((p) => p.status !== "arquivado"))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!value.projectId) { setTree([]); return; }
    api<{ tree: Tree }>(`/api/projects/${value.projectId}`).then((r) => setTree(r.tree)).catch(() => setTree([]));
  }, [value.projectId]);

  const scenario = tree.find((s) => s.id === value.scenarioId);
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <select className="input !px-2 !py-1.5 text-xs" value={value.projectId ?? ""} onChange={(e) => onChange({ projectId: Number(e.target.value) || null, scenarioId: null, sceneId: null })}>
        <option value="">Sem projeto</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select className="input !px-2 !py-1.5 text-xs" disabled={!value.projectId} value={value.scenarioId ?? ""} onChange={(e) => onChange({ ...value, scenarioId: Number(e.target.value) || null, sceneId: null })}>
        <option value="">Geral</option>
        {tree.map((s) => <option key={s.id} value={s.id}>CEN{String(s.idx).padStart(2, "0")} · {s.name}</option>)}
      </select>
      <select className="input !px-2 !py-1.5 text-xs" disabled={!scenario} value={value.sceneId ?? ""} onChange={(e) => onChange({ ...value, sceneId: Number(e.target.value) || null })}>
        <option value="">Sem cena</option>
        {scenario?.scenes.map((c) => <option key={c.id} value={c.id}>CENA{String(c.idx).padStart(2, "0")} · {c.name}</option>)}
      </select>
    </div>
  );
}
