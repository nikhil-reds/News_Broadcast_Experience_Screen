/**
 * Re-queue the green-screen compose jobs for a generation
 * --------------------------------------------------------
 * Re-runs all 5 background composites against the SAME source recording that
 * already failed, rather than forcing a whole new take through the pipeline.
 *
 *     npx tsx scripts/requeue-greenscreen.ts              # latest generation
 *     npx tsx scripts/requeue-greenscreen.ts <generationId>
 *
 * The source filename is read back out of each failed task's stored `payload`
 * (see upsertTaskPending in lib/generation.ts), so the retry is guaranteed to
 * target the same take — no filename guessing.
 *
 * `attempt` is also reset to 0 here. That counter is cumulative: it is
 * incremented by markTaskProcessing on every run and never reset by
 * upsertTaskPending, which is why an ffmpeg outage produces confusing
 * "attempt=18/3" log lines. Zeroing it keeps the retry's logs readable.
 *
 * Workers must be running (npm run worker:all) for the jobs to be picked up.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { enqueueGreenScreenCompose } from "@/lib/queue";

async function main() {
  const requested = process.argv[2];

  const generationId =
    requested ??
    (
      await prisma.broadcastSession.findFirst({
        orderBy: { seq: "desc" },
        select: { id: true },
      })
    )?.id;

  if (!generationId) {
    console.error("[requeue] no generation found — nothing to do");
    process.exitCode = 1;
    return;
  }

  const tasks = await prisma.generationTask.findMany({
    where: { generationId, taskType: { startsWith: "greenscreen-" } },
    select: { taskType: true, status: true, payload: true },
    orderBy: { taskType: "asc" },
  });

  if (tasks.length === 0) {
    console.error(`[requeue] generation ${generationId} has no greenscreen tasks`);
    process.exitCode = 1;
    return;
  }

  console.log(`[requeue] generation ${generationId} — ${tasks.length} greenscreen task(s)`);

  let queued = 0;
  for (const task of tasks) {
    const payload = (task.payload ?? {}) as { backgroundId?: string; sourceFilename?: string };
    const backgroundId = payload.backgroundId ?? task.taskType.replace(/^greenscreen-/, "");
    const sourceFilename = payload.sourceFilename;

    if (!sourceFilename) {
      console.error(`[requeue] ${task.taskType}: no sourceFilename in payload — skipped`);
      continue;
    }

    // Reset the cumulative attempt counter before enqueueing so this run's
    // logs read as attempt=1/3 rather than continuing the old tally.
    await prisma.generationTask.update({
      where: { generationId_taskType: { generationId, taskType: task.taskType } },
      data: { attempt: 0, recoveryAttempt: 0, errorMessage: null },
    });

    await enqueueGreenScreenCompose(backgroundId, sourceFilename, generationId);
    queued += 1;
    console.log(`[requeue] ${task.taskType} (was ${task.status}) -> queued for "${sourceFilename}"`);
  }

  console.log(`[requeue] ${queued}/${tasks.length} job(s) queued`);
}

main()
  .catch((error) => {
    console.error("[requeue] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // The BullMQ queue in lib/queue.ts holds an open Redis connection; without
    // this the script would hang instead of exiting.
    process.exit(process.exitCode ?? 0);
  });
