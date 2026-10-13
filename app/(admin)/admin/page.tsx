import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminCard } from "@/components/admin/admin-card";
import { prisma } from "@/lib/prisma";

function MetricSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 sm:space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-admin-text-muted sm:text-sm">{title}</h3>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{children}</div>
    </section>
  );
}

export default async function AdminDashboardPage() {
  const today = new Date();
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const [
    totalSessions,
    sessionsToday,
    sessionsThisWeek,
    processingSessions,
    readySessions,
    failedSessions,
    pendingTasks,
    processingTasks,
    completedTasks,
    failedTasks,
    cancelledTasks,
    audioFiles,
    videoRecordings,
    transcripts,
    translations,
    completedVideoJobs,
    activeScreens,
    onlineCameras,
  ] = await Promise.all([
    prisma.broadcastSession.count(),
    prisma.broadcastSession.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.broadcastSession.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.broadcastSession.count({ where: { pipelineStatus: "processing" } }),
    prisma.broadcastSession.count({ where: { pipelineStatus: "ready" } }),
    prisma.broadcastSession.count({ where: { pipelineStatus: "failed" } }),
    prisma.generationTask.count({ where: { status: "pending" } }),
    prisma.generationTask.count({ where: { status: "processing" } }),
    prisma.generationTask.count({ where: { status: "completed" } }),
    prisma.generationTask.count({ where: { status: "failed" } }),
    prisma.generationTask.count({ where: { status: "cancelled" } }),
    prisma.audioFile.count(),
    prisma.videoRecording.count(),
    prisma.transcript.count(),
    prisma.transcriptTranslation.count(),
    prisma.videoJob.count({ where: { status: "completed" } }),
    prisma.broadcastScreen.count({ where: { isActive: true } }),
    prisma.cameraFeed.count({ where: { status: "online" } }),
  ]);

  return (
    <div className="admin-dashboard-surface space-y-6 p-4 sm:space-y-8 sm:p-6 lg:p-8">
      <AdminPageHeader
        title="Dashboard"
        description="Live operational summary for the broadcast pipeline."
        actions={
          <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-xs font-semibold text-admin-text-secondary shadow-sm transition hover:bg-admin-surface-muted focus-visible:outline-2 focus-visible:outline-admin-focus sm:text-sm">
            <span aria-hidden="true">◷</span>
            <span>Last 7 days</span>
            <span aria-hidden="true">⌄</span>
          </button>
        }
      />

      <MetricSection title="Overview">
        <AdminCard title="Total Sessions" value={totalSessions} detail="All generations" href="/admin/sessions" />
        <AdminCard title="Sessions Today" value={sessionsToday} detail="Created since midnight" href="/admin/sessions" />
        <AdminCard title="Sessions This Week" value={sessionsThisWeek} detail="Last 7 days" href="/admin/sessions" />
        <AdminCard title="Processing" value={processingSessions} detail="Pipeline in progress" tone="warn" href="/admin/sessions" />
        <AdminCard title="Ready Sessions" value={readySessions} detail="Available generations" tone="good" href="/admin/sessions" />
        <AdminCard title="Failed Sessions" value={failedSessions} detail="Pipeline failures" tone={failedSessions ? "bad" : "good"} href="/admin/sessions" />
      </MetricSection>
      <MetricSection title="Pipeline health">
        <AdminCard title="Pending Tasks" value={pendingTasks} detail="Waiting to start" tone={pendingTasks ? "warn" : "good"} href="/admin/generation-tasks" />
        <AdminCard title="Processing Tasks" value={processingTasks} detail="Currently running" href="/admin/generation-tasks" />
        <AdminCard title="Completed Tasks" value={completedTasks} detail="Successfully finished" tone="good" href="/admin/generation-tasks" />
        <AdminCard title="Failed Tasks" value={failedTasks} detail="Needs review" tone={failedTasks ? "bad" : "good"} href="/admin/generation-tasks" />
        <AdminCard title="Cancelled Tasks" value={cancelledTasks} detail="Stopped by operator" href="/admin/generation-tasks" />
      </MetricSection>
      <MetricSection title="Media output">
        <AdminCard title="Audio Files" value={audioFiles} detail="Uploaded masters" href="/admin/audio" />
        <AdminCard title="Video Recordings" value={videoRecordings} detail="Camera assets" href="/admin/recordings" />
        <AdminCard title="Transcripts" value={transcripts} detail="Generated transcripts" href="/admin/transcripts" />
        <AdminCard title="Translations" value={translations} detail="Language outputs" href="/admin/translations" />
        <AdminCard title="Video Exports" value={completedVideoJobs} detail="Completed jobs" tone="good" href="/admin/video-jobs" />
      </MetricSection>
      <MetricSection title="Infrastructure">
        <AdminCard title="Active Screens" value={activeScreens} detail="Screens enabled" tone="good" href="/admin/screens" />
        <AdminCard title="Online Cameras" value={onlineCameras} detail="Feeds currently online" tone={onlineCameras ? "good" : "warn"} href="/admin/control-room" />
      </MetricSection>

    </div>
  );
}
