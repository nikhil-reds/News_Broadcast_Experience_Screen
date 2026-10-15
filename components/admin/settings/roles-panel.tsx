"use client";

import { useState } from "react";
import { permissionGroups, roles, type PreviewUser } from "./settings-data";
import { Icon, SectionHeading, SettingsPanel } from "./settings-primitives";

export function RolesPanel({ users }: { users: PreviewUser[] }) {
  const [selected, setSelected] = useState("Super Admin");
  const role = roles.find((item) => item.name === selected) ?? roles[0];
  const total = permissionGroups.reduce((sum, group) => sum + group.items.length, 0);
  const countFor = (name: string) => users.filter((user) => user.role === name).length;

  return (
    <div className="space-y-5">
      <SectionHeading title="Roles & permissions" description="Explore example role access and the areas each role can use." />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(15rem,.8fr)_minmax(0,1.5fr)]">
        <SettingsPanel className="!p-2">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-admin-text-muted">Roles</p>
          <div className="space-y-1">
            {roles.map((item) => {
              const active = selected === item.name;
              return (
                <button key={item.name} type="button" aria-pressed={active} onClick={() => setSelected(item.name)} className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-admin-focus ${active ? "bg-admin-control-active text-admin-text ring-1 ring-admin-border" : "text-admin-text-secondary hover:bg-admin-surface-muted"}`}>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.name}</span><span className="block truncate text-xs text-admin-text-muted">{item.detail}</span></span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-admin-text-muted" title={`${countFor(item.name)} users`}><Icon name="users" className="size-3.5" />{countFor(item.name)}</span>
                </button>
              );
            })}
          </div>
        </SettingsPanel>
        <SettingsPanel>
          <div className="border-b border-admin-border pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h4 className="text-lg font-bold text-admin-text">{role.name}</h4><p className="mt-1 text-sm text-admin-text-muted">{role.detail}</p></div>
              <span className="rounded-full bg-admin-surface-muted px-3 py-1 text-xs font-semibold text-admin-text-secondary ring-1 ring-admin-border">{role.permissions.length} of {total} permissions</span>
            </div>
            <div aria-hidden="true" className="mt-4 h-1.5 overflow-hidden rounded-full bg-admin-surface-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(role.permissions.length / total) * 100}%` }} />
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {permissionGroups.map((group) => (
              <div key={group.name} className="min-w-0 rounded-xl border border-admin-border-subtle bg-admin-surface-muted/60 p-4">
                <h5 className="text-xs font-bold uppercase tracking-wide text-admin-text-muted">{group.name}</h5>
                <ul className="mt-3 space-y-2.5">
                  {group.items.map((permission) => {
                    const allowed = role.permissions.includes(permission);
                    return (
                      <li key={permission} className="flex items-start gap-2.5 text-sm leading-5">
                        <span aria-hidden="true" className={`mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full ${allowed ? "bg-status-success-bg text-status-success-text" : "bg-admin-surface text-admin-text-muted ring-1 ring-admin-border"}`}>{allowed ? <Icon name="check" className="size-3" /> : <span className="h-px w-2 bg-current" />}</span>
                        <span className={allowed ? "text-admin-text-secondary" : "text-admin-text-muted"}>{permission}</span>
                        <span className="sr-only">{allowed ? "Allowed" : "Not allowed"}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 border-t border-admin-border pt-4 text-xs leading-5 text-admin-text-muted">Permissions shown here are example UI data. They do not control access to the app.</p>
        </SettingsPanel>
      </div>
    </div>
  );
}
