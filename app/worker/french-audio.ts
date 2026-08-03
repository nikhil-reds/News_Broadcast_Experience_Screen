/**
 * French Audio Worker
 * --------------------
 * Consumes the "french-audio" queue: synthesizes Gemini TTS speech for the
 * persisted French translation and saves it to MinIO as `<filename>.fr.wav`.
 *
 *     npm run worker:french-audio
 */
import "dotenv/config";
import { startAudioConversionWorker } from "@/lib/audio-conversion-worker";

const worker = startAudioConversionWorker({ queue: "french-audio", language: "French", langCode: "fr" });

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
