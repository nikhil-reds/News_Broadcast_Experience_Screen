import Link from "next/link";
import { AddConsentButton, ConsentsTable, type ConsentRecord } from "@/components/admin/consents/consent-admin";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CONSENT_STATUSES, CONSENT_TYPES, formatConsentLabel, type ConsentStatus, type ConsentType } from "@/lib/consent";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 25;
type SearchParams = Promise<{ status?: string; type?: string; page?: string }>;

function pageHref(page: number, status?: string, type?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/admin/consents${query ? `?${query}` : ""}`;
}

export default async function AdminConsentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = CONSENT_STATUSES.includes(params.status as ConsentStatus) ? params.status as ConsentStatus : undefined;
  const type = CONSENT_TYPES.includes(params.type as ConsentType) ? params.type as ConsentType : undefined;
  const requestedPage = Number(params.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where = { ...(status ? { status } : {}), ...(type ? { consentType: type } : {}) };
  const [initialRows, total] = await prisma.$transaction([
    prisma.consent.findMany({ where, include: { events: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.consent.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = safePage === page ? initialRows : await prisma.consent.findMany({ where, include: { events: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" }, skip: (safePage - 1) * PAGE_SIZE, take: PAGE_SIZE });
  const records: ConsentRecord[] = rows.map((row) => ({
    ...row,
    grantedAt: row.grantedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    events: row.events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  }));

  return <div className="admin-responsive-page mx-auto w-full max-w-[110rem] space-y-4">
    <AdminPageHeader title="Consents" description="Track participant consent, permitted usage, and status history." actions={<AddConsentButton />} />
    <div className="admin-filter-groups grid gap-2">
      <nav className="admin-filters" aria-label="Filter consents by status">{[undefined, ...CONSENT_STATUSES].map((value) => <Link key={value ?? "all"} aria-current={status === value ? "page" : undefined} href={pageHref(1, value, type)}>{value ? formatConsentLabel(value) : "All statuses"}</Link>)}</nav>
      <nav className="admin-filters" aria-label="Filter consents by type">{[undefined, ...CONSENT_TYPES].map((value) => <Link key={value ?? "any"} aria-current={type === value ? "page" : undefined} href={pageHref(1, status, value)}>{value ? formatConsentLabel(value) : "Any type"}</Link>)}</nav>
    </div>
    <ConsentsTable records={records} />
    {totalPages > 1 ? <nav aria-label="Consent pagination" className="admin-pagination flex items-center justify-between gap-3 text-sm text-admin-text-muted"><span>Page {safePage} of {totalPages} · {total} records</span><div className="flex gap-2">{safePage > 1 ? <Link className="rounded-full border border-admin-input px-4 py-2 font-semibold text-admin-text hover:bg-admin-table-hover" href={pageHref(safePage - 1, status, type)}>Previous</Link> : null}{safePage < totalPages ? <Link className="rounded-full border border-admin-input px-4 py-2 font-semibold text-admin-text hover:bg-admin-table-hover" href={pageHref(safePage + 1, status, type)}>Next</Link> : null}</div></nav> : null}
  </div>;
}
