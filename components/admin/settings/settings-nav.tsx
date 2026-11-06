"use client";

import { Avatar, Icon, type IconName } from "./settings-primitives";

export type Section = "General" | "Users" | "Security";

type SectionMeta = { id: Section; icon: IconName; hint: string };

const groups: { label: string; items: SectionMeta[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "General", icon: "settings", hint: "Account basics" },
      { id: "Users", icon: "users", hint: "Team access" },
    ],
  },
  {
    label: "Protection",
    items: [
      { id: "Security", icon: "shield", hint: "Environment checks" },
    ],
  },
];

export function SettingsNav({ section, onSelect, counts, email }: { section: Section; onSelect: (section: Section) => void; counts: Partial<Record<Section, number>>; email: string }) {
  return (
    <nav aria-label="Settings sections" className="min-w-0 xl:self-stretch">
      <div className="flex h-full min-w-0 flex-col rounded-2xl border border-admin-border bg-gradient-to-b from-admin-surface to-admin-surface-muted p-2 shadow-sm sm:p-3 xl:sticky xl:top-20 xl:h-[calc(100dvh-7rem)] xl:min-h-[28rem]">
        <div className="settings-nav-scroll flex min-w-0 gap-2 overflow-x-auto xl:block xl:flex-1 xl:space-y-5 xl:overflow-y-auto">
          {groups.map((group) => (
            <div key={group.label} className="contents xl:block">
              <p className="hidden px-3 pb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-admin-text-muted xl:block">{group.label}</p>
              <div className="flex gap-2 xl:block xl:space-y-1">
                {group.items.map((item) => {
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => onSelect(item.id)}
                      className={`relative flex min-h-12 w-auto shrink-0 items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-focus xl:w-full xl:gap-3 xl:px-3.5 ${
                        active ? "bg-admin-control-active text-admin-text shadow-sm ring-1 ring-admin-border" : "text-admin-text-muted hover:bg-admin-surface-muted hover:text-admin-text"
                      }`}
                    >
                      <span aria-hidden="true" className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-admin-accent transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${active ? "bg-admin-accent/15 text-admin-accent" : "bg-admin-surface-muted text-admin-text-muted"}`}>
                        <Icon name={item.icon} className="size-[1.05rem]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block whitespace-nowrap xl:truncate">{item.id}</span>
                        <span className="hidden truncate text-xs font-normal text-admin-text-muted xl:block">{item.hint}</span>
                      </span>
                      {counts[item.id] !== undefined ? <span className="rounded-full bg-admin-surface px-2 py-0.5 text-xs font-semibold text-admin-text-secondary ring-1 ring-admin-border">{counts[item.id]}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 hidden items-center gap-3 border-t border-admin-border px-2 pt-4 xl:flex">
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
