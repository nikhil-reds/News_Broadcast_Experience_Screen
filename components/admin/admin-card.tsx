export function AdminCard({
  title,
  value,
  detail,
  tone = "default",
}: {
  title: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const accents = {
    default: "border-slate-200",
    good: "border-emerald-200",
    warn: "border-amber-200",
    bad: "border-rose-200",
  };

  return (
    <div className={`rounded-lg border bg-white p-4 shadow-sm ${accents[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-3 text-2xl font-bold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-sm text-slate-500">{detail}</p> : null}
    </div>
  );
}
