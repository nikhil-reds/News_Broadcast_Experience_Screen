import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDate, shortId } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminGenerationTasksPage() {
  const tasks = await prisma.generationTask.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { generation: { select: { seq: true } } },
  });

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Generation Tasks" description="Per-generation pipeline task status, progress, and errors." />
      <AdminTable headers={["Generation", "Task", "Status", "Attempt", "Progress", "Heartbeat", "Error", "Updated"]} empty={tasks.length === 0}>
        {tasks.map((task) => (
          <tr key={task.id}>
            <Td>{task.generation ? `#${task.generation.seq}` : shortId(task.generationId)}</Td>
            <Td>
              <Link href={`/admin/generation-tasks/${task.id}`} className="font-semibold text-admin-accent">
                {task.taskType}
              </Link>
            </Td>
            <Td><StatusBadge value={task.status} /></Td>
            <Td>{task.attempt}/{task.maxAttempts}</Td>
            <Td>{task.progressPercent ?? 0}%</Td>
            <Td>{formatDate(task.lastHeartbeatAt)}</Td>
            <Td>
              <span className="inline-block max-w-xs truncate align-bottom">{task.errorMessage ?? "None"}</span>
            </Td>
            <Td>{formatDate(task.updatedAt)}</Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
