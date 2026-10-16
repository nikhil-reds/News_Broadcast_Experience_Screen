import { randomUUID } from "node:crypto";
import { redisConnection } from "@/lib/redis";

const COSYVOICE_API_URL = (process.env.COSYVOICE_API_URL || "http://localhost:9500").replace(/\/$/, "");
const SAMPLE_RATE = Number(process.env.COSYVOICE_SAMPLE_RATE || 24000);
const COSYVOICE_LOCK_KEY = "lock:cosyvoice:inference";
const COSYVOICE_LOCK_TTL_MS = Number(process.env.COSYVOICE_LOCK_TTL_MS || 20 * 60 * 1000);
const COSYVOICE_LOCK_WAIT_MS = Number(process.env.COSYVOICE_LOCK_WAIT_MS || 20 * 60 * 1000);
const LOCK_RELEASE_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

async function withCosyVoiceLock<T>(opts: {
  fn: () => Promise<T>;
  onWaiting?: () => Promise<void>;
  onAcquired?: (waitMs: number) => Promise<void>;
}): Promise<T> {
  const token = randomUUID();
  const deadline = Date.now() + COSYVOICE_LOCK_WAIT_MS;
  const waitStartedAt = Date.now();
  let waitingNotified = false;

  while (Date.now() < deadline) {
    const acquired = await redisConnection.set(
      COSYVOICE_LOCK_KEY,
      token,
      "PX",
      COSYVOICE_LOCK_TTL_MS,
      "NX"
    );
    if (acquired === "OK") {
      try {
        await opts.onAcquired?.(Date.now() - waitStartedAt);
        return await opts.fn();
      } finally {
        await redisConnection.eval(LOCK_RELEASE_SCRIPT, 1, COSYVOICE_LOCK_KEY, token).catch(() => {});
      }
    }
    if (!waitingNotified) {
      waitingNotified = true;
      await opts.onWaiting?.();
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting ${Math.round(COSYVOICE_LOCK_WAIT_MS / 60000)} minutes for CosyVoice capacity`);
}

/**
 * Wrap raw 16-bit mono PCM bytes (what the CosyVoice FastAPI server's
 * StreamingResponse actually returns — no WAV header) in a standard 44-byte
 * WAV container so the result is playable audio.
 */
function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (16-bit mono)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Synthesize speech for `text` by cloning the voice in `promptWav` (CosyVoice
 * 2's cross-lingual inference mode). This is the correct mode for languages
 * CosyVoice has no built-in preset speaker for (e.g. German/Hindi/French/
 * Spanish) — it speaks the target text in the cloned voice regardless of
 * language. Returns a playable WAV buffer.
 */
export async function synthesizeCrossLingual(text: string, promptWav: Buffer, lockCallbacks?: {
  onWaiting?: () => Promise<void>;
  onAcquired?: (waitMs: number) => Promise<void>;
}): Promise<Buffer> {
  return withCosyVoiceLock({ ...lockCallbacks, fn: async () => {
    const form = new FormData();
    form.append("tts_text", text);
    form.append("prompt_wav", new Blob([new Uint8Array(promptWav)], { type: "audio/wav" }), "prompt.wav");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Number(process.env.COSYVOICE_REQUEST_TIMEOUT_MS || 16 * 60 * 1000));
    const startedAt = Date.now();
    try {
      const res = await fetch(`${COSYVOICE_API_URL}/inference_cross_lingual`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`CosyVoice HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      }
      const pcm = Buffer.from(await res.arrayBuffer());
      console.log(`[cosyvoice] synthesis completed in ${Date.now() - startedAt}ms; pcm=${pcm.length} bytes`);
      return pcmToWav(pcm);
    } catch (error) {
      console.error(`[cosyvoice] synthesis failed after ${Date.now() - startedAt}ms: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }});
}
