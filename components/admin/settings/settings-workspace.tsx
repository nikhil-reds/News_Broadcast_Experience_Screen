"use client";

import { useState } from "react";
import { GeneralPanel, SecurityPanel } from "./account-panels";
import { SettingsNav, type Section } from "./settings-nav";
import { Icon, StatTile } from "./settings-primitives";
import { UsersPanel } from "./users-panel";
import type { RealAdminUser } from "./users-panel";

export function SettingsWorkspace({
  email,
  initialUsers,
  hasCustomPassword,
  hasCustomSecret,
}: {
  email: string;
  initialUsers: RealAdminUser[];
  hasCustomPassword: boolean;
  hasCustomSecret: boolean;
}) {
  const [section, setSection] = useState<Section>("Users");
  const securityDone = Number(hasCustomPassword) + Number(hasCustomSecret);

  return (
    <div className="mx-auto w-full max-w-[110rem] min-w-0 space-y-6 pb-10 sm:space-y-8">
      <header className="relative overflow-hidden rounded-3xl border border-admin-border bg-admin-surface p-5 shadow-sm sm:p-8">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="admin-title">Settings</h1>
            <p className="admin-page-description mt-2 max-w-xl text-sm leading-6 text-admin-text-muted sm:text-base">Workspace access, roles, and security.</p>
          </div>
          <p className="flex w-fit items-start gap-2 rounded-xl border border-status-info-border bg-status-info-bg px-3.5 py-2.5 text-xs leading-5 text-status-info-text sm:max-w-xs">
            <Icon name="info" className="mt-0.5 size-4" />
            <span><strong className="font-semibold">Environment managed.</strong> Account and security values come from the running server configuration.</span>
          </p>
        </div>
        <div className="relative mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
          <StatTile label="Administrators" value={String(initialUsers.length)} detail="Active accounts" icon="users" tone="accent" />
          <StatTile label="Security" value={`${securityDone} of 2`} detail="Checks passed" icon="shield" tone={securityDone === 2 ? "success" : "warning"} ring={{ value: securityDone, max: 2 }} />
        </div>
      </header>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[16.5rem_minmax(0,1fr)] xl:gap-8">
        <SettingsNav email={email} section={section} onSelect={setSection} counts={{ Users: initialUsers.length }} />
        <div key={section} className="settings-fade min-w-0">
          {section === "General" && <GeneralPanel email={email} />}
          {section === "Users" && <UsersPanel initialUsers={initialUsers} />}
          {section === "Security" && <SecurityPanel hasCustomPassword={hasCustomPassword} hasCustomSecret={hasCustomSecret} />}
        </div>
      </div>
    </div>
  );
}
