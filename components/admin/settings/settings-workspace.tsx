"use client";

import { useState } from "react";
import { ActivityPanel, GeneralPanel, SecurityPanel } from "./account-panels";
import { initialUsers, roles } from "./settings-data";
import { SettingsNav, type Section } from "./settings-nav";
import { Icon, StatTile } from "./settings-primitives";
import { RolesPanel } from "./roles-panel";
import { UsersPanel } from "./users-panel";

export function SettingsWorkspace({
  email,
  hasCustomPassword,
  hasCustomSecret,
}: {
  email: string;
  hasCustomPassword: boolean;
  hasCustomSecret: boolean;
}) {
  const [section, setSection] = useState<Section>("Users");
  const [users, setUsers] = useState(initialUsers);
  const securityDone = Number(hasCustomPassword) + Number(hasCustomSecret);
  const activeUsers = users.filter((user) => user.status === "Active").length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-10 sm:space-y-8">
      <header className="relative overflow-hidden rounded-3xl border border-admin-border bg-admin-surface p-5 shadow-sm sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-admin-accent/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-status-success-text/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-3xl font-bold tracking-tight text-admin-text sm:text-4xl">Settings</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-admin-text-muted sm:text-base">Manage workspace access, review roles, and keep your security configuration in shape.</p>
          </div>
          <p className="flex w-fit items-start gap-2 rounded-xl border border-status-info-border bg-status-info-bg px-3.5 py-2.5 text-xs leading-5 text-status-info-text sm:max-w-xs">
            <Icon name="info" className="mt-0.5 size-4" />
            <span><strong className="font-semibold">Interface preview.</strong> Users, roles, and controls here are local examples.</span>
          </p>
        </div>
        <div className="relative mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
          <StatTile label="Team members" value={String(users.length)} detail={`${activeUsers} active now`} icon="users" tone="accent" />
          <StatTile label="Roles" value={String(roles.length)} detail="Example access profiles" icon="key" tone="success" />
          <StatTile label="Security" value={`${securityDone} of 2`} detail="Checks passed" icon="shield" tone={securityDone === 2 ? "success" : "warning"} ring={{ value: securityDone, max: 2 }} />
        </div>
      </header>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-8">
        <SettingsNav email={email} section={section} onSelect={setSection} counts={{ Users: users.length, "Roles & Permissions": roles.length }} />
        <div key={section} className="settings-fade min-w-0">
          {section === "General" && <GeneralPanel email={email} />}
          {section === "Users" && <UsersPanel users={users} onAddUser={(user) => setUsers((current) => [...current, { ...user, status: "Pending", lastActive: "Not active" }])} />}
          {section === "Roles & Permissions" && <RolesPanel users={users} />}
          {section === "Security" && <SecurityPanel hasCustomPassword={hasCustomPassword} hasCustomSecret={hasCustomSecret} />}
          {section === "Activity Log" && <ActivityPanel />}
        </div>
      </div>
    </div>
  );
}
