"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, formatFeedbackLabel, type FeedbackFieldErrors } from "@/lib/feedback";

export function AddFeedbackButton() {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FeedbackFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);

  function close() {
    if (!savingRef.current) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nameRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setFields({});
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setFields(result?.fields ?? {});
        throw new Error(result?.error || "Unable to save feedback.");
      }
      form.reset();
      setOpen(false);
      setNotice("Feedback added successfully.");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save feedback.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const fieldClass = "mt-1.5 w-full rounded-lg border border-admin-input bg-admin-surface px-3 py-2.5 text-sm text-admin-text outline-none focus:border-admin-focus focus:ring-2 focus:ring-admin-focus/20";

  return <>
    <button ref={triggerRef} type="button" className="admin-action" onClick={() => { setError(null); setFields({}); setOpen(true); }}>Add Feedback</button>
    {open ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="add-feedback-title" aria-describedby="add-feedback-description" className="flex max-h-dvh w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-admin-border bg-admin-surface-solid shadow-2xl sm:max-h-[min(90dvh,48rem)] sm:rounded-3xl">
        <header className="flex items-start justify-between border-b border-admin-border bg-admin-surface-muted px-4 py-4 sm:px-6">
          <div><h2 id="add-feedback-title" className="text-lg font-bold text-admin-text">Add Feedback</h2><p id="add-feedback-description" className="mt-1 text-sm text-admin-text-muted">Record feedback for product and broadcast follow-up.</p></div>
          <button type="button" onClick={close} disabled={saving} aria-label="Close add feedback" className="rounded-md p-2 text-admin-text-muted hover:bg-admin-table-hover hover:text-admin-text focus-visible:outline-2 focus-visible:outline-admin-focus">×</button>
        </header>
        <form onSubmit={submit} className="overflow-y-auto p-4 sm:p-6" noValidate>
          {error ? <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600">{error}</p> : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold text-admin-text">Name<input ref={nameRef} name="name" required maxLength={100} aria-invalid={Boolean(fields.name)} aria-describedby={fields.name ? "feedback-name-error" : undefined} className={fieldClass} />{fields.name ? <span id="feedback-name-error" className="mt-1 block text-xs text-rose-600">{fields.name}</span> : null}</label>
            <label className="text-sm font-semibold text-admin-text">Email <span className="font-normal text-admin-text-muted">(optional)</span><input name="email" type="email" maxLength={254} aria-invalid={Boolean(fields.email)} aria-describedby={fields.email ? "feedback-email-error" : undefined} className={fieldClass} />{fields.email ? <span id="feedback-email-error" className="mt-1 block text-xs text-rose-600">{fields.email}</span> : null}</label>
            <label className="text-sm font-semibold text-admin-text">Category<select name="category" defaultValue="general" className={fieldClass}>{FEEDBACK_CATEGORIES.map((category) => <option key={category} value={category}>{formatFeedbackLabel(category)}</option>)}</select></label>
            <label className="text-sm font-semibold text-admin-text">Rating <span className="font-normal text-admin-text-muted">(optional)</span><select name="rating" defaultValue="" className={fieldClass}><option value="">Not rated</option>{[1,2,3,4,5].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select></label>
            <label className="text-sm font-semibold text-admin-text">Status<select name="status" defaultValue="new" className={fieldClass}>{FEEDBACK_STATUSES.map((status) => <option key={status} value={status}>{formatFeedbackLabel(status)}</option>)}</select></label>
            <label className="sm:col-span-2 text-sm font-semibold text-admin-text">Feedback<textarea name="message" required minLength={10} maxLength={5000} rows={6} aria-invalid={Boolean(fields.message)} aria-describedby={fields.message ? "feedback-message-error" : undefined} className={`${fieldClass} resize-y`} />{fields.message ? <span id="feedback-message-error" className="mt-1 block text-xs text-rose-600">{fields.message}</span> : null}</label>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-admin-border pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={close} disabled={saving} className="min-h-11 w-full border border-admin-input px-5 py-2.5 text-sm font-semibold text-admin-text hover:bg-admin-table-hover sm:w-auto">Cancel</button><button type="submit" disabled={saving} className="admin-action min-h-11 w-full min-w-32 sm:w-auto">{saving ? "Saving…" : "Save Feedback"}</button></div>
        </form>
      </div>
    </div> : null}
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[100]">{notice ? <p className="rounded-xl bg-slate-950 px-4 py-3 text-sm text-white shadow-xl">{notice}</p> : null}</div>
  </>;
}
