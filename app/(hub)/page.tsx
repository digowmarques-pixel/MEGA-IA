"use client";

import { ArrowRight, Film, FolderKanban, ImageIcon, Mic, UserRound, Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AssetMedia } from "@/components/AssetCard";
import { PageHeader } from "@/components/PageHeader";
import { Spinner, Stat } from "@/components/ui";
import type { AssetView } from "@/lib/assets";
import { api, fmtCredits, fmtUsd } from "@/lib/client";

type Stats = {
  wallets: { user: number; personal: number };
  monthlyAllowance: number;
  usdPerCredit: number;
  spent: { credits: number; usd: number; n: number };
  byKind: { kind: string; n: number; credits: number }[];
  daily: { day: string; credits: number }[];
  projects: { id: number; name: string; code: string }[];
  recent: AssetView[];
};

const SHORTCUTS = [
  { href: "/image", label: "Gerar imagem", icon: ImageIcon },
  { href: "/video", label: "Gerar vídeo", icon: Film },
  { href: "/audio", label: "Locução", icon: Mic },
  { href: "/enhance", label: "Upscale", icon: Wand2 },
  { href: "/avatar", label: "Avatar", icon: UserRound },
  { href: "/projects", label: "Projetos", icon: FolderKanban },
];
const KIND: Record<string, string> = { image: "Imagens", video: "Vídeos", audio: "Áudios", upscale_image: "Upscale img", upscale_video: "Upscale vídeo", avatar: "Avatares" };

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>("/api/me/stats").then(setS).catch(() => {}); }, []);

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Dashboard" subtitle="Seu consumo do mês e atalhos de criação" />
      {!s ? <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div> : (
        <div className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Cota da empresa" value={fmtCredits(s.wallets.user)} sub={s.monthlyAllowance ? `+${fmtCredits(s.monthlyAllowance)} todo mês` : "liberada pelo gestor"} accent />
            <Stat label="Créditos pessoais" value={fmtCredits(s.wallets.personal)} sub={<Link href="/wallet" className="hover:text-mega-yellow">Recarregar →</Link>} />
            <Stat label="Gasto no mês" value={`${fmtCredits(s.spent.credits)} cr`} sub={`${fmtUsd(s.spent.usd)} · ${s.spent.n} gerações`} />
            <Stat label="Valor do crédito" value={fmtUsd(s.usdPerCredit)} sub="custo médio por crédito" />
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {SHORTCUTS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="card group flex flex-col items-center gap-2 p-4 transition hover:border-mega-amber/60">
                <Icon className="h-6 w-6 text-soft group-hover:text-mega-yellow" />
                <span className="text-xs font-semibold">{label}</span>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-4 lg:col-span-2">
              <div className="mb-3 text-sm font-bold">Créditos por dia (mês atual)</div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.daily}>
                    <XAxis dataKey="day" stroke="#6b6b6b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#6b6b6b" fontSize={11} tickLine={false} axisLine={false} width={36} />
                    <Tooltip cursor={{ fill: "#ffffff08" }} contentStyle={{ background: "#151515", border: "1px solid #2a2a2a", borderRadius: 8 }} formatter={(v) => [`${fmtCredits(Number(v))} créditos`, ""]} labelFormatter={(d) => `Dia ${d}`} />
                    <Bar dataKey="credits" fill="#FDC010" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card p-4">
              <div className="mb-3 text-sm font-bold">Por tipo</div>
              {s.byKind.length === 0 ? <p className="text-sm text-muted">Nenhuma geração neste mês.</p> : (
                <ul className="space-y-2">
                  {s.byKind.map((k) => (
                    <li key={k.kind} className="flex items-center justify-between text-sm"><span className="text-soft">{KIND[k.kind] ?? k.kind} <span className="text-muted">({k.n})</span></span><span className="font-semibold tabular-nums">{fmtCredits(k.credits)} cr</span></li>
                  ))}
                </ul>
              )}
              {s.projects.length > 0 && (
                <>
                  <div className="mb-2 mt-5 text-sm font-bold">Projetos recentes</div>
                  {s.projects.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-card">{p.name}<ArrowRight className="h-3.5 w-3.5 text-muted" /></Link>)}
                </>
              )}
            </div>
          </div>

          {s.recent.length > 0 && (
            <div>
              <div className="mb-3 text-sm font-bold">Últimas criações</div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                {s.recent.map((a) => <AssetMedia key={a.id} a={a} className="aspect-video w-full rounded-lg border border-line" />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
