"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { CONSENT_EXPIRY_PRESETS, CONSENT_TRANSITIONS, CONSENT_TYPES, formatConsentLabel, type ConsentFieldErrors, type ConsentStatus } from "@/lib/consent";

export type ConsentRecord = {
  id: string;
  participantName: string;
  participantEmail: string | null;
  consentType: string;
  scope: string;
  status: string;
  notes: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  withdrawnAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  events: Array<{ id: string; action: string; fromStatus: string | null; toStatus: string; note: string | null; performedBy: string | null; createdAt: string }>;
};

const inputClass = "mt-1.5 w-full rounded-lg border border-admin-input bg-admin-surface px-3 py-2.5 text-sm text-admin-text outline-none focus:border-admin-focus focus:ring-2 focus:ring-admin-focus/20";
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function DialogFrame({ title, description, children, onClose, busy = false }: { title: string; description: string; children: React.ReactNode; onClose: () => void; busy?: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) onCloseRef.current();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"));
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="consent-dialog-title" aria-describedby="consent-dialog-description" className="flex max-h-dvh w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-admin-border bg-admin-surface-solid shadow-2xl sm:max-h-[min(92dvh,54rem)] sm:rounded-3xl"><header className="flex items-start justify-between border-b border-admin-border bg-admin-surface-muted px-4 py-4 sm:px-6"><div className="min-w-0"><h2 id="consent-dialog-title" className="text-xl font-bold text-admin-text">{title}</h2><p id="consent-dialog-description" className="mt-1 break-words text-sm text-admin-text-muted">{description}</p></div><button ref={closeRef} type="button" disabled={busy} onClick={onClose} aria-label="Close dialog" className="shrink-0 rounded-md p-2 text-xl text-admin-text-muted hover:bg-admin-table-hover">×</button></header>{children}</div></div>;
}

