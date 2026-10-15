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
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="admin-detail-title" className="max-h-[min(80vh,48rem)] w-full max-w-3xl overflow-hidden rounded-2xl border border-admin-border bg-admin-surface-solid shadow-2xl">
        <header className="flex items-start justify-between border-b border-admin-border bg-admin-surface-muted px-6 py-4">
          <h2 id="admin-detail-title" className="text-lg font-bold text-admin-text">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close details" className="rounded-md p-2 text-admin-text-muted transition hover:bg-admin-table-hover hover:text-admin-text focus-visible:outline-2 focus-visible:outline-admin-focus">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <dl className="grid max-h-[calc(min(80vh,48rem)-5rem)] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          {fields.map((field) => <div key={field.label} className="rounded-lg border border-admin-border-subtle bg-admin-surface-muted/60 p-4"><dt className="text-xs font-bold uppercase tracking-wide text-admin-text-muted">{field.label}</dt><dd className="mt-2 break-words text-sm text-admin-text-secondary">{field.value}</dd></div>)}
        </dl>
      </section>
    </div>
  );
}
