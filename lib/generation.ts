import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GREEN_SCREEN_BACKGROUNDS } from "@/lib/green-screen";

/**
 * Generation pipeline core — see docs/generation-pipeline.md for the full
 * design. Summary:
 *
 * - A `BroadcastSession` row (aka "Generation #N", `seq`) is created at
 *   Start Recording and is the unit every base pipeline task (transcription,
 *   translations, TTS, highlight-analysis/reel, green-screen prewarm) is
 *   tagged with via `generationId`.
 * - `GenerationTask` rows are the single source of truth for retries/
 *   observability/readiness — one row per (generationId, taskType).
 * - Base-generation readiness ("is screen S's required set done for
 *   generation G?") is *computed live* from `GenerationTask`, not persisted —
 *   there's exactly one valid "current" answer at any time (the newest fully-
 *   ready generation), so there's nothing to get out of sync.
 * - Variant readiness (an operator-chosen background/language/aspect against
 *   an already-published generation) genuinely needs a persisted pointer —
 *   multiple variants can be simultaneously "ready" (e.g. both German and
 *   Hindi TTS), so `ScreenPublication.current/pendingParams` records which
 *   one is actually selected.
 */

export type TaskType = string;

const TRANSLATION_LANG_CODES = ["de", "hi", "fr", "es"] as const;

const TRANSLATION_TASKS = TRANSLATION_LANG_CODES.map((c) => `translation-${c}`);
const TTS_TASKS = TRANSLATION_LANG_CODES.map((c) => `tts-${c}`);
const GREENSCREEN_TASKS = GREEN_SCREEN_BACKGROUNDS.map((b) => `greenscreen-${b.id}`);

/** Every base taskType that can exist, used to seed/validate. */
export const ALL_BASE_TASK_TYPES: TaskType[] = [
  "transcription",
  ...TRANSLATION_TASKS,
  ...TTS_TASKS,
  "highlight-analysis",
  "highlight-reel",
  ...GREENSCREEN_TASKS,
];

/**
 * Which base tasks each screen needs fully `completed` before it will show a
 * generation. Screens 1/2/3 aren't listed — they just loop the newest raw
 * camera take per camera, no derived pipeline to gate on.
 */
export const SCREEN_REQUIREMENTS: Record<number, TaskType[]> = {
  4: ["transcription"],
  5: ["transcription", ...TRANSLATION_TASKS, ...TTS_TASKS],
  6: ["highlight-analysis", "highlight-reel"],
  // Screen 7 is NOT gated here: the operator can pick any background as soon
  // as *that one* composite is ready, independent of the other 4 — that's a
  // per-selection variant readiness (ScreenPublication), not an "all 5 must
  // be done" base requirement. See VARIANT_SCREENS below.
  8: ["transcription", ...TRANSLATION_TASKS, "highlight-analysis", "highlight-reel"],
  9: ["highlight-analysis", "highlight-reel"],
  10: ["highlight-analysis", "highlight-reel"],
  11: ["transcription", ...TRANSLATION_TASKS, ...TTS_TASKS, "highlight-analysis", "highlight-reel"],
  12: ["transcription", ...TRANSLATION_TASKS, ...TTS_TASKS, "highlight-analysis", "highlight-reel"],
};

/**
 * Screens 7/11/12 gate on a specific chosen variant (background/export
 * combo), tracked via ScreenPublication instead of SCREEN_REQUIREMENTS.
 * Screen 5 is deliberately NOT here: SCREEN_REQUIREMENTS[5] already requires
 * all 4 languages' TTS before the screen goes "current" at all, so by the
 * time it shows anything every language is already available — switching
 * between them is pure display, nothing async to gate on.
 */
export const VARIANT_SCREENS = new Set([7, 11, 12]);

// ---------------------------------------------------------------------------
// Structured logging (requirement #22)
// ---------------------------------------------------------------------------

