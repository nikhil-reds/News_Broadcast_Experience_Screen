import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSection, DetailGrid, DetailItem } from "@/components/admin/admin-section";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatBytes, formatDate, shortId } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminVideoJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await prisma.videoJob.findUnique({
    where: { id },
    include: { generation: { select: { seq: true, id: true } } },
  });
  if (!job) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/video-jobs" className="text-sm font-semibold text-blue-700">Back to video jobs</Link>
        <h2 className="mt-2 text-2xl font-bold">{job.reelFilename}</h2>
        <p className="text-sm text-slate-500">Export job for {job.language} / {job.aspect}.</p>
      </div>

      <AdminSection title="Job Details">
        <DetailGrid>
          <DetailItem label="Status" value={<StatusBadge value={job.status} />} />
          <DetailItem label="Generation" value={job.generation ? `#${job.generation.seq}` : shortId(job.generationId)} />
          <DetailItem label="Language" value={job.language} />
          <DetailItem label="Aspect" value={job.aspect} />
          <DetailItem label="Background" value={job.backgroundId} />
          <DetailItem label="Size" value={formatBytes(job.size)} />
          <DetailItem label="Output Filename" value={job.outputFilename ?? "None"} />
          <DetailItem label="Error" value={job.errorMessage ?? "None"} />
          <DetailItem label="Updated" value={formatDate(job.updatedAt)} />
        </DetailGrid>
      </AdminSection>

      {job.outputUrl ? (
        <Link href={job.outputUrl} className="inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white">
          Open output
        </Link>
      ) : null}
    </div>
  );
}
