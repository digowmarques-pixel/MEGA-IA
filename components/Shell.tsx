"use client";

import { BarChart3, BookOpen, Boxes, Coins, Film, FolderKanban, ImageIcon, LayoutDashboard, LogOut, Mic, PanelLeftClose, PanelLeftOpen, Settings, UserRound, Users, Wallet, Wand2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { api, fmtCredits } from "@/lib/client";
import { Logo } from "./Logo";
import { ToastProvider } from "./ui";

const CREATE = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projetos", icon: FolderKanban },
  { href: "/image", label: "Imagem", icon: ImageIcon },
  { href: "/video", label: "Vídeo", icon: Film },
  { href: "/audio", label: "Áudio", icon: Mic },
  { href: "/enhance", label: "Enhance", icon: Wand2 },
  { href: "/avatar", label: "Avatares", icon: UserRound },
  { href: "/blocking", label: "Blocking 3D", icon: Boxes },
  { href: "/library", label: "Biblioteca de prompts", icon: BookOpen },
];
const ACCOUNT = [{ href: "/wallet", label: "Minha carteira", icon: Wallet }];
const ADMIN = [
  { href: "/admin", label: "Consumo", icon: BarChart3 },
  { href: "/admin/credits", label: "Créditos", icon: Coins },
  { href: "/admin/users", label: "Equipe", icon: Users },
  { href: "/admin/settings", label: "Configurações", icon: Settings },
];

export function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [wallets, setWallets] = useState<{ user: number; personal: number } | null>(null);
  const [status, setStatus] = useState<{ higgsfield: string; claude: string | null } | null>(null);

  useEffect(() => { try { setCollapsed(localStorage.getItem("sidebar") === "1"); } catch {} }, []);
  useEffect(() => {
    const load = () => api<{ wallets: { type: string; balance: number }[] }>("/api/wallets").then((r) => setWallets({
      user: r.wallets.find((w) => w.type === "user")?.balance ?? 0,
      personal: r.wallets.find((w) => w.type === "personal")?.balance ?? 0,
    })).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    window.addEventListener("mega:wallet", load);
    api<{ higgsfield: string; claude: string | null }>("/api/status").then(setStatus).catch(() => {});
    return () => { clearInterval(t); window.removeEventListener("mega:wallet", load); };
  }, [path]);

  const toggle = () => { setCollapsed((c) => { try { localStorage.setItem("sidebar", c ? "0" : "1"); } catch {} return !c; }); };
  const active = (href: string) => (href === "/" ? path === "/" : href === "/admin" ? path === "/admin" : path.startsWith(href));

  const Section = ({ title, items }: { title?: string; items: typeof CREATE }) => (
    <div className="space-y-0.5">
      {title && !collapsed && <div className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{title}</div>}
      {title && collapsed && <div className="mx-3 my-3 border-t border-line" />}
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} title={label}
          className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${active(href) ? "bg-raised text-white" : "text-soft hover:bg-card hover:text-white"}`}>
          {active(href) && <span className="mega-stripes absolute inset-y-1.5 left-0 w-[3px] rounded-r" />}
          <Icon className={`h-[18px] w-[18px] shrink-0 ${active(href) ? "text-mega-yellow" : ""}`} />
          {!collapsed && label}
        </Link>
      ))}
    </div>
  );

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-ink">
        <aside className={`flex shrink-0 flex-col border-r border-line bg-base transition-[width] duration-200 ${collapsed ? "w-[64px]" : "w-[232px]"}`}>
          <div className="flex h-14 items-center justify-between px-3">
            {collapsed ? <Logo compact className="mx-auto" /> : <Logo />}
            {!collapsed && <button onClick={toggle} className="btn-ghost p-1.5" title="Recolher menu"><PanelLeftClose className="h-4 w-4" /></button>}
          </div>
          {collapsed && <button onClick={toggle} className="btn-ghost mx-auto mb-2 p-1.5" title="Expandir menu"><PanelLeftOpen className="h-4 w-4" /></button>}
          <nav className="flex-1 overflow-y-auto px-2 pb-4">
            <Section items={CREATE} />
            <Section title="Conta" items={ACCOUNT} />
            {user.role === "admin" && <Section title="Gestor" items={ADMIN} />}
          </nav>
          {!collapsed && wallets && (
            <Link href="/wallet" className="mx-2 mb-2 rounded-xl border border-line bg-panel p-3 hover:border-line-strong">
              <div className="flex items-center justify-between text-[11px] text-muted"><span>Cota da empresa</span><span className="font-bold tabular-nums text-mega-yellow">{fmtCredits(wallets.user)}</span></div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted"><span>Pessoais</span><span className="font-bold tabular-nums text-white">{fmtCredits(wallets.personal)}</span></div>
            </Link>
          )}
          <div className="flex items-center gap-2 border-t border-line p-3">
            <div className="mega-stripes flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-black">{user.name.slice(0, 1).toUpperCase()}</div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{user.name}</div>
                <div className="truncate text-[11px] text-muted">{user.role === "admin" ? "Gestor" : user.department || "Colaborador"}{status && status.higgsfield === "mock" ? " · simulação" : ""}</div>
              </div>
            )}
            {!collapsed && (
              <button className="btn-ghost p-1.5" title="Sair" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </ToastProvider>
  );
}
