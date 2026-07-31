const COSYVOICE_API_URL = (process.env.COSYVOICE_API_URL || "http://localhost:9500").replace(/\/$/, "");
const SAMPLE_RATE = Number(process.env.COSYVOICE_SAMPLE_RATE || 24000);

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
export async function synthesizeCrossLingual(text: string, promptWav: Buffer): Promise<Buffer> {
  const form = new FormData();
  form.append("tts_text", text);
  form.append("prompt_wav", new Blob([new Uint8Array(promptWav)], { type: "audio/wav" }), "prompt.wav");

  const controller = new AbortController();
  // CosyVoice on CPU can be slow; allow up to 5 minutes (same as Whisper/Qwen).
  const timeoutId = setTimeout(() => controller.abort(), 300000);
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
    return pcmToWav(pcm);
  } finally {
    clearTimeout(timeoutId);
  }
}
