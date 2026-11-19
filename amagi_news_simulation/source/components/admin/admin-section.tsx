import type { ReactNode } from "react";

export function AdminSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-admin-border bg-admin-surface p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="font-bold text-admin-text">{title}</h3>
        {description ? <p className="text-sm text-admin-text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</dl>;
}

export function DetailItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-md border border-admin-border-subtle bg-admin-surface-muted p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-admin-text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-admin-text">{value}</dd>
    </div>
  );
}
