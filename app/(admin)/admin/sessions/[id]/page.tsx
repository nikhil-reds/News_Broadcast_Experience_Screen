import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSection, DetailGrid, DetailItem } from "@/components/admin/admin-section";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatBytes, formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await prisma.broadcastSession.findUnique({
    where: { id },
    include: {
      videoRecordings: true,
      audioFiles: true,
      generationTasks: { orderBy: { updatedAt: "desc" } },
      videoJobs: { orderBy: { updatedAt: "desc" } },
      transcripts: true,
      transcriptTranslations: true,
    },
  });

  if (!session) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/sessions" className="text-sm font-semibold text-blue-700">Back to sessions</Link>
        <h2 className="mt-2 text-2xl font-bold">Session #{session.seq}</h2>
        <p className="text-sm text-slate-500">Full generation record and related pipeline assets.</p>
      </div>

      <AdminSection title="Session Details">
        <DetailGrid>
          <DetailItem label="Status" value={<StatusBadge value={session.status} />} />
          <DetailItem label="Pipeline" value={<StatusBadge value={session.pipelineStatus} />} />
          <DetailItem label="Background" value={session.selectedBackgroundId ?? "None"} />
          <DetailItem label="Subtitle Language" value={session.selectedSubtitleLanguage} />
          <DetailItem label="Audio Language" value={session.selectedAudioLanguage} />
          <DetailItem label="Brightness" value={`${session.selectedBrightness}%`} />
          <DetailItem label="Started" value={formatDate(session.startedAt)} />
          <DetailItem label="Ended" value={formatDate(session.endedAt)} />
          <DetailItem label="Session ID" value={session.id} />
        </DetailGrid>
      </AdminSection>

      <AdminSection title="Recordings">
        <AdminTable headers={["Filename", "Type", "Size", "Created"]} empty={session.videoRecordings.length === 0}>
          {session.videoRecordings.map((recording) => (
            <tr key={recording.id}>
              <Td>{recording.filename}</Td>
              <Td>{recording.contentType ?? "Unknown"}</Td>
              <Td>{formatBytes(recording.size)}</Td>
              <Td>{formatDate(recording.createdAt)}</Td>
            </tr>
          ))}
        </AdminTable>
      </AdminSection>

      <AdminSection title="Pipeline Tasks">
        <AdminTable headers={["Task", "Status", "Attempt", "Progress", "Updated"]} empty={session.generationTasks.length === 0}>
          {session.generationTasks.map((task) => (
            <tr key={task.id}>
              <Td><Link href={`/admin/generation-tasks/${task.id}`} className="font-semibold text-blue-700">{task.taskType}</Link></Td>
              <Td><StatusBadge value={task.status} /></Td>
              <Td>{task.attempt}/{task.maxAttempts}</Td>
              <Td>{task.progressPercent ?? 0}%</Td>
              <Td>{formatDate(task.updatedAt)}</Td>
            </tr>
          ))}
        </AdminTable>
      </AdminSection>
    </div>
  );
}
