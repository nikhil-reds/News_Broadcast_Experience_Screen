import Link from "next/link";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatBytes, formatDate, shortId } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminVideoJobsPage() {
  const jobs = await prisma.videoJob.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Video Jobs</h2>
        <p className="text-sm text-slate-500">Final export renders for language, aspect, and background variants.</p>
      </div>
      <AdminTable headers={["Reel", "Generation", "Language", "Aspect", "Background", "Status", "Size", "Output", "Updated"]} empty={jobs.length === 0}>
        {jobs.map((job) => (
          <tr key={job.id}>
            <Td>
              <Link href={`/admin/video-jobs/${job.id}`} className="font-semibold text-blue-700">
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
                <Link href={job.outputUrl} className="font-semibold text-blue-700">
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
