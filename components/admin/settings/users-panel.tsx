"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Avatar, Icon, SectionHeading, SettingsPanel, StatusDot } from "./settings-primitives";

export type RealAdminUser = {
  id: string; name: string; email: string; status: string; source: "environment" | "database";
  lastLoginAt: string | null; createdAt: string | null;
};
type FieldErrors = Partial<Record<"name" | "email" | "password", string>>;
const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-admin-input bg-admin-surface px-3 text-sm text-admin-text outline-none focus:border-admin-focus focus:ring-2 focus:ring-admin-focus/20";

export function UsersPanel({ initialUsers }: { initialUsers: RealAdminUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  return <div className="space-y-5">
    <SectionHeading title="Users" description="Administrators who can sign in to this application." action={<button type="button" onClick={() => setOpen(true)} className="admin-action min-h-11 w-full gap-2 sm:w-auto"><Icon name="plus" className="size-4" />Add User</button>} />
    {notice ? <p role="status" className="rounded-xl border border-status-success-border bg-status-success-bg px-4 py-3 text-sm text-status-success-text">{notice}</p> : null}
    <SettingsPanel className="divide-y divide-admin-border !p-0">
      {users.map((user) => <article key={user.id} className="grid min-w-0 gap-4 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(9rem,.6fr)_minmax(10rem,.7fr)] xl:items-center">
        <div className="flex min-w-0 items-center gap-3"><Avatar name={user.name} /><div className="min-w-0"><p className="break-words text-sm font-semibold capitalize text-admin-text">{user.name}</p><p className="break-all text-xs text-admin-text-muted xl:truncate">{user.email}</p></div></div>
        <div><span className="mb-1 block text-[.68rem] font-bold uppercase tracking-wide text-admin-text-muted">Access</span><p className="w-fit rounded-lg bg-admin-surface-muted px-2.5 py-1 text-xs font-semibold text-admin-text-secondary ring-1 ring-admin-border">Administrator</p></div>
        <div><span className="mb-1 block text-[.68rem] font-bold uppercase tracking-wide text-admin-text-muted">Status</span><div className="flex flex-wrap items-center gap-2"><StatusDot tone="success">Active</StatusDot><span className="text-xs text-admin-text-muted">{user.source === "environment" ? "Environment" : user.lastLoginAt ? `Last sign-in ${new Date(user.lastLoginAt).toLocaleDateString()}` : "Not signed in"}</span></div></div>
      </article>)}
    </SettingsPanel>
    {open ? <AddUserDialog existingEmails={users.map((user) => user.email)} onClose={() => setOpen(false)} onCreated={(user) => { setUsers((current) => [...current, user]); setOpen(false); setNotice(`${user.name} can now sign in.`); }} /> : null}
  </div>;
}

function AddUserDialog({ existingEmails, onClose, onCreated }: { existingEmails: string[]; onClose: () => void; onCreated: (user: RealAdminUser) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FieldErrors>({});
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; nameRef.current?.focus(); const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); }; window.addEventListener("keydown", key); return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", key); previous?.focus(); }; }, [onClose, saving]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return; setSaving(true); setError(""); setFields({});
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (existingEmails.some((email) => email.toLowerCase() === String(data.email).trim().toLowerCase())) { setFields({ email: "This email is already in use." }); setSaving(false); return; }
    try { const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const result = await response.json().catch(() => null); if (!response.ok) { setFields(result?.fields ?? {}); throw new Error(result?.error || "Unable to add user."); } onCreated({ ...result.user, source: "database", lastLoginAt: result.user.lastLoginAt ?? null, createdAt: result.user.createdAt }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to add user."); setSaving(false); }
  }
  function generatePassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";
    const values = crypto.getRandomValues(new Uint32Array(18));
    const password = Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
    if (passwordRef.current) {
      passwordRef.current.value = password;
      passwordRef.current.focus();
    }
    setShowPassword(true);
    setFields((current) => ({ ...current, password: undefined }));
  }
  return createPortal(<div className="admin-theme admin-theme-dark fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/75 p-4 text-admin-text backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="add-user-title" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-admin-border bg-[#17171e] shadow-2xl sm:max-h-[90dvh]">
    <header className="flex items-start justify-between gap-4 border-b border-admin-border bg-admin-surface-muted px-4 py-4 sm:px-6"><div><h3 id="add-user-title" className="text-xl font-bold text-admin-text">Add User</h3><p className="mt-1 text-sm text-admin-text-muted">Create an administrator account with sign-in access.</p></div><button type="button" disabled={saving} onClick={onClose} aria-label="Close add user" className="grid size-10 shrink-0 place-items-center rounded-lg text-xl text-admin-text-muted hover:bg-admin-table-hover">×</button></header>
    <form onSubmit={submit} className="overflow-y-auto p-4 sm:p-6" noValidate>{error ? <p role="alert" className="mb-4 rounded-lg border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger-text">{error}</p> : null}<div className="space-y-4">
      <label className="block text-sm font-semibold text-admin-text">Full name<input ref={nameRef} name="name" required maxLength={100} className={inputClass} />{fields.name ? <span className="mt-1 block text-xs text-status-danger-text">{fields.name}</span> : null}</label>
      <label className="block text-sm font-semibold text-admin-text">Email address<input name="email" type="email" required maxLength={254} className={inputClass} />{fields.email ? <span className="mt-1 block text-xs text-status-danger-text">{fields.email}</span> : null}</label>
      <div className="block text-sm font-semibold text-admin-text"><label htmlFor="add-user-password">Password</label><div className="relative"><input ref={passwordRef} id="add-user-password" name="password" type={showPassword ? "text" : "password"} required minLength={12} maxLength={128} autoComplete="new-password" className={`${inputClass} pr-12`} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-admin-text-muted transition-colors hover:bg-admin-table-hover hover:text-admin-text"><Icon name={showPassword ? "eyeOff" : "eye"} className="size-5" /></button></div><div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs font-normal text-admin-text-muted">Use at least 12 characters. Share it securely with the user.</span><button type="button" onClick={generatePassword} className="inline-flex min-h-9 shrink-0 items-center gap-2 border border-admin-input px-3 text-xs font-semibold text-admin-text transition-colors hover:bg-admin-table-hover"><Icon name="key" className="size-4" />Generate password</button></div>{fields.password ? <span className="mt-1 block text-xs text-status-danger-text">{fields.password}</span> : null}</div>
    </div><div className="mt-6 flex flex-col-reverse gap-3 border-t border-admin-border pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={saving} onClick={onClose} className="min-h-11 w-full border border-admin-input px-5 text-sm font-semibold text-admin-text sm:w-auto">Cancel</button><button type="submit" disabled={saving} className="admin-action min-h-11 w-full min-w-32 sm:w-auto">{saving ? "Adding…" : "Add User"}</button></div></form>
  </div></div>, document.body);
}
