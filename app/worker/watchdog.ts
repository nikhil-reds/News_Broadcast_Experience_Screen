/**
 * Watchdog — stuck-job detection & recovery
 * -------------------------------------------
 * A standalone process, run separately from the processing workers:
 *
 *     npm run worker:watchdog   # tsx app/worker/watchdog.ts
 *
 * WHY this exists on top of everything else already in place (BullMQ's own
 * 3-attempt retries, the CURRENT/NEXT generation system, stale-generation
 * protection, ffmpeg's own timeout, BullMQ's lock-based stalled-job
 * reclaim): none of those catch a worker process that's still alive and
 * still renewing its BullMQ lock, but has one specific job wedged on a
 * promise that never resolves (a Gemini/Whisper/Qwen/CosyVoice call with no
 * caller-side timeout) or has left an orphaned ffmpeg child running after
 * the worker itself died. Lock renewal only proves the *worker* is alive,
 * not that any given *job* is progressing — this file closes that gap by
 * watching `GenerationTask.lastHeartbeatAt` instead.
 *
 * WHAT IT DOES NOT DO: force-fail or forcibly re-enqueue a job that's
 * currently `active` per BullMQ. `Job.moveToFailed()` requires the lock
 * token only the owning Worker instance holds (confirmed against the
 * installed bullmq@5.81.2 types) — a separate process has no legitimate way
 * to do that. For a genuinely-active-but-silent job, this file's job is
 * detection + logging + (if a processId was recorded) best-effort orphan
 * cleanup — actual reclaim of that job happens via BullMQ's own lockDuration
 * expiry + stalled-job checker, which is why every ffmpeg-heavy queue's
 * `lockDuration` is now sized just above its own timeout rather than the
 * very generous 15-20 minutes it used to be.
 *
 * The one case this file DOES act on directly: a task stuck `processing` in
 * the DB whose BullMQ job has gone missing entirely (crashed before the
 * enqueue landed, Redis data lost, manually removed) — nothing holds a lock
 * on a job that doesn't exist, so re-enqueueing (or cancelling, if the
 * generation/variant is already stale) is safe.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  getQueueForTaskType,
  enqueueTranscription,
  enqueueHighlightAnalysis,
  enqueueHighlightReel,
  enqueueTranslations,
  enqueueAudioConversion,
  enqueueGreenScreenCompose,
  enqueueVideoExport,
  type VideoExportJob,
} from "@/lib/queue";
import { isStaleBaseGeneration, logTask } from "@/lib/generation";

const WORKER_NAME = "watchdog";

const SUSPICIOUS_AFTER_MS = parseInt(process.env.WATCHDOG_SUSPICIOUS_AFTER_MS || String(2 * 60 * 1000), 10);
const STALE_AFTER_MS = parseInt(process.env.WATCHDOG_STALE_AFTER_MS || String(5 * 60 * 1000), 10);
const SCAN_INTERVAL_MS = parseInt(process.env.WATCHDOG_SCAN_INTERVAL_MS || "30000", 10);

const metrics = {
  watchdog_scans: 0,
  stuck_jobs_detected: 0,
  jobs_recovered: 0,
  jobs_requeued: 0,
  jobs_force_killed: 0,
  watchdog_failures: 0,
  orphaned_jobs_detected: 0,
};

/** `greenscreen-*` → Screen 7, `video-export-N` → Screen N. `null` = a base task, not a per-screen variant. */
function variantScreenIdForTaskType(taskType: string): number | null {
  if (taskType.startsWith("greenscreen-")) return 7;
  if (taskType.startsWith("video-export-")) {
    const n = parseInt(taskType.slice("video-export-".length), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function isStale(generationId: string, taskType: string): Promise<boolean> {
  const screenId = variantScreenIdForTaskType(taskType);
  if (screenId === null) return isStaleBaseGeneration(generationId);
  const pub = await prisma.screenPublication.findUnique({ where: { screenId } });
  return !pub || pub.pendingGenerationId !== generationId;
}

/** Best-effort: true if a process with this pid exists (does NOT confirm it's the process we think it is — see the plan's PID-reuse caveat). */
function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killOrphanIfAny(processId: number | null, generationId: string, taskType: string) {
  if (!processId) return;
  if (!pidIsAlive(processId)) return;
  try {
    process.kill(processId, "SIGKILL");
    metrics.jobs_force_killed++;
    logTask({ generationId, taskType, status: "recovery", error: `killed orphaned pid ${processId}` });
  } catch (err) {
    logTask({
      generationId,
      taskType,
      status: "recovery",
      error: `failed to kill pid ${processId}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * Re-enqueue a task whose BullMQ job has gone missing, from its saved
 * `payload` snapshot (see the `payload` field added to GenerationTask —
 * without it there'd be nothing to call these functions with). Translation
 * is the one case that re-fires all 4 languages rather than just the missing
 * one (enqueueTranslations is inherently a fan-out); the other 3 languages'
 * existing jobId dedup means this just re-does already-finished work
 * wastefully, not incorrectly — an accepted tradeoff rather than building a
 * parallel single-language enqueue path solely for this rare edge case.
 */
async function requeueFromPayload(taskType: string, payload: any): Promise<boolean> {
  if (!payload) return false;
  const generationId = payload.generationId ?? null;

  if (taskType === "transcription") {
    await enqueueTranscription(payload.filename, generationId);
    return true;
  }
  if (taskType === "highlight-analysis") {
    await enqueueHighlightAnalysis(payload.cam1Filename, payload.cam2Filename, payload.cam3Filename, generationId);
    return true;
  }
  if (taskType === "highlight-reel") {
    await enqueueHighlightReel(
      payload.cam1Filename,
      payload.cam2Filename,
      payload.cam3Filename,
      { title: payload.title, segments: payload.segments, audio: payload.audio },
      generationId
    );
    return true;
  }
  if (taskType.startsWith("translation-")) {
    await enqueueTranslations(payload.filename, payload.segments, payload.transcriptId, generationId);
    return true;
  }
  if (taskType.startsWith("tts-")) {
    await enqueueAudioConversion(payload.langCode, payload.translationId, payload.filename, payload.text, generationId);
    return true;
  }
  if (taskType.startsWith("greenscreen-")) {
    await enqueueGreenScreenCompose(payload.backgroundId, payload.sourceFilename, generationId);
    return true;
  }
  if (taskType.startsWith("video-export-")) {
    await enqueueVideoExport(payload as VideoExportJob);
    return true;
  }
  return false;
}

async function recoverTask(task: {
  id: string;
  generationId: string;
  taskType: string;
  jobId: string | null;
  attempt: number;
  maxAttempts: number;
  processId: number | null;
  payload: unknown;
  recoveryAttempt: number;
}) {
  // Claim: an optimistic compare-and-swap on recoveryAttempt so two watchdog
  // instances scanning at once can't both act on the same row.
  const claim = await prisma.generationTask.updateMany({
    where: { id: task.id, recoveryAttempt: task.recoveryAttempt },
    data: { recoveryAttempt: { increment: 1 } },
  });
  if (claim.count === 0) return; // lost the race — another watchdog already has it

  metrics.stuck_jobs_detected++;

  if (await isStale(task.generationId, task.taskType)) {
    await prisma.generationTask.updateMany({
      where: { id: task.id },
      data: { status: "cancelled", errorMessage: "superseded by a newer generation/variant while stuck" },
    });
    logTask({
      generationId: task.generationId,
      taskType: task.taskType,
      jobId: task.jobId,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      status: "cancelled",
      error: "stale-on-recovery",
    });
    return;
  }

  const queue = getQueueForTaskType(task.taskType);
  const job = task.jobId && queue ? await queue.getJob(task.jobId) : undefined;
  const state = job ? await job.getState() : "missing";

  if (state === "completed") {
    const { markTaskCompleted } = await import("@/lib/generation");
    await markTaskCompleted(task.generationId, task.taskType);
    metrics.jobs_recovered++;
    logTask({ generationId: task.generationId, taskType: task.taskType, jobId: task.jobId, status: "repaired-completed" });
    return;
  }

  if (state === "failed") {
    const { markTaskFailed } = await import("@/lib/generation");
    const reason = (job && (await job.failedReason)) || "BullMQ reported this job failed";
    await markTaskFailed(task.generationId, task.taskType, reason, task.attempt, task.maxAttempts, task.jobId ?? undefined);
    metrics.jobs_recovered++;
    logTask({ generationId: task.generationId, taskType: task.taskType, jobId: task.jobId, status: "repaired-failed" });
    return;
  }

  if (state === "waiting" || state === "delayed") {
    // Not actually stuck — it just hasn't started (or is between retry
    // backoff delays) while its heartbeat aged past the threshold. Nothing
    // to recover; it'll heartbeat again once it actually starts running.
    logTask({ generationId: task.generationId, taskType: task.taskType, jobId: task.jobId, status: "no-action", error: `bullmq state=${state}` });
    return;
  }

  if (state === "active") {
    // Genuinely stuck while a live Worker still holds the lock — see the
    // file header for why this process can't force-fail it directly.
    killOrphanIfAny(task.processId, task.generationId, task.taskType);
    logTask({
      generationId: task.generationId,
      taskType: task.taskType,
      jobId: task.jobId,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      status: "no-action",
      error: "active-but-no-heartbeat; waiting on lockDuration/stalled-check to reclaim",
    });
    return;
  }

  // state === "missing": no BullMQ job at all, so no lock is held by anyone
  // — this is the one case safe to act on directly.
  metrics.orphaned_jobs_detected++;
  killOrphanIfAny(task.processId, task.generationId, task.taskType);

  if (task.attempt >= task.maxAttempts) {
    const { markTaskFailed } = await import("@/lib/generation");
    await markTaskFailed(
      task.generationId,
      task.taskType,
      "Task became unresponsive and its job disappeared after the maximum attempts",
      task.attempt,
      task.maxAttempts,
      task.jobId ?? undefined
    );
    logTask({ generationId: task.generationId, taskType: task.taskType, status: "failed", error: "orphaned-max-attempts" });
    return;
  }

  const requeued = await requeueFromPayload(task.taskType, task.payload).catch((err) => {
    logTask({
      generationId: task.generationId,
      taskType: task.taskType,
      status: "failed",
      error: `requeue threw: ${err instanceof Error ? err.message : String(err)}`,
    });
    return false;
  });

  if (requeued) {
    metrics.jobs_requeued++;
    logTask({ generationId: task.generationId, taskType: task.taskType, attempt: task.attempt, maxAttempts: task.maxAttempts, status: "requeued" });
  } else {
    metrics.watchdog_failures++;
    await prisma.generationTask.updateMany({
      where: { id: task.id },
      data: { status: "failed", errorMessage: "orphaned task with no payload to reconstruct a re-enqueue from" },
    });
    logTask({ generationId: task.generationId, taskType: task.taskType, status: "failed", error: "no-payload-to-requeue" });
  }
}

async function scan() {
  metrics.watchdog_scans++;
  const now = Date.now();
  const suspiciousCutoff = new Date(now - SUSPICIOUS_AFTER_MS);
  const staleCutoff = new Date(now - STALE_AFTER_MS);

  // `lastHeartbeatAt: { lt: suspiciousCutoff }` alone silently excludes every
  // row where it's still NULL (SQL: `NULL < x` is never true) — a task whose
  // worker returned early before ever starting a heartbeat (see the
  // stale-variant skip in app/worker/video-export.ts) would otherwise never
  // even become a scan candidate, no matter how long it sat "processing".
  // Falling back to `updatedAt` here catches that case too.
  const candidates = await prisma.generationTask.findMany({
    where: {
      status: "processing",
      OR: [
        { lastHeartbeatAt: { lt: suspiciousCutoff } },
        { lastHeartbeatAt: null, updatedAt: { lt: suspiciousCutoff } },
      ],
    },
  });

  for (const task of candidates) {
    const ageMs = now - (task.lastHeartbeatAt?.getTime() ?? task.updatedAt.getTime());
    if (ageMs < STALE_AFTER_MS) {
      logTask({
        generationId: task.generationId,
        taskType: task.taskType,
        jobId: task.jobId,
        status: "suspicious",
        error: `no heartbeat for ${Math.round(ageMs / 1000)}s`,
      });
      continue;
    }
    await recoverTask(task).catch((err) => {
      metrics.watchdog_failures++;
      console.error(`[${WORKER_NAME}] recovery threw for task ${task.id}:`, err);
    });
  }

  console.log(
    `[${WORKER_NAME}] scan complete ` +
      Object.entries(metrics)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
  );
}

console.log(
  `[${WORKER_NAME}] starting — scan every ${SCAN_INTERVAL_MS}ms, suspicious after ${SUSPICIOUS_AFTER_MS}ms, stale/recover after ${STALE_AFTER_MS}ms`
);
const interval = setInterval(() => {
  scan().catch((err) => console.error(`[${WORKER_NAME}] scan failed:`, err));
}, SCAN_INTERVAL_MS);
scan().catch((err) => console.error(`[${WORKER_NAME}] initial scan failed:`, err));

async function shutdown() {
  console.log(`[${WORKER_NAME}] shutting down…`);
  clearInterval(interval);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
