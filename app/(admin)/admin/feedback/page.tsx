import Link from "next/link";
import { AddFeedbackButton } from "@/components/admin/feedback/add-feedback-modal";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin-format";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, formatFeedbackLabel, type FeedbackCategory, type FeedbackStatus } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 25;

type FeedbackSearchParams = Promise<{ status?: string; category?: string; page?: string }>;

function pageHref(page: number, status?: string, category?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (category) params.set("category", category);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/admin/feedback${query ? `?${query}` : ""}`;
}

export default async function AdminFeedbackPage({ searchParams }: { searchParams: FeedbackSearchParams }) {
  const params = await searchParams;
  const status = FEEDBACK_STATUSES.includes(params.status as FeedbackStatus) ? params.status as FeedbackStatus : undefined;
  const category = FEEDBACK_CATEGORIES.includes(params.category as FeedbackCategory) ? params.category as FeedbackCategory : undefined;
  const requestedPage = Number(params.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where = { ...(status ? { status } : {}), ...(category ? { category } : {}) };
  const [feedback, total] = await prisma.$transaction([
    prisma.feedback.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.feedback.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = safePage === page ? feedback : await prisma.feedback.findMany({ where, orderBy: { createdAt: "desc" }, skip: (safePage - 1) * PAGE_SIZE, take: PAGE_SIZE });
  const details = Object.fromEntries(rows.map((item) => [item.id, [
    { label: "Name", value: item.name },
    { label: "Email", value: item.email ?? "—" },
    { label: "Category", value: formatFeedbackLabel(item.category) },
    { label: "Rating", value: item.rating ? `${item.rating} / 5` : "Not rated" },
    { label: "Status", value: formatFeedbackLabel(item.status) },
    { label: "Feedback", value: item.message },
    { label: "Submitted by", value: item.submittedBy ?? "—" },
    { label: "Created", value: formatDate(item.createdAt) },
    { label: "Updated", value: formatDate(item.updatedAt) },
    { label: "Record ID", value: item.id },
  ]]));

  return <div className="admin-responsive-page mx-auto w-full max-w-[110rem] space-y-4">
    <AdminPageHeader title="Feedback" description="Review product and broadcast feedback from the team." actions={<AddFeedbackButton />} />

    <div className="admin-filter-groups grid gap-2">
      <nav className="admin-filters" aria-label="Filter feedback by status">
        {[undefined, ...FEEDBACK_STATUSES].map((value) => <Link key={value ?? "all"} aria-current={status === value ? "page" : undefined} href={pageHref(1, value, category)}>{value ?? "All statuses"}</Link>)}
      </nav>
      <nav className="admin-filters" aria-label="Filter feedback by category">
        {[undefined, ...FEEDBACK_CATEGORIES].map((value) => <Link key={value ?? "all"} aria-current={category === value ? "page" : undefined} href={pageHref(1, status, value)}>{value ? formatFeedbackLabel(value) : "All categories"}</Link>)}
      </nav>
    </div>

    <AdminTable headers={["Name", "Email", "Category", "Rating", "Feedback", "Status", "Created"]} empty={rows.length === 0} rowDetails={details} detailTitle="Feedback details">
      {rows.map((item) => <tr key={item.id} data-detail-key={item.id}>
        <Td label="Name"><span className="font-semibold text-admin-text">{item.name}</span></Td>
        <Td label="Email">{item.email ?? "—"}</Td>
        <Td label="Category">{formatFeedbackLabel(item.category)}</Td>
        <Td label="Rating">{item.rating ? `${item.rating} / 5` : "—"}</Td>
        <Td label="Feedback"><span className="block max-w-80 truncate max-[1199px]:line-clamp-2 max-[1199px]:max-w-none max-[1199px]:whitespace-normal" title={item.message}>{item.message}</span></Td>
        <Td label="Status"><StatusBadge value={item.status} /></Td>
        <Td label="Created">{formatDate(item.createdAt)}</Td>
      </tr>)}
    </AdminTable>

    {totalPages > 1 ? <nav aria-label="Feedback pagination" className="admin-pagination flex items-center justify-between gap-3 text-sm text-admin-text-muted">
      <span>Page {safePage} of {totalPages} · {total} records</span>
      <div className="flex gap-2">
        {safePage > 1 ? <Link className="rounded-full border border-admin-input px-4 py-2 font-semibold text-admin-text hover:bg-admin-table-hover" href={pageHref(safePage - 1, status, category)}>Previous</Link> : null}
        {safePage < totalPages ? <Link className="rounded-full border border-admin-input px-4 py-2 font-semibold text-admin-text hover:bg-admin-table-hover" href={pageHref(safePage + 1, status, category)}>Next</Link> : null}
      </div>
    </nav> : null}
  </div>;
}
