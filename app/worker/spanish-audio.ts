/**
 * Spanish Audio Worker
 * ---------------------
 * Consumes the "spanish-audio" queue: synthesizes CosyVoice 2 speech (cloning
 * the original broadcast's voice) for the persisted Spanish translation and
 * saves it to MinIO as `<filename>.es.wav`.
 *
 *     npm run worker:spanish-audio
 */
import "dotenv/config";
import { startAudioConversionWorker } from "@/lib/audio-conversion-worker";

const worker = startAudioConversionWorker({ queue: "spanish-audio", language: "Spanish", langCode: "es" });

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
