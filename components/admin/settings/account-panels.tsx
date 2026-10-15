import { Avatar, CodeBlock, EmptyState, Icon, SectionHeading, SettingsPanel, SettingsRow, StatusDot, ToggleRow } from "./settings-primitives";

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
      <SettingsPanel>
        <h4 className="font-semibold text-admin-text">Recommended environment</h4>
        <p className="mb-4 mt-1 text-sm text-admin-text-muted">Example variable names. Values below are placeholders.</p>
        <CodeBlock title=".env.local" lines={["ADMIN_EMAIL=admin@example.com", "ADMIN_PASSWORD=replace-with-a-strong-password", "ADMIN_SESSION_SECRET=replace-with-a-long-random-secret"]} />
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
      <SettingsPanel className="divide-y divide-admin-border !p-0">
        <div className="px-4 py-5 sm:px-6">
          <h4 className="font-semibold text-admin-text">Planned controls</h4>
          <p className="mt-1 text-sm text-admin-text-muted">These settings are a preview and cannot be changed here yet.</p>
        </div>
        <ToggleRow label="Two-factor authentication" description="Require a second verification step for privileged roles." />
        <ToggleRow label="Password change on invitation" description="Prompt new users to create a password at first sign-in." />
        <ToggleRow label="Role change notifications" description="Notify administrators when access changes." />
      </SettingsPanel>
    </div>
  );
}

export function ActivityPanel() {
  return (
    <div className="space-y-5">
      <SectionHeading title="Activity log" description="A record of user invitations, role changes, and security events will appear here." />
      <SettingsPanel className="!p-0">
        <EmptyState icon="inbox" title="No activity records yet" description="Activity history will be available when user management is connected to the backend." />
      </SettingsPanel>
    </div>
  );
}
