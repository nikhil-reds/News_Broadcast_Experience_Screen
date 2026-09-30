import Link from "next/link";
import { AdminCard } from "@/components/admin/admin-card";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  const [
    totalSessions,
    processingSessions,
    failedTasks,
    completedVideoJobs,
    activeAds,
    latestSessions,
    latestTasks,
  ] = await Promise.all([
    prisma.broadcastSession.count(),
    prisma.broadcastSession.count({ where: { pipelineStatus: "processing" } }),
    prisma.generationTask.count({ where: { status: "failed" } }),
    prisma.videoJob.count({ where: { status: "completed" } }),
    prisma.adCampaign.count({ where: { isActive: true } }),
    prisma.broadcastSession.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.generationTask.findMany({ orderBy: { updatedAt: "desc" }, take: 6 }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-sm text-slate-500">Live operational summary for the broadcast pipeline.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AdminCard title="Sessions" value={totalSessions} detail="All generations" />
        <AdminCard title="Processing" value={processingSessions} detail="Pipeline in progress" tone="warn" />
        <AdminCard title="Failed Tasks" value={failedTasks} detail="Needs review" tone={failedTasks ? "bad" : "good"} />
        <AdminCard title="Video Exports" value={completedVideoJobs} detail="Completed jobs" tone="good" />
        <AdminCard title="Active Ads" value={activeAds} detail="Campaigns live" />
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Latest Sessions</h3>
            <Link href="/admin/sessions" className="text-sm font-semibold text-blue-700">
              View all
            </Link>
          </div>
          <AdminTable headers={["Seq", "Status", "Pipeline", "Started"]} empty={latestSessions.length === 0}>
            {latestSessions.map((session) => (
              <tr key={session.id}>
                <Td>#{session.seq}</Td>
                <Td><StatusBadge value={session.status} /></Td>
                <Td><StatusBadge value={session.pipelineStatus} /></Td>
                <Td>{formatDate(session.startedAt)}</Td>
              </tr>
            ))}
          </AdminTable>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Recent Pipeline Tasks</h3>
            <Link href="/admin/generation-tasks" className="text-sm font-semibold text-blue-700">
              View all
            </Link>
          </div>
          <AdminTable headers={["Task", "Status", "Progress", "Updated"]} empty={latestTasks.length === 0}>
            {latestTasks.map((task) => (
              <tr key={task.id}>
                <Td>{task.taskType}</Td>
                <Td><StatusBadge value={task.status} /></Td>
                <Td>{task.progressPercent ?? 0}%</Td>
                <Td>{formatDate(task.updatedAt)}</Td>
              </tr>
            ))}
          </AdminTable>
        </div>
      </section>
    </div>
  );
}
