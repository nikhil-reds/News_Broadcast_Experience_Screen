/**
 * German Audio Worker
 * --------------------
 * Consumes the "german-audio" queue: synthesizes CosyVoice 2 speech (cloning
 * the original broadcast's voice) for the persisted German translation and
 * saves it to MinIO as `<filename>.de.wav`.
 *
 *     npm run worker:german-audio
 */
import "dotenv/config";
import { startAudioConversionWorker } from "@/lib/audio-conversion-worker";

const worker = startAudioConversionWorker({ queue: "german-audio", language: "German", langCode: "de" });

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