export function logTask(f: {
  generationId?: string | null;
  screenId?: number;
  taskType: string;
  jobId?: string | null;
  attempt?: number;
  maxAttempts?: number;
  status: string;
  durationMs?: number;
  error?: string | null;
}) {
  const attemptStr = f.attempt != null ? `${f.attempt}/${f.maxAttempts ?? 3}` : undefined;
  const tags = [
    f.generationId ? `[generation=${f.generationId}]` : null,
    f.screenId != null ? `[screen=${f.screenId}]` : null,
    `[task=${f.taskType}]`,
    f.jobId ? `[job=${f.jobId}]` : null,
    attemptStr ? `[attempt=${attemptStr}]` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const suffix = [
    `status=${f.status}`,
    f.durationMs != null ? `duration=${f.durationMs}ms` : null,
    f.error ? `error=${JSON.stringify(f.error)}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const line = `${tags} ${suffix}`;
  if (f.status === "failed") console.error(line);
  else console.log(line);
}

// ---------------------------------------------------------------------------
// Base-task lifecycle — every worker calls these around its existing work.
// ---------------------------------------------------------------------------

/**
 * Called by the enqueue*() functions in lib/queue.ts when a job is created.
 * `payload` is a snapshot of the exact arguments that enqueue call was given
 * — stored so app/worker/watchdog.ts can reconstruct a re-enqueue if this
 * task's BullMQ job ever goes missing entirely (crash before the job landed,
 * Redis data loss). Not needed for the normal path; only read by the watchdog.
 */
export async function upsertTaskPending(
  generationId: string | null | undefined,
  taskType: TaskType,
  jobId?: string,
  payload?: Record<string, unknown>
) {
  if (!generationId) return null;
  return prisma.generationTask.upsert({
    where: { generationId_taskType: { generationId, taskType } },
    create: { generationId, taskType, status: "pending", jobId, payload: payload as Prisma.InputJsonValue },
    update: { jobId, status: "pending", errorMessage: null, payload: payload as Prisma.InputJsonValue },
  });
}

/** Called at the top of a worker's processor function. Returns the attempt number. */
export async function markTaskProcessing(
  generationId: string | null | undefined,
  taskType: TaskType,
  jobId?: string
): Promise<number> {
  if (!generationId) return 1;
  const row = await prisma.generationTask.upsert({
    where: { generationId_taskType: { generationId, taskType } },
    create: { generationId, taskType, status: "processing", attempt: 1, jobId, startedAt: new Date() },
    update: { status: "processing", attempt: { increment: 1 }, jobId, startedAt: new Date() },
  });
  logTask({ generationId, taskType, jobId, attempt: row.attempt, status: "processing" });
  return row.attempt;
}

/** Called on a worker's success path. */
export async function markTaskCompleted(
  generationId: string | null | undefined,
  taskType: TaskType,
  opts?: { durationMs?: number; jobId?: string }
) {
  if (!generationId) return;
  await prisma.generationTask.updateMany({
    where: { generationId, taskType },
    data: { status: "completed", completedAt: new Date(), errorMessage: null },
  });
  logTask({ generationId, taskType, jobId: opts?.jobId, status: "completed", durationMs: opts?.durationMs });
  await maybeMarkGenerationReady(generationId);
  triggerCleanupSweep();
}

/**
 * Fire-and-forget: a task completing (or a variant publishing) is exactly
 * the moment some screen's displayed generation might have just advanced,
 * making an older one eligible for deletion — see lib/generation-cleanup.ts.
 * Dynamic import avoids a static circular dependency (that module imports
 * SCREEN_REQUIREMENTS/computeScreenBaseStatus from this one). Never allowed
 * to throw into the caller — a failed sweep just tries again next time.
 */
function triggerCleanupSweep() {
  import("@/lib/generation-cleanup")
    .then((m) => m.cleanupSupersededGenerations())
    .catch((err) => console.error("[generation-cleanup] sweep failed:", err));
}

/**
 * Called from a worker's `worker.on("failed", ...)` handler — i.e. once per
 * BullMQ attempt, not just the final one. `attemptsMade`/`maxAttempts` come
 * straight from `job.attemptsMade`/`job.opts.attempts` so this never
 * duplicates BullMQ's own retry bookkeeping.
 */
export async function markTaskFailed(
  generationId: string | null | undefined,
  taskType: TaskType,
  errorMessage: string,
  attemptsMade: number,
  maxAttempts: number,
  jobId?: string
) {
  if (!generationId) return;
  const finalFailure = attemptsMade >= maxAttempts;
  await prisma.generationTask.updateMany({
    where: { generationId, taskType },
    data: { status: finalFailure ? "failed" : "pending", errorMessage },
  });
  logTask({
    generationId,
    taskType,
    jobId,
    attempt: attemptsMade,
    maxAttempts,
    status: finalFailure ? "failed" : "retry-scheduled",
    error: errorMessage,
  });
  if (finalFailure) {
    await prisma.broadcastSession
      .update({ where: { id: generationId }, data: { pipelineStatus: "failed" } })
      .catch(() => {});
  }
}

/** Flips a generation's pipelineStatus to "ready" once every base task it has rows for is completed. */
async function maybeMarkGenerationReady(generationId: string) {
  const tasks = await prisma.generationTask.findMany({ where: { generationId } });
  if (tasks.length === 0) return;
  const allDone = tasks.every((t) => t.status === "completed");
  if (!allDone) return;
  await prisma.broadcastSession
    .update({ where: { id: generationId }, data: { pipelineStatus: "ready" } })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Stale-generation guard (requirement #13)
// ---------------------------------------------------------------------------

export async function getLatestGenerationId(): Promise<string | null> {
  const row = await prisma.broadcastSession.findFirst({ orderBy: { seq: "desc" }, select: { id: true } });
  return row?.id ?? null;
}

/**
 * Base tasks (transcription/translation/TTS/highlight-* /green-screen
 * prewarm) are only ever run for the single most-recent recording — so a job
 * is stale iff a newer generation has since been created. `generationId` of
 * `null`/`undefined` (legacy pre-generation data) is never considered stale.
 */
export async function isStaleBaseGeneration(generationId: string | null | undefined): Promise<boolean> {
  if (!generationId) return false;
  const latest = await getLatestGenerationId();
  return latest !== null && latest !== generationId;
}

// ---------------------------------------------------------------------------
// Per-screen base readiness — computed live, nothing persisted (requirement #6)
// ---------------------------------------------------------------------------

export interface ScreenBaseStatus {
  status: "current" | "preparing" | "failed";
  generationId: string | null;
  seq: number | null;
  progress: { completed: number; total: number };
  failureReason?: string;
}

/**
 * Walks generations newest-first and returns the newest one that is fully
 * ready for `screenId` (every SCREEN_REQUIREMENTS[screenId] task
 * `completed`). If the very newest generation isn't ready yet, an older
 * ready generation is still reported as "current" (so the screen keeps
 * showing it) alongside "preparing" progress for the newest one.
 */
export async function computeScreenBaseStatus(screenId: number): Promise<ScreenBaseStatus | null> {
  const required = SCREEN_REQUIREMENTS[screenId];
  if (!required || required.length === 0) return null;

  const latestGen = await prisma.broadcastSession.findFirst({ orderBy: { seq: "desc" } });
  if (!latestGen) {
    return { status: "preparing", generationId: null, seq: null, progress: { completed: 0, total: required.length } };
  }

  const candidates = await prisma.broadcastSession.findMany({
    orderBy: { seq: "desc" },
    take: 5,
    include: { generationTasks: { where: { taskType: { in: required } } } },
  });

  const latestTasks = candidates.find((g) => g.id === latestGen.id)?.generationTasks ?? [];
  const completed = latestTasks.filter((t) => t.status === "completed").length;
  const failedTask = latestTasks.find((t) => t.status === "failed");

  for (const gen of candidates) {
    const isReady = required.every(
      (t) => gen.generationTasks.find((row) => row.taskType === t)?.status === "completed"
    );
    if (isReady) {
      if (gen.id === latestGen.id) {
        return { status: "current", generationId: gen.id, seq: gen.seq, progress: { completed, total: required.length } };
      }
      return {
        status: failedTask ? "failed" : "preparing",
        generationId: gen.id,
        seq: gen.seq,
        progress: { completed, total: required.length },
        failureReason: failedTask?.errorMessage ?? undefined,
      };
    }
  }

  return {
    status: failedTask ? "failed" : "preparing",
    generationId: null,
    seq: null,
    progress: { completed, total: required.length },
    failureReason: failedTask?.errorMessage ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Variant selection (background/language/aspect) — requirements #10/#11/#13/#14
// ---------------------------------------------------------------------------

function paramsMatch(a: unknown, b: Record<string, unknown>): boolean {
  if (!a || typeof a !== "object") return false;
  const recordA = a as Record<string, unknown>;
  const keys = new Set([...Object.keys(recordA), ...Object.keys(b)]);
  for (const k of keys) {
    if (recordA[k] !== b[k]) return false;
  }
  return true;
}

/** Called when an operator's config change (background/language/aspect) kicks off a variant job. */
export async function setPendingVariant(screenId: number, generationId: string, params: Record<string, unknown>) {
  await prisma.screenPublication.upsert({
    where: { screenId },
    create: {
      screenId,
      pendingGenerationId: generationId,
      pendingParams: params as Prisma.InputJsonValue,
      pendingStatus: "preparing",
    },
    update: {
      pendingGenerationId: generationId,
      pendingParams: params as Prisma.InputJsonValue,
      pendingStatus: "preparing",
      pendingFailureReason: null,
    },
  });
}

/**
 * A variant job is stale if a newer request for the same screen has already
 * replaced it — checked by comparing against ScreenPublication.pending*
 * rather than a global "latest" pointer, since variants (unlike base
 * generations) aren't strictly ordered.
 */
export async function isStaleVariant(
  screenId: number,
  generationId: string | null | undefined,
  params: Record<string, unknown>
): Promise<boolean> {
  if (!generationId) return false;
  const pub = await prisma.screenPublication.findUnique({ where: { screenId } });
  if (!pub || pub.pendingGenerationId !== generationId) return true;
  if (!paramsMatch(pub.pendingParams, params)) return true;
  return false;
}

/** Called on a variant job's success path. Returns false (no-op) if the result is stale. */
export async function publishVariant(
  screenId: number,
  generationId: string,
  params: Record<string, unknown>,
  assetUrls: Record<string, unknown>
): Promise<boolean> {
  const pub = await prisma.screenPublication.findUnique({ where: { screenId } });
  if (!pub || pub.pendingGenerationId !== generationId || !paramsMatch(pub.pendingParams, params)) {
    logTask({ generationId, screenId, taskType: "variant-publish", status: "discarded-stale" });
    return false;
  }
  await prisma.screenPublication.update({
    where: { screenId },
    data: {
      currentGenerationId: generationId,
      currentParams: { ...params, ...assetUrls } as Prisma.InputJsonValue,
      pendingGenerationId: null,
      pendingParams: Prisma.JsonNull,
      pendingStatus: "idle",
      pendingFailureReason: null,
    },
  });
  logTask({ generationId, screenId, taskType: "variant-publish", status: "published" });
  triggerCleanupSweep();
  return true;
}

/** Called on a variant job's final failure. Never touches current* (requirement #10). */
export async function failVariant(
  screenId: number,
  generationId: string,
  params: Record<string, unknown>,
  reason: string
) {
  const pub = await prisma.screenPublication.findUnique({ where: { screenId } });
  if (!pub || pub.pendingGenerationId !== generationId || !paramsMatch(pub.pendingParams, params)) {
    return; // superseded already — nothing to do
  }
  await prisma.screenPublication.update({
    where: { screenId },
    data: {
      pendingGenerationId: null,
      pendingParams: Prisma.JsonNull,
      pendingStatus: "failed",
      pendingFailureReason: reason,
    },
  });
}
