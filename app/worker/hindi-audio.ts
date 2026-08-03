/**
 * Hindi Audio Worker
 * ------------------
 * Consumes the "hindi-audio" queue: synthesizes Gemini TTS speech for the
 * persisted Hindi translation and saves it to MinIO as `<filename>.hi.wav`.
 *
 *     npm run worker:hindi-audio
 */
import "dotenv/config";
import { startAudioConversionWorker } from "@/lib/audio-conversion-worker";

const worker = startAudioConversionWorker({ queue: "hindi-audio", language: "Hindi", langCode: "hi" });

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
