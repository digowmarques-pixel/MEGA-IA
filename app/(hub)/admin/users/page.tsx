"use client";

import { KeyRound, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Modal, Spinner, useToast } from "@/components/ui";
import { api, fmtCredits, fmtDate } from "@/lib/client";

type U = { id: number; name: string; email: string; role: "admin" | "member"; department: string | null; monthly_allowance: number; active: number; month_credits: number; last_activity: string | null; balance: number; personal: number };
type Form = { id?: number; name: string; email: string; password: string; role: "admin" | "member"; department: string; monthly_allowance: string };
const EMPTY: Form = { name: "", email: "", password: "", role: "member", department: "", monthly_allowance: "300" };

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState<U[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const load = () => api<{ users: U[] }>("/api/admin/users").then((r) => setUsers(r.users)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form) return;
    try {
      const body = { ...form, monthly_allowance: Number(form.monthly_allowance) || 0, password: form.password || undefined };
      if (form.id) await api(`/api/admin/users/${form.id}`, { method: "PATCH", json: body });
      else await api("/api/admin/users", { method: "POST", json: body });
      toast("ok", form.id ? "Funcionário atualizado" : "Funcionário criado — envie o e-mail e a senha inicial para ele");
      setForm(null);
      load();
    } catch (e) { toast("err", e instanceof Error ? e.message : "Erro"); }
  }

  const genPassword = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 54]).join("");

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Equipe" subtitle="Acessos, perfis e cotas mensais" actions={<button className="btn-primary" onClick={() => setForm({ ...EMPTY, password: genPassword() })}><UserPlus className="h-4 w-4" />Novo funcionário</button>} />
      <div className="p-6">
        {!users ? <Spinner className="h-6 w-6" /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr className="border-b border-line"><th className="px-4 py-2">Nome</th><th className="px-2 py-2">Perfil</th><th className="px-2 py-2 text-right">Cota/mês</th><th className="px-2 py-2 text-right">Saldo</th><th className="px-2 py-2 text-right">Gasto no mês</th><th className="px-2 py-2">Última atividade</th><th className="px-4 py-2" /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={`border-b border-line/60 ${u.active ? "" : "opacity-50"}`}>
                    <td className="px-4 py-2.5"><div className="font-semibold">{u.name}</div><div className="text-[11px] text-muted">{u.email}{u.department ? ` · ${u.department}` : ""}</div></td>
                    <td className="px-2 py-2.5"><span className={`chip ${u.role === "admin" ? "chip-active" : ""}`}>{u.role === "admin" ? "Gestor" : "Colaborador"}</span>{!u.active && <span className="chip ml-1">inativo</span>}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{fmtCredits(u.monthly_allowance)}</td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-mega-yellow">{fmtCredits(u.balance)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{fmtCredits(u.month_credits)}</td>
                    <td className="px-2 py-2.5 text-xs text-muted">{u.last_activity ? fmtDate(u.last_activity) : "—"}</td>
                    <td className="space-x-1 whitespace-nowrap px-4 py-2.5 text-right">
                      <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setForm({ id: u.id, name: u.name, email: u.email, password: "", role: u.role, department: u.department ?? "", monthly_allowance: String(u.monthly_allowance) })}>Editar</button>
                      <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => api(`/api/admin/users/${u.id}`, { method: "PATCH", json: { active: !u.active } }).then(load).catch((e) => toast("err", e.message))}>{u.active ? "Desativar" : "Reativar"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Editar funcionário" : "Novo funcionário"} footer={<><button className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn-primary" onClick={save}>Salvar</button></>}>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Nome</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
              <div><label className="label">Setor</label><input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Ex.: Pós-produção" /></div>
            </div>
            <div><label className="label">E-mail (login)</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div>
              <label className="label">{form.id ? "Nova senha (deixe vazio para manter)" : "Senha inicial"}</label>
              <div className="flex gap-2"><input className="input font-mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button className="btn-outline shrink-0" title="Gerar senha" onClick={() => setForm({ ...form, password: genPassword() })}><KeyRound className="h-4 w-4" /></button></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Perfil</label><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Form["role"] })}><option value="member">Colaborador</option><option value="admin">Gestor</option></select></div>
              <div><label className="label">Cota mensal (créditos)</label><input className="input" inputMode="numeric" value={form.monthly_allowance} onChange={(e) => setForm({ ...form, monthly_allowance: e.target.value.replace(/[^\d]/g, "") })} /></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
