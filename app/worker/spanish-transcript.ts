/**
 * Spanish Transcript Worker
 * -------------------------
 * Consumes the "spanish-transcript" queue: translates a saved English
 * transcript into Spanish via Qwen and saves it to MinIO as `<filename>.es.txt`.
 *
 *     npm run worker:spanish-transcript
 */
import "dotenv/config";
import { startTranslationWorker } from "@/lib/translation-worker";

const worker = startTranslationWorker({ queue: "spanish-transcript", language: "Spanish", langCode: "es" });

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
