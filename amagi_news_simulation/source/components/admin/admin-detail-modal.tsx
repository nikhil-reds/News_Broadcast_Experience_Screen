"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type AdminDetailField = { label: string; value: ReactNode };

export function AdminDetailModal({
  title,
  fields,
  onClose,
}: {
  title: string;
  fields: AdminDetailField[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const trigger = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); }
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="admin-detail-title" className="max-h-dvh w-full max-w-3xl overflow-hidden rounded-t-3xl border border-admin-border bg-admin-surface-solid shadow-2xl sm:max-h-[min(80vh,48rem)] sm:rounded-2xl">
        <header className="flex items-start justify-between border-b border-admin-border bg-admin-surface-muted px-4 py-4 sm:px-6">
          <h2 id="admin-detail-title" className="text-lg font-bold text-admin-text">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close details" className="rounded-md p-2 text-admin-text-muted transition hover:bg-admin-table-hover hover:text-admin-text focus-visible:outline-2 focus-visible:outline-admin-focus">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <dl className="grid max-h-[calc(100dvh-5rem)] gap-3 overflow-y-auto p-4 sm:max-h-[calc(min(80vh,48rem)-5rem)] sm:grid-cols-2 sm:gap-4 sm:p-6">
          {fields.map((field) => <div key={field.label} className={`${["Preview", "Source text", "Translation", "Feedback", "Message"].includes(field.label) ? "sm:col-span-2" : ""} rounded-lg border border-admin-border-subtle bg-admin-surface-muted/60 p-4`}><dt className="text-xs font-bold uppercase tracking-wide text-admin-text-muted">{field.label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm text-admin-text-secondary">{field.value}</dd></div>)}
        </dl>
      </section>
    </div>
  );
}
