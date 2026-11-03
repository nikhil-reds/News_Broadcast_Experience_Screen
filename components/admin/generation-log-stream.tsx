"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LogEntry = {
  id: string;
  timestamp: string;
  level: "error" | "warning" | "success" | "info";
  stream: "stdout" | "stderr";
  source: string;
  message: string;
};

type LogResponse = {
  checkedAt: string;
  fileUpdatedAt: string | null;
  fileAvailable: boolean;
  pollAfterMs: number;
  sources: string[];
  logs: LogEntry[];
  summary: { total: number; errors: number; warnings: number; sources: number };
};

const ranges = ["1m", "5m", "15m", "1h", "6h", "24h", "all"] as const;
const levels = ["all", "error", "warning", "success", "info"] as const;
const emptyData: LogResponse = { checkedAt: "", fileUpdatedAt: null, fileAvailable: false, pollAfterMs: 2_000, sources: [], logs: [], summary: { total: 0, errors: 0, warnings: 0, sources: 0 } };

const levelStyles = {
  error: { dot: "bg-rose-400", label: "text-rose-300", border: "border-l-rose-500/70" },
  success: { dot: "bg-emerald-400", label: "text-emerald-300", border: "border-l-emerald-500/70" },
  warning: { dot: "bg-amber-400", label: "text-amber-300", border: "border-l-amber-500/70" },
  info: { dot: "bg-sky-400", label: "text-sky-300", border: "border-l-sky-500/70" },
} as const;

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}

