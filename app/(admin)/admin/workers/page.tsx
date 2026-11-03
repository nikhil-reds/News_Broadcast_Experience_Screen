import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { WorkerHealthDashboard } from "@/components/admin/worker-health-dashboard";
import { readWorkerHealth } from "@/lib/worker-health";
import { redisConnection } from "@/lib/redis";

const ALL_WORKERS = [
  ["audio-transcription", "Audio"], ["highlight-analysis", "Highlights"], ["highlight-reel", "Highlights"],
  ["german-transcript", "Translation"], ["hindi-transcript", "Translation"], ["french-transcript", "Translation"], ["spanish-transcript", "Translation"],
  ["german-audio", "TTS"], ["hindi-audio", "TTS"], ["french-audio", "TTS"], ["spanish-audio", "TTS"],
  ["translations", "Translation"], ["tts", "TTS"], ["green-screen-compose", "Video"], ["video-export", "Video"], ["watchdog", "Infrastructure"],
] as const;

export default async function AdminWorkersPage() {
  const [health, processing, failed, stale] = await Promise.all([
    readWorkerHealth(),
    import("@/lib/prisma").then(({ prisma }) => prisma.generationTask.count({ where: { status: "processing" } })),
    import("@/lib/prisma").then(({ prisma }) => prisma.generationTask.count({ where: { status: "failed" } })),
    import("@/lib/prisma").then(({ prisma }) => prisma.generationTask.count({ where: { status: "processing", lastHeartbeatAt: { lt: new Date(Date.now() - 10 * 60_000) } } })),
  ]);
  const byName = new Map(health.map((item) => [item.workerName.replace(/-worker$/, ""), item]));
  const workers = ALL_WORKERS.map(([name, group]) => { const item = byName.get(name); const age = item ? Date.now() - Date.parse(item.lastHeartbeatAt) : null; return { name, group, status: !item ? "unknown" : age !== null && age > 90_000 ? "stale" : item.status === "failed" ? "degraded" : "healthy", heartbeatAgeMs: age, currentJobId: item?.currentJobId, lastError: item?.lastError }; });
  const healthy = workers.filter((worker) => worker.status === "healthy").length;
  const redis = await redisConnection.ping().then(() => ({ status: "healthy" })).catch(() => ({ status: "down" }));
  const initial = { checkedAt: new Date().toISOString(), overall: healthy === workers.length && redis.status === "healthy" ? "healthy" : healthy ? "degraded" : "down", summary: { healthy, total: workers.length, processing, failed, stale }, dependencies: { redis }, workers };
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Worker & Pipeline Health" description="Live worker, queue, dependency, and pipeline monitoring." />
      <WorkerHealthDashboard initial={initial} />
    </div>
  );
}
