"use client";

import { Avatar, Icon, type IconName } from "./settings-primitives";

export type Section = "General" | "Users" | "Roles & Permissions" | "Security" | "Activity Log";

type SectionMeta = { id: Section; icon: IconName; hint: string };

const groups: { label: string; items: SectionMeta[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "General", icon: "settings", hint: "Account basics" },
      { id: "Users", icon: "users", hint: "Team access" },
      { id: "Roles & Permissions", icon: "key", hint: "What each role can do" },
    ],
  },
  {
    label: "Protection",
    items: [
      { id: "Security", icon: "shield", hint: "Environment checks" },
      { id: "Activity Log", icon: "clock", hint: "Audit trail" },
    ],
  },
];

export function SettingsNav({ section, onSelect, counts, email }: { section: Section; onSelect: (section: Section) => void; counts: Partial<Record<Section, number>>; email: string }) {
  return (
    <nav aria-label="Settings sections" className="min-w-0 lg:self-stretch">
      <div className="flex h-full flex-col rounded-2xl border border-admin-border bg-gradient-to-b from-admin-surface to-admin-surface-muted p-3 shadow-sm lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)] lg:min-h-[28rem]">
        <div className="flex-1 space-y-5 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-admin-text-muted">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => onSelect(item.id)}
                      className={`relative flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-focus ${
                        active ? "bg-admin-control-active text-admin-text shadow-sm ring-1 ring-admin-border" : "text-admin-text-muted hover:bg-admin-surface-muted hover:text-admin-text"
                      }`}
                    >
                      <span aria-hidden="true" className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-admin-accent transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${active ? "bg-admin-accent/15 text-admin-accent" : "bg-admin-surface-muted text-admin-text-muted"}`}>
                        <Icon name={item.icon} className="size-[1.05rem]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.id}</span>
                        <span className="block truncate text-xs font-normal text-admin-text-muted">{item.hint}</span>
                      </span>
                      {counts[item.id] !== undefined ? <span className="rounded-full bg-admin-surface px-2 py-0.5 text-xs font-semibold text-admin-text-secondary ring-1 ring-admin-border">{counts[item.id]}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-admin-border px-2 pt-4">
          <Avatar name={email.split("@")[0].replace(/[._-]/g, " ")} className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-admin-text" title={email}>{email}</p>
            <p className="text-xs text-admin-text-muted">Signed in</p>
          </div>
        </div>
      </div>
    </nav>
  );
}
