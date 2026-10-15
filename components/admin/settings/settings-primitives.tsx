"use client";

import { useState, type ReactNode } from "react";

const iconPaths = {
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7.4 7.4 0 0 0-2-1.2L14.6 3h-4l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7.4 7.4 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z",
  users: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.7a3.5 3.5 0 0 1 0 6.6",
  shield: "M12 3 5 6v5.5c0 4.2 2.9 7.9 7 9.5 4.1-1.6 7-5.3 7-9.5V6l-7-3Zm-3 9 2.2 2.2L15 10",
  key: "M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Zm-3.5 3.5V21m0-3.5h3m-3-3h2",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 1.5",
  check: "m5 12.5 4.5 4.5L19 7.5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v5m0-8.5v.01",
  copy: "M9 9h10v11H9V9Zm-4 6V4h10",
  search: "m20 20-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z",
  plus: "M12 5v14M5 12h14",
  mail: "M4 6.5h16v11H4v-11Zm0 .5 8 6 8-6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9Z",
  inbox: "M4 13.5 6.5 5h11L20 13.5V19H4v-5.5Zm0 0h4.5a3.5 3.5 0 0 0 7 0H20",
} as const;

export type IconName = keyof typeof iconPaths;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d={iconPaths[name]} />
    </svg>
  );
}

export function SectionHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-xl font-bold tracking-tight text-admin-text sm:text-2xl">{title}</h3>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-admin-text-muted">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SettingsPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl border border-admin-border bg-admin-surface p-4 shadow-sm sm:p-6 ${className}`}>{children}</section>;
}

export function SettingsRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-6">
      <div className="min-w-0 sm:max-w-md">
        <p className="text-sm font-semibold text-admin-text">{label}</p>
        {description ? <p className="mt-1 text-sm leading-5 text-admin-text-muted">{description}</p> : null}
      </div>
      <div className="min-w-0 sm:text-right">{children}</div>
    </div>
  );
}

const dotTones = {
  success: "bg-status-success-bg text-status-success-text border-status-success-border",
  warning: "bg-status-warning-bg text-status-warning-text border-status-warning-border",
  danger: "bg-status-danger-bg text-status-danger-text border-status-danger-border",
  info: "bg-status-info-bg text-status-info-text border-status-info-border",
  neutral: "bg-status-neutral-bg text-status-neutral-text border-status-neutral-border",
} as const;

export type Tone = keyof typeof dotTones;

export function StatusDot({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${dotTones[tone]}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function ProgressRing({ value, max, size = 56 }: { value: number; max: number; size?: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const fraction = max ? value / max : 0;
  return (
    <svg aria-hidden="true" viewBox="0 0 56 56" width={size} height={size} className="size-full -rotate-90">
      <circle cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="5" />
      <circle cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none" />
    </svg>
  );
}

const tileTones = {
  accent: "text-admin-accent from-admin-accent/15",
  success: "text-status-success-text from-status-success-text/15",
  warning: "text-status-warning-text from-status-warning-text/15",
} as const;

export function StatTile({ label, value, detail, icon, tone = "accent", ring }: { label: string; value: string; detail: string; icon: IconName; tone?: keyof typeof tileTones; ring?: { value: number; max: number } }) {
  return (
    <div className={`relative flex min-w-0 items-center gap-4 overflow-hidden rounded-2xl border border-admin-border bg-gradient-to-br ${tileTones[tone]} to-admin-surface to-60% p-3 shadow-sm sm:p-5`}>
      <div className="relative grid size-11 shrink-0 place-items-center sm:size-14">
        {ring ? <span className="absolute inset-0"><ProgressRing value={ring.value} max={ring.max} /></span> : <span className="absolute inset-1 rounded-xl bg-current opacity-10" />}
        <Icon name={icon} className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-admin-text-muted">{label}</p>
        <p className="mt-0.5 truncate text-2xl font-bold leading-tight text-admin-text">{value}</p>
        <p className="truncate text-xs text-admin-text-muted sm:text-sm">{detail}</p>
      </div>
    </div>
  );
}

export function ToggleRow({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-5 sm:px-6">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-admin-text">{label}</p>
        <p className="mt-1 text-sm leading-5 text-admin-text-muted">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-xs font-semibold text-admin-text-muted sm:inline">Coming soon</span>
        <span role="switch" aria-checked="false" aria-disabled="true" aria-label={`${label} (coming soon)`} className="relative h-6 w-11 rounded-full border border-admin-border bg-admin-surface-muted opacity-70">
          <span className="absolute left-0.5 top-0.5 size-4.5 rounded-full bg-admin-text-muted shadow-sm" />
        </span>
      </div>
    </div>
  );
}

export function CodeBlock({ title, lines }: { title: string; lines: string[] }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="overflow-hidden rounded-xl border border-admin-border bg-admin-surface-muted">
      <div className="flex items-center justify-between gap-3 border-b border-admin-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="flex gap-1.5"><i className="size-2.5 rounded-full bg-status-danger-text/60" /><i className="size-2.5 rounded-full bg-status-warning-text/60" /><i className="size-2.5 rounded-full bg-status-success-text/60" /></span>
          <span className="ml-1 font-mono text-xs text-admin-text-muted">{title}</span>
        </div>
        <button type="button" onClick={copy} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-admin-text-secondary transition-colors hover:bg-admin-control-active focus-visible:outline-2 focus-visible:outline-admin-focus">
          <Icon name={copied ? "check" : "copy"} className="size-4" />
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-admin-text-secondary sm:text-sm">
        {lines.map((line) => {
          const [key, ...rest] = line.split("=");
          return <code key={line} className="block"><span className="text-admin-accent">{key}</span><span className="text-admin-text-muted">=</span>{rest.join("=")}</code>;
        })}
      </pre>
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon: IconName; title: string; description: string }) {
  return (
    <div className="px-5 py-14 text-center sm:py-20">
      <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-admin-accent/15 to-admin-surface-muted text-admin-accent ring-1 ring-admin-border"><Icon name={icon} className="size-7" /></div>
      <h4 className="mt-5 font-semibold text-admin-text">{title}</h4>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-admin-text-muted">{description}</p>
    </div>
  );
}

const avatarGradients = ["from-sky-500 to-indigo-500", "from-emerald-500 to-teal-500", "from-amber-500 to-rose-500", "from-fuchsia-500 to-violet-500"];

export function Avatar({ name, className = "size-10" }: { name: string; className?: string }) {
  const initials = name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const gradient = avatarGradients[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarGradients.length];
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${gradient} text-xs font-bold text-white shadow-sm ${className}`}>{initials}</span>;
}
