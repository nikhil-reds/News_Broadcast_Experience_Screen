import Link from "next/link";
import type { ReactNode } from "react";

export function AdminPageHeader({
  title,
  description,
  backHref,
  backLabel,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {backHref ? (
          <Link href={backHref} className="text-sm font-semibold text-admin-accent hover:underline">
            {backLabel ?? "Back"}
          </Link>
        ) : null}
        <h2 className={`text-2xl font-bold text-admin-text ${backHref ? "mt-2" : ""}`}>{title}</h2>
        {description ? <p className="text-sm text-admin-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
