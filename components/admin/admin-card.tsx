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
    default: "border-admin-border",
    good: "border-tone-good-border",
    warn: "border-tone-warn-border",
    bad: "border-tone-bad-border",
  };

  return (
    <div className={`rounded-lg border bg-admin-surface p-4 shadow-sm ${accents[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">{title}</p>
      <p className="mt-3 text-2xl font-bold text-admin-text">{value}</p>
      {detail ? <p className="mt-1 text-sm text-admin-text-muted">{detail}</p> : null}
    </div>
  );
}
