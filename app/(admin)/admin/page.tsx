import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { prisma } from "@/lib/prisma";
import styles from "./dashboard.module.css";

type StatusItem = {
  label: string;
  value: number;
  tone: "ready" | "processing" | "failed" | "completed" | "pending" | "cancelled";
};

function StatusBar({ items, label }: { items: StatusItem[]; label: string }) {
  return (
    <>
      <div className={styles.statusBar} role="img" aria-label={`${label}: ${items.map((item) => `${item.label} ${item.value}`).join(", ")}`}>
        {items.map((item) => <span key={item.label} className={styles[item.tone]} style={{ flexGrow: item.value || .35 }} />)}
      </div>
      <div className={styles.legend}>
        {items.map((item) => (
          <div key={item.label}>
            <span><i className={styles[item.tone]} />{item.label}</span>
            <strong>{item.value.toLocaleString("en-IN")}</strong>
          </div>
        ))}
      </div>
    </>
  );
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: requestedRange } = await searchParams;
  const range = requestedRange === "24h" || requestedRange === "30d" ? requestedRange : "7d";
  const rangeLabel = range === "24h" ? "Last 24 hours" : range === "30d" ? "Last 30 days" : "Last 7 days";
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setTime(now.getTime() - (range === "24h" ? 24 * 60 * 60_000 : range === "30d" ? 30 * 24 * 60 * 60_000 : 7 * 24 * 60 * 60_000));
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const todayStart = startOfToday > periodStart ? startOfToday : periodStart;
  const weekStart = startOfWeek > periodStart ? startOfWeek : periodStart;

  const [
    totalSessions, sessionsToday, sessionsThisWeek, processingSessions, readySessions, failedSessions,
    pendingTasks, processingTasks, completedTasks, failedTasks, cancelledTasks,
    activeScreens, onlineCameras,
  ] = await Promise.all([
    prisma.broadcastSession.count({ where: { createdAt: { gte: periodStart } } }),
    prisma.broadcastSession.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.broadcastSession.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.broadcastSession.count({ where: { pipelineStatus: "processing", createdAt: { gte: periodStart } } }),
    prisma.broadcastSession.count({ where: { pipelineStatus: "ready", createdAt: { gte: periodStart } } }),
    prisma.broadcastSession.count({ where: { pipelineStatus: "failed", createdAt: { gte: periodStart } } }),
    prisma.generationTask.count({ where: { status: "pending", createdAt: { gte: periodStart } } }),
    prisma.generationTask.count({ where: { status: "processing", createdAt: { gte: periodStart } } }),
    prisma.generationTask.count({ where: { status: "completed", createdAt: { gte: periodStart } } }),
    prisma.generationTask.count({ where: { status: "failed", createdAt: { gte: periodStart } } }),
    prisma.generationTask.count({ where: { status: "cancelled", createdAt: { gte: periodStart } } }),
    prisma.broadcastScreen.count({ where: { isActive: true } }),
    prisma.cameraFeed.count({ where: { status: "online" } }),
  ]);

  const totalTasks = pendingTasks + processingTasks + completedTasks + failedTasks + cancelledTasks;
  const successRate = Math.round((readySessions / Math.max(1, readySessions + failedSessions)) * 100);
  const sessionItems: StatusItem[] = [
    { label: "Ready", value: readySessions, tone: "ready" },
    { label: "Processing", value: processingSessions, tone: "processing" },
    { label: "Failed", value: failedSessions, tone: "failed" },
  ];
  const taskItems: StatusItem[] = [
    { label: "Completed", value: completedTasks, tone: "completed" },
    { label: "Pending", value: pendingTasks, tone: "pending" },
    { label: "Processing", value: processingTasks, tone: "processing" },
    { label: "Failed", value: failedTasks, tone: "failed" },
    { label: "Cancelled", value: cancelledTasks, tone: "cancelled" },
  ];

  return (
    <div className={styles.dashboard}>
      <AdminPageHeader
        title="Dashboard"
        description="Live summary of the broadcast pipeline"
        actions={(
          <details className={styles.rangeMenu}>
            <summary className={styles.rangeButton}>{rangeLabel} <span aria-hidden="true">⌄</span></summary>
            <div role="menu">
              <Link href="/admin?range=24h" role="menuitem" aria-current={range === "24h" ? "page" : undefined}>Last 24 hours</Link>
              <Link href="/admin?range=7d" role="menuitem" aria-current={range === "7d" ? "page" : undefined}>Last 7 days</Link>
              <Link href="/admin?range=30d" role="menuitem" aria-current={range === "30d" ? "page" : undefined}>Last 30 days</Link>
            </div>
          </details>
        )}
      />

      <section className={styles.failureBanner} aria-label="Failures needing review">
        <i aria-hidden="true" />
        <p><strong>{failedSessions}</strong> sessions and <strong>{failedTasks}</strong> tasks failed in this period</p>
        <Link href="/admin/generation-logs?status=failed">Review failures</Link>
      </section>

      <section className={styles.primaryGrid} aria-label="Pipeline summary">
        <article className={styles.summaryCard}>
          <h2>Sessions</h2>
          <div className={styles.bigValue}><strong>{totalSessions.toLocaleString("en-IN")}</strong><span>{sessionsThisWeek.toLocaleString("en-IN")} this week</span></div>
          <StatusBar items={sessionItems} label="Session status" />
          <div className={styles.sessionDetails}>
            <div><span>Created today</span><strong>{sessionsToday}</strong></div>
            <div><span>This week</span><strong>{sessionsThisWeek}</strong></div>
            <div><span>Success rate</span><strong>{successRate}%</strong></div>
          </div>
        </article>

        <article className={styles.summaryCard}>
          <h2>Pipeline tasks</h2>
          <div className={styles.bigValue}><strong>{totalTasks.toLocaleString("en-IN")}</strong><span>{completedTasks.toLocaleString("en-IN")} completed</span></div>
          <StatusBar items={taskItems} label="Pipeline task status" />
        </article>
      </section>

      <section aria-labelledby="infrastructure-title">
        <h2 id="infrastructure-title" className={styles.sectionTitle}>Infrastructure</h2>
        <div className={styles.infrastructure}>
          <Link href="/admin/control-room"><span><i className={styles.ready} />Active screens</span><strong>{activeScreens}</strong><em>Broadcast outputs enabled</em></Link>
          <Link href="/admin/studio/camera"><span><i className={onlineCameras ? styles.ready : styles.processing} />Online cameras</span><strong>{onlineCameras}</strong><em>Feeds reporting online</em></Link>
        </div>
      </section>
    </div>
  );
}
