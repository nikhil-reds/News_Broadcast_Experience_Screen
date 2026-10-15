"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { roleDescriptions, roleOptions, type PreviewUser, type UserStatus } from "./settings-data";
import { Avatar, EmptyState, Icon, SectionHeading, SettingsPanel, StatusDot, type Tone } from "./settings-primitives";

const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-admin-input bg-admin-surface px-3 text-sm text-admin-text outline-none transition placeholder:text-admin-text-muted focus:border-admin-focus focus:ring-2 focus:ring-admin-focus/20";
const statusTone: Record<UserStatus, Tone> = { Active: "success", Pending: "warning", Suspended: "danger" };
const gridCols = "xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7.5rem_6.5rem]";

export function UsersPanel({ users, onAddUser }: { users: PreviewUser[]; onAddUser: (user: { name: string; email: string; role: string }) => void }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All roles");
  const [status, setStatus] = useState("All statuses");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const visible = users.filter((user) => {
    const matchesQuery = `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (role === "All roles" || user.role === role) && (status === "All statuses" || user.status === status);
  });

  function addUser(user: { name: string; email: string; role: string }) {
    onAddUser(user);
    setNotice(`${user.name} was added to this preview. No invitation was sent.`);
    setDialogOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Users"
        description="Explore team members and preview how access would be assigned."
        action={<button type="button" onClick={() => setDialogOpen(true)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-admin-primary px-5 text-sm font-semibold text-admin-on-primary shadow-sm transition hover:bg-admin-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-focus sm:w-auto"><Icon name="plus" className="size-4" />Add user</button>}
      />
      {notice && <p role="status" className="flex items-start gap-2 rounded-xl border border-status-info-border bg-status-info-bg px-4 py-3 text-sm text-status-info-text"><Icon name="info" className="mt-0.5 size-4" />{notice}</p>}
      <SettingsPanel className="!p-3 sm:!p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_11rem_11rem]">
          <label className="relative block">
            <span className="sr-only">Search users</span>
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-admin-text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, or role" className={`${inputClass} pl-9`} />
          </label>
          <label className="block"><span className="sr-only">Filter by role</span><select value={role} onChange={(event) => setRole(event.target.value)} className={inputClass}><option>All roles</option><option>Super Admin</option>{roleOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label className="block"><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option>All statuses</option><option>Active</option><option>Pending</option><option>Suspended</option></select></label>
        </div>
      </SettingsPanel>
      <div className="overflow-hidden rounded-2xl border border-admin-border bg-admin-surface shadow-sm">
        <div className={`hidden grid-cols-1 gap-4 border-b border-admin-border bg-admin-surface-muted px-5 py-3 text-xs font-bold uppercase tracking-wide text-admin-text-muted xl:grid ${gridCols}`}>
          <span>Member</span><span>Role</span><span>Status</span><span>Last active</span>
        </div>
        {visible.length ? visible.map((user) => (
          <div key={user.email} className={`grid min-w-0 items-center gap-3 border-b border-admin-border-subtle px-4 py-4 transition-colors last:border-b-0 hover:bg-admin-table-hover sm:px-5 xl:gap-4 ${gridCols}`}>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={user.name} />
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-admin-text" title={user.name}>{user.name}</p><p className="truncate text-xs text-admin-text-muted" title={user.email}>{user.email}</p></div>
            </div>
            <p className="w-fit rounded-lg bg-admin-surface-muted px-2.5 py-1 text-xs font-semibold text-admin-text-secondary ring-1 ring-admin-border">{user.role}</p>
            <StatusDot tone={statusTone[user.status]}>{user.status}</StatusDot>
            <p className="text-xs text-admin-text-muted">{user.lastActive}</p>
          </div>
        )) : (
          <div>
            <EmptyState icon="search" title="No users match these filters" description="Try another search or reset the filters." />
            <div className="-mt-10 pb-12 text-center"><button type="button" onClick={() => { setQuery(""); setRole("All roles"); setStatus("All statuses"); }} className="text-sm font-semibold text-admin-accent hover:underline">Clear filters</button></div>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-admin-text-muted sm:text-left">{visible.length} of {users.length} members shown</p>
      {dialogOpen && <AddUserDialog existingEmails={users.map((user) => user.email)} onClose={closeDialog} onAdd={addUser} />}
    </div>
  );
}

function AddUserDialog({ existingEmails, onClose, onAdd }: { existingEmails: string[]; onClose: () => void; onAdd: (user: { name: string; email: string; role: string }) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Viewer");
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nameRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled])"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (existingEmails.some((candidate) => candidate.toLowerCase() === normalizedEmail)) {
      setError("This email already appears in the preview list.");
      return;
    }
    onAdd({ name: name.trim(), email: normalizedEmail, role });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="add-user-title" aria-describedby="add-user-description" className="settings-fade flex max-h-[100dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-admin-border bg-admin-surface-solid shadow-2xl sm:max-h-[min(90dvh,42rem)] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-admin-border px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-accent/15 text-admin-accent"><Icon name="users" /></span>
            <div><h3 id="add-user-title" className="text-xl font-bold text-admin-text">Add user</h3><p id="add-user-description" className="mt-1 text-sm text-admin-text-muted">Preview a team member and their assigned role.</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close add user dialog" className="grid size-10 shrink-0 place-items-center rounded-lg text-xl text-admin-text-muted hover:bg-admin-surface-muted focus-visible:outline-2 focus-visible:outline-admin-focus">×</button>
        </div>
        <form onSubmit={submit} className="min-h-0 overflow-y-auto">
          <div className="space-y-5 px-5 py-5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-admin-text">Full name<input ref={nameRef} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Maya Singh" className={`mt-2 ${inputClass}`} /></label>
              <label className="block text-sm font-semibold text-admin-text">Email address<input required type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="name@company.com" aria-invalid={Boolean(error)} aria-describedby={error ? "add-user-error" : undefined} className={`mt-2 ${inputClass}`} /></label>
            </div>
            <label className="block text-sm font-semibold text-admin-text">Role<select value={role} onChange={(event) => setRole(event.target.value)} className={`mt-2 ${inputClass}`}>{roleOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <div className="rounded-xl border border-admin-border bg-admin-surface-muted p-4">
              <p className="text-sm font-semibold text-admin-text">{role}</p>
              <p className="mt-1 text-sm leading-5 text-admin-text-muted">{roleDescriptions[role] ?? ""}</p>
            </div>
            {error && <p id="add-user-error" role="alert" className="text-sm text-status-danger-text">{error}</p>}
            <p className="text-xs leading-5 text-admin-text-muted">This adds a local preview row only. It does not create an account or send email.</p>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-admin-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-admin-border px-5 text-sm font-semibold text-admin-text-secondary hover:bg-admin-surface-muted">Cancel</button>
            <button type="submit" className="min-h-11 rounded-xl bg-admin-primary px-5 text-sm font-semibold text-admin-on-primary hover:bg-admin-primary-hover">Add to preview</button>
          </div>
        </form>
      </div>
    </div>
  );
}
