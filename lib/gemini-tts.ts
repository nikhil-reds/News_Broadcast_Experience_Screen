/**
 * Gemini text-to-speech client — same plain-fetch shape as lib/qwen.ts and
 * lib/cosyvoice.ts. Uses a dedicated preview TTS model rather than
 * GEMINI_MODEL (lib/gemini.ts): gemini-2.5-pro has zero free-tier quota (see
 * project memory), and the TTS models are separate from the text ones anyway.
 *
 * Unlike CosyVoice's cross-lingual cloning, Gemini TTS has no reference-audio
 * input — it speaks with one of its own preset voices, picking the output
 * language from the text itself.
 */

const GEMINI_API_BASE = (
  process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com"
).replace(/\/$/, "");

export const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
/** One of Gemini's prebuilt voices; see ai.google.dev/gemini-api/docs/speech-generation. */
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || "Kore";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set — add it to .env before running this worker.");
  }
  return key;
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return `${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ""}`;
}

/**
 * Gemini's TTS response is raw 16-bit little-endian PCM (no container) —
 * same situation as CosyVoice's StreamingResponse. Wrap it in a standard
 * 44-byte WAV header so the result is playable audio.
 */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
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

/** Pull the sample rate out of a `audio/L16;codec=pcm;rate=24000`-style mime type. */
function sampleRateFromMimeType(mimeType: string): number {
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? Number(match[1]) : 24000;
}

/**
 * Synthesize speech for `text` via Gemini's TTS model. Gemini auto-detects
 * the spoken language from the text itself, so pass it the already-translated
 * string (German/Hindi/French/Spanish) and it comes back speaking that
 * language in the configured preset voice. Returns a playable WAV buffer.
 */
export async function synthesizeGeminiSpeech(text: string): Promise<Buffer> {
  const controller = new AbortController();
  // Same generous timeout as the other model clients in this repo.
  const timeoutId = setTimeout(() => controller.abort(), 300000);

  try {
    const res = await fetch(
      `${GEMINI_API_BASE}/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } },
            },
          },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      throw new Error(`Gemini TTS generateContent failed: ${await readError(res)}`);
    }

    const body = await res.json();
    const candidate = body.candidates?.[0];
    const inline = candidate?.content?.parts?.[0]?.inlineData;
    if (!inline?.data) {
      throw new Error(
        `Gemini TTS returned no audio (finishReason: ${candidate?.finishReason || "unknown"})`
      );
    }

    const pcm = Buffer.from(inline.data, "base64");
    return pcmToWav(pcm, sampleRateFromMimeType(inline.mimeType || ""));
  } finally {
    clearTimeout(timeoutId);
  }
}
