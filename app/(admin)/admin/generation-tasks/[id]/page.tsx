import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { notFound } from "next/navigation";
import { AdminSection, DetailGrid, DetailItem } from "@/components/admin/admin-section";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminGenerationTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await prisma.generationTask.findUnique({
    where: { id },
    include: { generation: { select: { seq: true, id: true } } },
  });
  if (!task) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        backHref="/admin/generation-logs"
        backLabel="Back to generation logs"
        title={task.taskType}
        description="Pipeline task diagnostics and recovery context."
      />

      {task.errorMessage && <section className="admin-notice" aria-label="Task error">{task.errorMessage}</section>}
      <AdminSection title="Task details">
        <DetailGrid>
          <DetailItem label="Generation" value={task.generation ? `#${task.generation.seq}` : task.generationId} />
          <DetailItem label="Status" value={<StatusBadge value={task.status} />} />
          <DetailItem label="Attempt" value={`${task.attempt}/${task.maxAttempts}`} />
          <DetailItem label="Job ID" value={task.jobId ?? "None"} />
          <DetailItem label="Progress" value={`${task.progressPercent ?? 0}%`} />
          <DetailItem label="Progress Message" value={task.progressMessage ?? "None"} />
          <DetailItem label="Started" value={formatDate(task.startedAt)} />
          <DetailItem label="Completed" value={formatDate(task.completedAt)} />
          <DetailItem label="Heartbeat" value={formatDate(task.lastHeartbeatAt)} />
          <DetailItem label="Process ID" value={task.processId ?? "None"} />
          <DetailItem label="Recovery Attempt" value={task.recoveryAttempt} />
          <DetailItem label="Updated" value={formatDate(task.updatedAt)} />
        </DetailGrid>
      </AdminSection>

    </div>
  );
}
