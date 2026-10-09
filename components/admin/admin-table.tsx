"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AdminDetailModal, type AdminDetailField } from "@/components/admin/admin-detail-modal";

type SortDirection = "asc" | "desc";

export function AdminTable({ headers, children, empty }: { headers: string[]; children: ReactNode; empty?: boolean }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const originalRows = useRef<HTMLTableRowElement[]>([]);
  const [query, setQuery] = useState("");
  const [sortIndex, setSortIndex] = useState(0);
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [groupIndex, setGroupIndex] = useState(-1);
  const [selectedDetails, setSelectedDetails] = useState<AdminDetailField[] | null>(null);

  useEffect(() => {
    const body = tableRef.current?.tBodies[0];
    if (!body) return;
    if (!originalRows.current.length) originalRows.current = Array.from(body.rows).filter((row) => !row.classList.contains("admin-group-row"));
    originalRows.current.forEach((row) => {
      row.querySelector(".admin-row-action")?.parentElement?.remove();
      const actionCell = document.createElement("td");
      actionCell.className = "whitespace-nowrap px-4 py-3 text-right";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-row-action inline-flex rounded-md p-2 text-admin-text-muted transition hover:bg-admin-table-selected hover:text-admin-accent focus-visible:outline-2 focus-visible:outline-admin-focus";
      button.setAttribute("aria-label", "View record details");
      button.title = "View details";
      button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
      actionCell.appendChild(button);
      row.appendChild(actionCell);
    });
    body.querySelectorAll(".admin-group-row").forEach((row) => row.remove());
    const rows = originalRows.current.filter((row) => row.textContent?.toLowerCase().includes(query.trim().toLowerCase()));
    rows.sort((a, b) => {
      const left = a.cells[sortIndex]?.textContent?.trim() ?? "";
      const right = b.cells[sortIndex]?.textContent?.trim() ?? "";
      const result = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
      return direction === "asc" ? result : -result;
    });
    if (groupIndex < 0) rows.forEach((row) => body.appendChild(row));
    else {
      const groups = new Map<string, HTMLTableRowElement[]>();
      rows.forEach((row) => { const key = row.cells[groupIndex]?.textContent?.trim() || "Uncategorized"; groups.set(key, [...(groups.get(key) ?? []), row]); });
      groups.forEach((groupRows, label) => {
        const groupRow = document.createElement("tr"); groupRow.className = "admin-group-row bg-admin-table-selected";
        const cell = document.createElement("td"); cell.colSpan = headers.length + 1; cell.className = "px-4 py-2 text-xs font-bold uppercase tracking-wide text-admin-accent"; cell.textContent = `${label} · ${groupRows.length}`;
        groupRow.appendChild(cell); body.appendChild(groupRow); groupRows.forEach((row) => body.appendChild(row));
      });
    }
  }, [direction, groupIndex, headers.length, query, sortIndex]);

  useEffect(() => {
    const body = tableRef.current?.tBodies[0];
    if (!body) return;
    const onAction = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".admin-row-action")) return;
      const row = target.closest("tr");
      if (!row) return;
      setSelectedDetails(headers.map((header, index) => ({ label: header, value: row.cells[index]?.textContent?.trim() || "—" })));
    };
    body.addEventListener("click", onAction);
    return () => body.removeEventListener("click", onAction);
  }, [headers]);

  return <div className="overflow-hidden rounded-xl border border-admin-border bg-admin-surface shadow-sm">
    <div className="flex flex-wrap items-center gap-2 border-b border-admin-border bg-admin-surface-muted p-3">
      <label className="sr-only" htmlFor="admin-table-search">Filter table</label>
      <input id="admin-table-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter records…" className="min-w-48 flex-1 rounded-md border border-admin-input bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none placeholder:text-admin-text-muted focus:border-admin-focus focus:ring-2 focus:ring-admin-focus/20" />
      <label className="sr-only" htmlFor="admin-table-sort">Sort by</label>
      <select id="admin-table-sort" value={sortIndex} onChange={(event) => setSortIndex(Number(event.target.value))} className="rounded-md border border-admin-input bg-admin-surface px-3 py-2 text-sm text-admin-text">{headers.map((header, index) => <option key={header} value={index}>Sort: {header}</option>)}</select>
      <button type="button" onClick={() => setDirection((value) => value === "asc" ? "desc" : "asc")} className="rounded-md border border-admin-input px-3 py-2 text-sm font-semibold text-admin-text-secondary transition hover:bg-admin-table-hover hover:text-admin-text" aria-label="Toggle sort direction">{direction === "asc" ? "↑ Asc" : "↓ Desc"}</button>
      <label className="sr-only" htmlFor="admin-table-group">Group by</label>
      <select id="admin-table-group" value={groupIndex} onChange={(event) => setGroupIndex(Number(event.target.value))} className="rounded-md border border-admin-input bg-admin-surface px-3 py-2 text-sm text-admin-text"><option value={-1}>No grouping</option>{headers.map((header, index) => <option key={header} value={index}>Group: {header}</option>)}</select>
    </div>
    <div className="admin-table-scroll max-h-[clamp(24rem,62vh,48rem)] overflow-auto"><table ref={tableRef} className="min-w-full divide-y divide-admin-border text-sm"><thead className="sticky top-0 z-10 bg-admin-surface-muted shadow-[0_1px_0_var(--admin-border)]"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.08em] text-admin-text-muted">{header}</th>)}<th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.08em] text-admin-text-muted">Actions</th></tr></thead><tbody className="divide-y divide-admin-border-subtle [&>tr:not(.admin-group-row)]:transition-colors [&>tr:not(.admin-group-row)]:hover:bg-admin-table-hover [&>tr:focus-within]:bg-admin-table-hover">{children}</tbody></table></div>
    {empty ? <div className="px-4 py-10 text-center text-sm text-admin-text-muted">No records found.</div> : null}
    {selectedDetails ? <AdminDetailModal title="Record details" fields={selectedDetails} onClose={() => setSelectedDetails(null)} /> : null}
  </div>;
}

export function Td({ children }: { children: ReactNode }) { return <td className="whitespace-nowrap px-4 py-3 text-admin-text-secondary">{children}</td>; }

export function AdminTableSkeleton({ columns = 6, rows = 8 }: { columns?: number; rows?: number }) { return <div role="status" aria-live="polite" aria-busy="true" className="overflow-hidden rounded-xl border border-admin-border bg-admin-surface shadow-sm"><div className="grid gap-px bg-admin-border-subtle p-3">{Array.from({ length: rows }, (_, row) => <div key={row} className="grid gap-4 rounded-md bg-admin-surface px-2 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: columns }, (_, column) => <div key={column} className="h-4 animate-pulse rounded bg-admin-border" />)}</div>)}</div><span className="sr-only">Loading table data</span></div>; }
