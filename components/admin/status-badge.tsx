const toneMap = {
  success: "border-status-success-border bg-status-success-bg text-status-success-text",
  warning: "border-status-warning-border bg-status-warning-bg text-status-warning-text",
  danger: "border-status-danger-border bg-status-danger-bg text-status-danger-text",
  info: "border-status-info-border bg-status-info-bg text-status-info-text",
  neutral: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-text",
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
