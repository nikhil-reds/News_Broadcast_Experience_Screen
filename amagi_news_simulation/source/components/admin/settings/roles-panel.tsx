"use client";

import { useState, type FormEvent } from "react";
import { Icon, SectionHeading, SettingsPanel } from "./settings-primitives";

export type AdminRoleView = { id: string; slug: string; name: string; description: string | null; permissions: string[]; isSystem: boolean; _count: { users: number } };
const groups = [
  ["Workspace", ["dashboard.read", "settings.read", "settings.manage"]],
  ["Studio & screens", ["studio.read", "studio.control", "screens.read", "screens.manage", "logs.read"]],
  ["Records", ["feedback.read", "feedback.manage", "consents.read", "consents.manage"]],
  ["Access control", ["users.read", "users.create", "users.update", "users.disable", "roles.read", "roles.manage"]],
] as const;

export function RolesPanel({ initialRoles, canManage }: { initialRoles: AdminRoleView[]; canManage: boolean }) {
  const [roles, setRoles] = useState(initialRoles);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget; const data = new FormData(form);
    const response = await fetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), description: data.get("description"), permissions: data.getAll("permissions") }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) { setError(result?.error ?? "Unable to create role."); setBusy(false); return; }
    setRoles((current) => [...current, result.role]); setCreating(false); setBusy(false); form.reset();
  }
  return <div className="space-y-5">
    <SectionHeading title="Roles & Permissions" description="Control exactly what each team member can view and change." action={canManage ? <button type="button" onClick={() => setCreating((value) => !value)} className="admin-action min-h-11 w-full gap-2 sm:w-auto"><Icon name="plus" className="size-4" />Create Role</button> : undefined} />
    {creating ? <SettingsPanel><form onSubmit={create} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-admin-text">Role name<input name="name" required minLength={2} maxLength={60} className="mt-1.5 min-h-11 w-full rounded-xl border border-admin-input bg-admin-surface px-3" /></label><label className="text-sm font-semibold text-admin-text">Description<input name="description" maxLength={180} className="mt-1.5 min-h-11 w-full rounded-xl border border-admin-input bg-admin-surface px-3" /></label></div>{error ? <p role="alert" className="text-sm text-status-danger-text">{error}</p> : null}<div className="grid gap-4 lg:grid-cols-2">{groups.map(([label, items]) => <fieldset key={label} className="rounded-xl border border-admin-border p-4"><legend className="px-1 text-sm font-bold text-admin-text">{label}</legend><div className="mt-2 grid gap-2">{items.map((permission) => <label key={permission} className="flex items-center gap-2 text-sm text-admin-text-secondary"><input type="checkbox" name="permissions" value={permission} className="size-4 accent-admin-accent" />{permission}</label>)}</div></fieldset>)}</div><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCreating(false)} className="min-h-11 border border-admin-input px-5">Cancel</button><button disabled={busy} className="admin-action min-h-11 px-5">{busy ? "Creating…" : "Create Role"}</button></div></form></SettingsPanel> : null}
    <div className="grid gap-4 lg:grid-cols-2">{roles.map((role) => <SettingsPanel key={role.id} className="flex flex-col"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-admin-text">{role.name}</h4>{role.isSystem ? <span className="rounded-full bg-admin-accent/15 px-2 py-1 text-[.68rem] font-bold uppercase text-admin-accent">Protected</span> : null}</div><p className="mt-1 text-sm text-admin-text-muted">{role.description || "Custom workspace role"}</p></div><span className="shrink-0 text-xs font-semibold text-admin-text-muted">{role._count.users} users</span></div><div className="mt-4 flex flex-wrap gap-2">{role.permissions.map((permission) => <span key={permission} className="rounded-lg border border-admin-border bg-admin-surface-muted px-2 py-1 text-xs text-admin-text-secondary">{permission}</span>)}</div></SettingsPanel>)}</div>
  </div>;
}
