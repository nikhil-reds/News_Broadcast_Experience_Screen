const toneMap = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

export function statusTone(status?: string | null): keyof typeof toneMap {
  const value = status?.toLowerCase() ?? "";
  if (["ready", "completed", "active", "success"].includes(value)) return "success";
  if (["processing", "queued", "preparing", "recording", "pending"].includes(value)) return "warning";
  if (["failed", "cancelled", "inactive", "error"].includes(value)) return "danger";
  if (["idle"].includes(value)) return "info";
  return "neutral";
}

export function StatusBadge({
  value,
  tone,
}: {
  value?: string | number | null;
  tone?: keyof typeof toneMap;
}) {
  const label = value === null || value === undefined || value === "" ? "None" : String(value);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${toneMap[tone ?? statusTone(label)]}`}
    >
      {label}
    </span>
  );
}
