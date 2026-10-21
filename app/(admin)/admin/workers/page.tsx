import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminCard } from "@/components/admin/admin-card";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

const workerEntries = [
  ["audio-transcription", "app/worker/audio-transcription.ts"],
  ["highlight-analysis", "app/worker/highlight-analysis.ts"],
  ["highlight-reel", "app/worker/highlight-reel.ts"],
  ["german-transcript", "app/worker/german-transcript.ts"],
  ["hindi-transcript", "app/worker/hindi-transcript.ts"],
  ["french-transcript", "app/worker/french-transcript.ts"],
  ["spanish-transcript", "app/worker/spanish-transcript.ts"],
  ["german-audio", "app/worker/german-audio.ts"],
  ["hindi-audio", "app/worker/hindi-audio.ts"],
  ["french-audio", "app/worker/french-audio.ts"],
  ["spanish-audio", "app/worker/spanish-audio.ts"],
  ["translations", "app/worker/translations.ts"],
  ["tts", "app/worker/tts.ts"],
  ["green-screen-compose", "app/worker/green-screen-compose.ts"],
  ["video-export", "app/worker/video-export.ts"],
  ["watchdog", "app/worker/watchdog.ts"],
] as const;

type HealthResult = { name: string; status: "PASS" | "FAIL" | "TIMEOUT"; detail: string };

async function readHealthReport() {
  try {
    const raw = await readFile(resolve(process.cwd(), "script/worker-health/results/latest.json"), "utf8");
    return JSON.parse(raw) as { generatedAt: string; timeoutMs: number; results: HealthResult[] };
  } catch {
    return null;
  }
}

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
  const healthReport = await readHealthReport();
  const healthByName = new Map(healthReport?.results.map((result) => [result.name, result]) ?? []);
  const healthy = workerEntries.filter(([name]) => healthByName.get(name)?.status === "PASS").length;
  const unhealthy = workerEntries.length - healthy;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Workers" description="Per-worker startup health and generation task activity." />

      <div className="grid gap-4 sm:grid-cols-5">
        <AdminCard title="Healthy workers" value={healthy} detail={`Passed latest startup test of ${workerEntries.length}`} tone={healthy === workerEntries.length ? "good" : "warn"} />
        <AdminCard title="Unhealthy workers" value={unhealthy} detail="Failed or timed out in latest test" tone={unhealthy ? "bad" : "good"} />
        <AdminCard title="Processing" value={processing} detail="Tasks currently running" tone="warn" />
        <AdminCard title="Failed" value={failed} detail="Tasks requiring attention" tone={failed ? "bad" : "good"} />
        <AdminCard title="Possibly Stale" value={stale} detail="No heartbeat for 10 minutes" tone={stale ? "bad" : "good"} />
      </div>

      <AdminTable headers={["Worker", "Entry point", "Health", "Test detail"]}>
        {workerEntries.map(([name, entry]) => {
          const result = healthByName.get(name);
          const status = result?.status ?? "NOT TESTED";
          return (
            <tr key={name}>
              <Td>{name}</Td>
              <Td>{entry}</Td>
              <Td><StatusBadge value={status} tone={status === "PASS" ? "success" : status === "NOT TESTED" ? "neutral" : "danger"} /></Td>
              <Td><span className="inline-block max-w-xl truncate align-bottom">{result?.detail ?? "Run: npx tsx script/worker-health.ts"}</span></Td>
            </tr>
          );
        })}
      </AdminTable>
      <p className="text-xs text-admin-text-muted">
        Latest startup test: {healthReport ? `${formatDate(new Date(healthReport.generatedAt))} · ${healthReport.timeoutMs / 1000}s timeout` : "not available"}. Run <code>npx tsx script/worker-health.ts</code> after changing worker or infrastructure configuration.
      </p>

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
