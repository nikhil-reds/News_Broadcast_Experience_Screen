import Link from "next/link";

function Sparkline({ tone }: { tone: "default" | "good" | "warn" | "bad" }) {
  const stroke = { default: "#60a5fa", good: "#34d399", warn: "#f59e0b", bad: "#fb7185" }[tone];
  return (
    <svg aria-hidden="true" viewBox="0 0 120 28" className="h-7 w-full max-w-[8rem] overflow-visible">
      <path d="M0 24H120" stroke={stroke} strokeOpacity=".35" strokeDasharray="2 3" />
      <path d="M0 24 C18 24, 23 24, 35 22 S52 22, 63 15 S75 5, 86 13 S98 20, 120 10" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

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
        <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-admin-text-muted sm:text-xs">{title}</p>
        <span aria-hidden="true" className="shrink-0 text-lg leading-none text-admin-text-muted">⋮</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 sm:mt-3">
        <p className="break-words text-2xl font-bold leading-tight text-admin-text sm:text-3xl">{value}</p>
        <span className={`rounded-full px-2 py-1 text-[0.65rem] font-bold ${tone === "bad" ? "bg-status-danger-bg text-status-danger-text" : tone === "warn" ? "bg-status-warning-bg text-status-warning-text" : "bg-status-success-bg text-status-success-text"}`}>{Number(value) > 0 ? "↑ 100%" : "0%"}</span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-2">
        {detail ? <p className="min-w-0 text-xs leading-5 text-admin-text-muted sm:text-sm">{detail}</p> : <span />}
        <Sparkline tone={tone} />
      </div>
    </div>
  );

  return href ? <Link href={href} className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-admin-focus">{card}</Link> : card;
}
