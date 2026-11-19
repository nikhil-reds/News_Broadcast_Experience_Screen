import { CHATTERBOX_CHECKPOINT, CHATTERBOX_REVISION, type VoiceId } from "./voice-profiles";
const CHATTERBOX_API_URL = (process.env.CHATTERBOX_API_URL || "http://localhost:9600").replace(/\/$/, "");
export const CHATTERBOX_MODEL = process.env.CHATTERBOX_MODEL || "chatterbox-multilingual-v3";
export const CHATTERBOX_TIMEOUT_MS = Number(process.env.CHATTERBOX_REQUEST_TIMEOUT_MS || 20 * 60 * 1000);

export type ChatterboxLanguage = "de" | "hi" | "fr" | "es";

export async function synthesizeChatterbox(
  text: string,
  languageId: ChatterboxLanguage,
  voiceId: VoiceId
): Promise<Buffer> {
  const form = new FormData();
  form.append("text", text);
  form.append("language_id", languageId);
  form.append("voice_id", voiceId);
  form.append("model", CHATTERBOX_MODEL);
  form.append("exaggeration", "0.5");
  form.append("cfg_weight", "0.5");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHATTERBOX_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${CHATTERBOX_API_URL}/synthesize`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Chatterbox HTTP ${response.status}: ${await response.text().catch(() => "")}`);
    }
    if (response.headers.get("X-Chatterbox-Checkpoint") !== CHATTERBOX_CHECKPOINT ||
        response.headers.get("X-Chatterbox-Revision") !== CHATTERBOX_REVISION ||
        response.headers.get("X-Voice-Id") !== voiceId) {
      throw new Error("Chatterbox returned an unverified model or voice");
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF") {
      throw new Error("Chatterbox returned an invalid WAV response");
    }
    console.log(`[chatterbox] ${languageId} synthesis completed in ${Date.now() - startedAt}ms; wav=${audio.length} bytes`);
    return audio;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function concatWav(chunks: Buffer[]): Buffer {
  if (!chunks.length) throw new Error("No synthesized audio chunks");
  const pcm = Buffer.concat(chunks.map((wav) => wav.subarray(wav.toString("ascii", 0, 4) === "RIFF" ? 44 : 0)));
  const header = Buffer.from(chunks[0].subarray(0, 44));
  header.writeUInt32LE(36 + pcm.length, 4);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
