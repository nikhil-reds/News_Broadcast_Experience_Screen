import { prisma } from "@/lib/prisma";

const DEFAULT_INTERVAL_MS = parseInt(process.env.WATCHDOG_HEARTBEAT_INTERVAL_MS || "30000", 10);

export interface Heartbeat {
  /** Update the in-memory progress the next tick will write — cheap, call as often as you like. */
  touch(progressPercent?: number, progressMessage?: string): void;
  /** Stop ticking and write one final heartbeat. Always await before the job settles. */
  stop(): Promise<void>;
}

const NOOP_HEARTBEAT: Heartbeat = { touch() {}, stop: async () => {} };

/**
 * Periodic `GenerationTask.lastHeartbeatAt` writer so app/worker/watchdog.ts
 * can tell "still genuinely working" apart from "silently wedged forever" —
 * BullMQ's own lock renewal can't make that distinction, since a worker
 * process renews locks for every job it's holding regardless of whether any
 * individual job is actually making progress. No-ops (returns a stub) when
 * `generationId` is falsy, matching every other function in lib/generation.ts.
 *
 * Writes are batched to one per `intervalMs` (default
 * WATCHDOG_HEARTBEAT_INTERVAL_MS, 30s) no matter how often `touch()` is
 * called — `touch()` only updates in-memory state; the interval tick does
 * the actual DB write. Ffmpeg-backed callers don't need this at all — pass
 * `onHeartbeat`/`timeoutMs` straight into the lib/ffmpeg.ts functions
 * instead, which already run one 30s timer per ffmpeg pass; use this helper
 * for everything else (a single awaited network call to Gemini/Whisper/
 * Qwen/CosyVoice).
 */
export function startHeartbeat(opts: {
  generationId: string | null | undefined;
  taskType: string;
  jobId?: string;
  processId?: number;
  intervalMs?: number;
}): Heartbeat {
  const { generationId, taskType, jobId, intervalMs = DEFAULT_INTERVAL_MS } = opts;
  if (!generationId) return NOOP_HEARTBEAT;

  let progressPercent: number | undefined;
  let progressMessage: string | undefined;
  let processId = opts.processId;

  const write = async () => {
    await prisma.generationTask
      .updateMany({
        where: { generationId, taskType },
        data: { lastHeartbeatAt: new Date(), progressPercent, progressMessage, processId },
      })
      .catch((err) => {
        // A missed heartbeat write is not fatal — the watchdog treats "no
        // heartbeat" conservatively (inspects BullMQ before doing anything),
        // so losing one write just means slightly later detection, not a
        // false "stuck" verdict.
        console.error(`[heartbeat] write failed for task=${taskType}:`, err);
      });
  };

  void write(); // one immediate heartbeat — don't wait for the first tick
  const timer = setInterval(write, intervalMs);

  return {
    touch(percent, message) {
      progressPercent = percent;
      progressMessage = message;
    },
    async stop() {
      clearInterval(timer);
      await write();
    },
  };
}

/**
 * Convenience wrapper for the common "one awaited call, no meaningful
 * progress milestones" shape (Gemini/Whisper/Qwen/CosyVoice). Stops the
 * heartbeat whether `fn` resolves or throws, and re-throws so the caller's
 * existing try/catch (which calls markTaskFailed) is unaffected.
 */
export async function withHeartbeat<T>(
  opts: { generationId: string | null | undefined; taskType: string; jobId?: string },
  fn: () => Promise<T>
): Promise<T> {
  const hb = startHeartbeat(opts);
  try {
    return await fn();
  } finally {
    await hb.stop();
  }
}
