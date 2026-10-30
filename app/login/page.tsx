"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha no login");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-4">
      <div className="pointer-events-none absolute -right-40 top-0 h-[140%] w-[420px] rotate-[22deg] opacity-[0.07] mega-stripes" />
      <form onSubmit={submit} className="card relative w-full max-w-sm p-7">
        <Logo className="mb-1" />
        <p className="mb-6 text-sm text-muted">Entre com sua conta da produtora.</p>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="input mb-3" autoFocus />
        <label className="label" htmlFor="pw">Senha</label>
        <input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input mb-4" />
        {error && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={loading}>{loading ? <Spinner /> : "Entrar"}</button>
        <p className="mt-4 text-center text-[11px] text-muted">Esqueceu a senha? Fale com o gestor.</p>
      </form>
    </div>
  );
}
