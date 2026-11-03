import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatBytes, formatDate, shortId } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminVideoJobsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filters = ["queued", "processing", "completed", "failed"];
  const selected = status && filters.includes(status) ? status : undefined;
  const jobs = await prisma.videoJob.findMany({
    where: selected ? { status: selected } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Video Jobs" description="Final export renders for language, aspect, and background variants." />
      <nav className="admin-filters" aria-label="Filter by status">
        {[undefined, ...filters].map((value) => (
          <Link key={value ?? "all"} aria-current={selected === value ? "page" : undefined} href={value ? `/admin/video-jobs?status=${value}` : "/admin/video-jobs"}>{value ?? "All"}</Link>
        ))}
      </nav>
      <AdminTable headers={["Reel", "Generation", "Language", "Aspect", "Background", "Status", "Size", "Output", "Updated"]} empty={jobs.length === 0}>
        {jobs.map((job) => (
          <tr key={job.id}>
            <Td>
              <Link href={`/admin/video-jobs/${job.id}`} className="font-semibold text-admin-accent">
                {job.reelFilename}
              </Link>
            </Td>
            <Td>{shortId(job.generationId)}</Td>
            <Td>{job.language}</Td>
            <Td>{job.aspect}</Td>
            <Td>{job.backgroundId}</Td>
            <Td><StatusBadge value={job.status} /></Td>
            <Td>{formatBytes(job.size)}</Td>
            <Td>
              {job.outputUrl ? (
                <Link href={job.outputUrl} className="font-semibold text-admin-accent">
                  View
                </Link>
              ) : (
                job.errorMessage ?? "None"
              )}
            </Td>
            <Td>{formatDate(job.updatedAt)}</Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