export function AddConsentButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<ConsentStatus>("pending");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<ConsentFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 4000); return () => clearTimeout(timer); }, [notice]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setFields({});
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    if (body.grantedAt) body.grantedAt = new Date(String(body.grantedAt)).toISOString();
    try {
      const response = await fetch("/api/admin/consents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setFields(result?.fields ?? {}); throw new Error(result?.error || "Unable to save consent."); }
      form.reset(); setStatus("pending"); setOpen(false); setNotice("Consent record added successfully."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save consent."); }
    finally { setSaving(false); }
  }
  return <><button type="button" className="admin-action" onClick={() => { setError(null); setFields({}); setStatus("pending"); setOpen(true); }}>Add Consent</button>{open ? <DialogFrame title="Add Consent" description="Record a participant’s consent scope and current decision." onClose={() => setOpen(false)} busy={saving}><form onSubmit={submit} className="overflow-y-auto p-4 sm:p-6" noValidate>{error ? <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600">{error}</p> : null}<div className="grid gap-5 sm:grid-cols-2">
    <Field label="Participant name" error={fields.participantName}><input autoFocus name="participantName" required maxLength={100} className={inputClass} /></Field>
    <Field label="Participant email (optional)" error={fields.participantEmail}><input name="participantEmail" type="email" maxLength={254} className={inputClass} /></Field>
    <Field label="Consent type" error={fields.consentType}><select name="consentType" defaultValue="recording" className={inputClass}>{CONSENT_TYPES.map((type) => <option key={type} value={type}>{formatConsentLabel(type)}</option>)}</select></Field>
    <Field label="Status" error={fields.status}><select name="status" value={status} onChange={(event) => setStatus(event.target.value as ConsentStatus)} className={inputClass}>{["pending", "granted", "declined"].map((value) => <option key={value} value={value}>{formatConsentLabel(value)}</option>)}</select></Field>
    {status === "granted" ? <Field label="Granted date" error={fields.grantedAt}><input name="grantedAt" type="datetime-local" required className={inputClass} /></Field> : null}
    <Field label="Expiry" error={fields.expiryPreset}><select name="expiryPreset" defaultValue="24-hours" className={inputClass}>{CONSENT_EXPIRY_PRESETS.map((preset) => <option key={preset} value={preset}>{formatConsentLabel(preset)}</option>)}</select></Field>
    <Field label="Consent scope" error={fields.scope} wide><textarea name="scope" required minLength={10} maxLength={5000} rows={5} className={`${inputClass} resize-y`} /></Field>
    <Field label="Notes (optional)" error={fields.notes} wide><textarea name="notes" maxLength={5000} rows={3} className={`${inputClass} resize-y`} /></Field>
  </div><div className="mt-6 flex flex-col-reverse gap-3 border-t border-admin-border pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={saving} onClick={() => setOpen(false)} className="min-h-11 w-full border border-admin-input px-5 py-2.5 text-sm font-semibold text-admin-text sm:w-auto">Cancel</button><button type="submit" disabled={saving} className="admin-action min-h-11 w-full min-w-32 sm:w-auto">{saving ? "Saving…" : "Save Consent"}</button></div></form></DialogFrame> : null}<div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[100] max-w-[calc(100vw-2.5rem)]">{notice ? <p className="rounded-xl bg-slate-950 px-4 py-3 text-sm text-white shadow-xl">{notice}</p> : null}</div></>;
}

function Field({ label, error, wide, children }: { label: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`${wide ? "sm:col-span-2" : ""} text-sm font-semibold text-admin-text`}>{label}{children}{error ? <span role="alert" className="mt-1 block text-xs text-rose-600">{error}</span> : null}</label>;
}

export function ConsentsTable({ records }: { records: ConsentRecord[] }) {
  const [selected, setSelected] = useState<ConsentRecord | null>(null);
  return <><AdminTable headers={["Participant", "Email", "Type", "Scope", "Status", "Granted", "Expires", "Created", "Manage"]} empty={!records.length} showDetails={false}>{records.map((record) => <tr key={record.id}><Td label="Participant"><span className="font-semibold text-admin-text">{record.participantName}</span></Td><Td label="Email">{record.participantEmail ?? "—"}</Td><Td label="Type">{formatConsentLabel(record.consentType)}</Td><Td label="Scope"><span className="block max-w-64 truncate max-[1199px]:line-clamp-2 max-[1199px]:max-w-none max-[1199px]:whitespace-normal" title={record.scope}>{record.scope}</span></Td><Td label="Status"><StatusBadge value={record.status} /></Td><Td label="Granted">{dateTime(record.grantedAt)}</Td><Td label="Expires">{dateTime(record.expiresAt)}</Td><Td label="Created">{dateTime(record.createdAt)}</Td><Td label="Manage"><button type="button" onClick={() => setSelected(record)} className="min-h-11 w-full rounded-full border border-admin-input px-3 py-1.5 text-xs font-semibold text-admin-text hover:bg-admin-table-hover min-[1200px]:min-h-0 min-[1200px]:w-auto">View</button></Td></tr>)}</AdminTable>{selected ? <ConsentDetails consent={selected} onClose={() => setSelected(null)} /> : null}</>;
}

function ConsentDetails({ consent, onClose }: { consent: ConsentRecord; onClose: () => void }) {
  const router = useRouter();
  const nextStatuses = CONSENT_TRANSITIONS[consent.status as ConsentStatus] ?? [];
  const [nextStatus, setNextStatus] = useState<ConsentStatus | "">(nextStatuses[0] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!nextStatus) return; setSaving(true); setError(null);
    const formData = new FormData(event.currentTarget);
    const effectiveAt = String(formData.get("effectiveAt") || "");
    try {
      const response = await fetch(`/api/admin/consents/${consent.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedStatus: consent.status, status: nextStatus, effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : "", note: formData.get("note") }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || Object.values(result?.fields ?? {})[0] || "Unable to update consent.");
      onClose(); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update consent."); }
    finally { setSaving(false); }
  }
  const fields = [["Participant", consent.participantName], ["Email", consent.participantEmail ?? "—"], ["Type", formatConsentLabel(consent.consentType)], ["Status", formatConsentLabel(consent.status)], ["Granted", dateTime(consent.grantedAt)], ["Expires", dateTime(consent.expiresAt)], ["Withdrawn", dateTime(consent.withdrawnAt)], ["Created by", consent.createdBy ?? "—"], ["Created", dateTime(consent.createdAt)], ["Updated", dateTime(consent.updatedAt)], ["Record ID", consent.id]];
  return <DialogFrame title="Consent details" description={`${consent.participantName} · ${formatConsentLabel(consent.consentType)}`} onClose={onClose} busy={saving}><div className="overflow-y-auto p-4 sm:p-6"><dl className="grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-lg border border-admin-border-subtle bg-admin-surface-muted/60 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-admin-text-muted">{label}</dt><dd className="mt-1 break-words text-sm text-admin-text-secondary">{value}</dd></div>)}{[["Scope", consent.scope], ["Notes", consent.notes ?? "—"]].map(([label, value]) => <div key={label} className="rounded-lg border border-admin-border-subtle bg-admin-surface-muted/60 p-3 sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wide text-admin-text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-admin-text-secondary">{value}</dd></div>)}</dl>
    <section className="mt-6"><h3 className="text-sm font-bold text-admin-text">Audit history</h3><ol className="mt-3 space-y-3">{consent.events.map((event) => <li key={event.id} className="rounded-lg border border-admin-border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold text-admin-text">{event.fromStatus ? `${formatConsentLabel(event.fromStatus)} → ` : ""}{formatConsentLabel(event.toStatus)}</span><time className="text-xs text-admin-text-muted">{dateTime(event.createdAt)}</time></div><p className="mt-1 text-admin-text-muted">{event.note || formatConsentLabel(event.action)}{event.performedBy ? ` · ${event.performedBy}` : ""}</p></li>)}</ol></section>
    {nextStatuses.length ? <form onSubmit={updateStatus} className="mt-6 rounded-xl border border-admin-border bg-admin-surface-muted p-4"><h3 className="font-bold text-admin-text">Update status</h3>{error ? <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p> : null}<div className="mt-3 grid gap-4 sm:grid-cols-2"><Field label="New status"><select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as ConsentStatus)} className={inputClass}>{nextStatuses.map((status) => <option key={status} value={status}>{formatConsentLabel(status)}</option>)}</select></Field><Field label="Effective date"><input name="effectiveAt" required type="datetime-local" className={inputClass} /></Field><Field label={nextStatus === "withdrawn" ? "Reason (required)" : "Note (optional)"} wide><textarea name="note" required={nextStatus === "withdrawn"} minLength={nextStatus === "withdrawn" ? 5 : undefined} maxLength={5000} rows={3} className={`${inputClass} resize-y`} /></Field></div><div className="mt-4 flex justify-end"><button type="submit" disabled={saving} className="admin-action min-h-11 w-full sm:w-auto">{saving ? "Updating…" : `Mark ${formatConsentLabel(nextStatus)}`}</button></div></form> : <p className="mt-6 rounded-lg border border-admin-border bg-admin-surface-muted p-4 text-sm text-admin-text-muted">This consent has reached a final status. Its audit history remains available.</p>}
  </div></DialogFrame>;
}
