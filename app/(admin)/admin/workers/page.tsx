import { AdminCard } from "@/components/admin/admin-card";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminWorkersPage() {
  const staleCutoff = new Date();
  staleCutoff.setMinutes(staleCutoff.getMinutes() - 10);

  const [processing, failed, stale, latest] = await Promise.all([
    prisma.generationTask.count({ where: { status: "processing" } }),
    prisma.generationTask.count({ where: { status: "failed" } }),
    prisma.generationTask.count({
      where: {
        status: "processing",
        lastHeartbeatAt: { lt: staleCutoff },
      },
    }),
    prisma.generationTask.findMany({
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Workers</h2>
        <p className="text-sm text-slate-500">Operational health based on generation task activity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminCard title="Processing" value={processing} detail="Tasks currently running" tone="warn" />
        <AdminCard title="Failed" value={failed} detail="Tasks requiring attention" tone={failed ? "bad" : "good"} />
        <AdminCard title="Possibly Stale" value={stale} detail="No heartbeat for 10 minutes" tone={stale ? "bad" : "good"} />
      </div>

      <AdminTable headers={["Task", "Status", "Progress", "Heartbeat", "Message", "Updated"]} empty={latest.length === 0}>
        {latest.map((task) => (
          <tr key={task.id}>
            <Td>{task.taskType}</Td>
            <Td><StatusBadge value={task.status} /></Td>
            <Td>{task.progressPercent ?? 0}%</Td>
            <Td>{formatDate(task.lastHeartbeatAt)}</Td>
            <Td>
              <span className="inline-block max-w-xs truncate align-bottom">{task.progressMessage ?? task.errorMessage ?? "None"}</span>
            </Td>
            <Td>{formatDate(task.updatedAt)}</Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
