import Link from "next/link";

export function AdminCard({
  title,
  value,
  detail,
  tone = "default",
  href,
}: {
  title: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "good" | "warn" | "bad";
  href?: string;
}) {
  const accents = {
    default: "border-admin-border before:bg-blue-500",
    good: "border-tone-good-border before:bg-emerald-400",
    warn: "border-tone-warn-border before:bg-amber-400",
    bad: "border-tone-bad-border before:bg-rose-500",
  };

  const card = (
    <div className={`relative flex h-full min-h-[7.5rem] min-w-0 flex-col overflow-hidden rounded-xl border bg-admin-surface p-4 shadow-sm before:absolute before:inset-x-0 before:top-0 before:h-0.5 transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:min-h-[8rem] sm:p-5 ${accents[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-normal text-admin-text-muted sm:text-xs">{title}</p>
        <span aria-hidden="true" className="shrink-0 text-lg leading-none text-admin-text-muted">{href ? "↗" : ""}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 sm:mt-3">
        <p className="break-words text-3xl font-thin leading-tight text-admin-text sm:text-3xl">{value}</p>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-2">
        {detail ? <p className="min-w-0 text-xs leading-5 text-admin-text-muted sm:text-sm">{detail}</p> : <span />}
      </div>
    </div>
  );

  return href ? <Link href={href} className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-admin-focus">{card}</Link> : card;
}