export function GenerationLogStream({
  initialLevel = "all",
  initialRange = "1h",
  initialSource = "all",
  initialQuery = "",
}: {
  initialLevel?: string;
  initialRange?: string;
  initialSource?: string;
  initialQuery?: string;
}) {
  const [range, setRange] = useState<(typeof ranges)[number]>(ranges.includes(initialRange as (typeof ranges)[number]) ? initialRange as (typeof ranges)[number] : "1h");
  const [level, setLevel] = useState(levels.includes(initialLevel as (typeof levels)[number]) ? initialLevel : "all");
  const [source, setSource] = useState(initialSource);
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [query, setQuery] = useState(initialQuery);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<LogResponse>(emptyData);

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ range, level, source, sort });
    if (query.trim()) params.set("query", query.trim());
    return `/api/admin/generation-logs?${params}`;
  }, [level, query, range, sort, source]);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const contentType = response.headers.get("content-type") || "";
      if (response.redirected && response.url.includes("/signin")) {
        window.location.assign("/signin");
        return;
      }
      if (!response.ok) throw new Error(`Log request failed (${response.status})`);
      if (!contentType.includes("application/json")) throw new Error("Worker log service returned an unexpected response");
      setData(await response.json());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load worker logs");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void refresh(true);
    if (!live) return;
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [live, refresh]);

  const availableSources = data.sources.includes(source) || source === "all" ? data.sources : [source, ...data.sources];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-admin-border bg-admin-surface/75 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-admin-text-muted">Time window</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Log time window">
              {ranges.map((value) => (
                <button key={value} type="button" onClick={() => setRange(value)} aria-pressed={range === value} className={`min-h-9 rounded-full border px-3 text-xs font-medium transition ${range === value ? "border-admin-primary bg-admin-primary text-admin-on-primary" : "border-admin-border text-admin-text-secondary hover:bg-admin-table-hover"}`}>
                  {value === "all" ? "All" : value}
                </button>
              ))}
            </div>
          </div>

          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_9rem_10rem_10rem_auto] 2xl:w-[60rem]">
            <label className="min-w-0 sm:col-span-2 xl:col-span-1">
              <span className="sr-only">Search worker logs</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search source or log message" className="min-h-10 w-full rounded-full border border-admin-input bg-admin-surface px-4 text-sm text-admin-text outline-none placeholder:text-admin-text-muted focus:border-admin-focus focus:ring-2 focus:ring-admin-focus/20" />
            </label>
            <label>
              <span className="sr-only">Filter log level</span>
              <select value={level} onChange={(event) => setLevel(event.target.value)} className="min-h-10 w-full rounded-full border border-admin-input bg-admin-surface px-3 text-sm capitalize text-admin-text outline-none focus:border-admin-focus">
                {levels.map((value) => <option key={value} value={value}>{value === "all" ? "All levels" : value}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter worker source</span>
              <select value={source} onChange={(event) => setSource(event.target.value)} className="min-h-10 w-full rounded-full border border-admin-input bg-admin-surface px-3 text-sm capitalize text-admin-text outline-none focus:border-admin-focus">
                <option value="all">All workers</option>
                {availableSources.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Sort worker logs</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as "desc" | "asc")} className="min-h-10 w-full rounded-full border border-admin-input bg-admin-surface px-3 text-sm text-admin-text outline-none focus:border-admin-focus">
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </label>
            <button type="button" onClick={() => setLive((value) => !value)} aria-pressed={live} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition ${live ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300" : "border-admin-border text-admin-text-secondary hover:bg-admin-table-hover"}`}>
              <i className={`size-2 rounded-full ${live ? "animate-pulse bg-emerald-400" : "bg-admin-text-muted"}`} aria-hidden="true" />
              {live ? "Live" : "Paused"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Visible worker log summary">
        {[
          ["Visible lines", data.summary.total, "text-admin-text"],
          ["Errors", data.summary.errors, "text-rose-300"],
          ["Warnings", data.summary.warnings, "text-amber-300"],
          ["Worker sources", data.summary.sources, "text-sky-300"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-xl border border-admin-border bg-admin-surface/70 px-4 py-3">
            <p className="text-xs text-admin-text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-thin ${tone}`}>{value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-admin-border bg-[#08080c]/90 shadow-2xl" aria-label="Real-time worker logs">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-admin-border bg-admin-surface-muted/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-rose-400/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-2 font-mono text-xs text-admin-text-muted">npm run worker:all · worker-all.log</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-admin-text-muted">
            <span className={`inline-flex items-center gap-1.5 ${data.fileAvailable ? "text-emerald-300" : "text-amber-300"}`}><i className={`size-1.5 rounded-full ${data.fileAvailable ? "bg-emerald-400" : "bg-amber-400"}`} />{data.fileAvailable ? "Capture active" : "Waiting for output"}</span>
            {loading ? <span>Refreshing…</span> : data.checkedAt ? <span>Updated {formatTimestamp(data.checkedAt)}</span> : null}
            <button type="button" onClick={() => void refresh(true)} className="rounded-full border border-admin-border px-3 py-1.5 text-admin-text-secondary hover:bg-admin-table-hover">Refresh</button>
          </div>
        </header>

        {error ? <div role="alert" className="border-b border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger-text">{error}</div> : null}

        <div role="log" aria-live="polite" aria-relevant="additions text" className="max-h-[calc(100dvh-22rem)] min-h-[24rem] overflow-y-auto overscroll-contain">
          {!loading && data.logs.length === 0 ? (
            <div className="grid min-h-[24rem] place-items-center px-6 text-center">
              <div>
                <p className="text-base font-semibold text-admin-text">No worker output in this view</p>
                <p className="mt-1 text-sm text-admin-text-muted">Choose a longer time window, select another worker, or clear the filters.</p>
              </div>
            </div>
          ) : null}

          <div className="divide-y divide-white/[.06]">
            {data.logs.map((log) => {
              const style = levelStyles[log.level];
              return (
                <article key={log.id} className={`grid min-w-0 gap-2 border-l-2 px-3 py-3 font-mono text-xs transition hover:bg-white/[.035] sm:grid-cols-[5.5rem_7rem_minmax(0,1fr)_auto] sm:items-start sm:gap-4 sm:px-4 ${style.border}`}>
                  <time dateTime={log.timestamp} className="text-admin-text-muted">{formatTimestamp(log.timestamp)}</time>
                  <span className="truncate font-semibold text-admin-text" title={log.source}>[{log.source}]</span>
                  <p className="min-w-0 whitespace-pre-wrap break-words leading-5 text-admin-text-secondary">{log.message}</p>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full bg-white/[.05] px-2.5 py-1 text-[11px] ${style.label}`}>
                    <i className={`size-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
                    {log.stream}
                  </span>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
