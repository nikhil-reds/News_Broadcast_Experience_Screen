import { Avatar, Icon, SectionHeading, SettingsPanel, SettingsRow, StatusDot } from "./settings-primitives";

export function GeneralPanel({ email }: { email: string }) {
  return (
    <div className="space-y-5">
      <SectionHeading title="General" description="The account used to sign in to this workspace." />
      <SettingsPanel className="divide-y divide-admin-border !p-0">
        <div className="flex items-center gap-4 px-4 py-6 sm:px-6">
          <Avatar name={email.split("@")[0].replace(/[._-]/g, " ")} className="size-14 text-base" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-admin-text">{email}</p>
            <p className="mt-1 text-sm text-admin-text-muted">Primary administrator</p>
          </div>
        </div>
        <SettingsRow label="Sign-in email" description="Set with the ADMIN_EMAIL environment variable.">
          <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-admin-border bg-admin-surface-muted px-3 py-2 text-sm font-medium text-admin-text-secondary"><Icon name="mail" className="size-4" /><span className="truncate">{email}</span></span>
        </SettingsRow>
      </SettingsPanel>
    </div>
  );
}
export function SecurityPanel({ hasCustomPassword, hasCustomSecret }: { hasCustomPassword: boolean; hasCustomSecret: boolean }) {
  const checks = [
    { label: "Admin password", detail: "Set ADMIN_PASSWORD for production.", ok: hasCustomPassword },
    { label: "Session secret", detail: "Set ADMIN_SESSION_SECRET to sign admin sessions.", ok: hasCustomSecret },
  ];
  const done = checks.filter((check) => check.ok).length;
  return (
    <div className="space-y-5">
      <SectionHeading title="Security" description="Review the active environment configuration and planned workspace controls." />
      <SettingsPanel className="divide-y divide-admin-border !p-0">
        <div className="px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-admin-text">Production readiness</p>
            <span className="text-sm font-semibold text-admin-text-secondary">{done} of {checks.length} configured</span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={checks.length} aria-valuenow={done} aria-label="Security checks configured" className="mt-3 h-2 overflow-hidden rounded-full bg-admin-surface-muted ring-1 ring-admin-border">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${(done / checks.length) * 100}%` }} />
          </div>
        </div>
        {checks.map((check) => (
          <SettingsRow key={check.label} label={check.label} description={check.detail}>
            <StatusDot tone={check.ok ? "success" : "warning"}>{check.ok ? "Configured" : "Development default"}</StatusDot>
          </SettingsRow>
        ))}
      </SettingsPanel>
    </div>
  );
}
