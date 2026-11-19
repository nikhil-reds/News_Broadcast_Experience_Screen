/**
 * German Transcript Worker
 * ------------------------
 * Consumes the "german-transcript" queue: translates a saved English
 * transcript into German via Qwen and saves it to MinIO as `<filename>.de.txt`.
 *
 *     npm run worker:german-transcript
 */
import "dotenv/config";
import { startTranslationWorker } from "@/lib/translation-worker";

const worker = startTranslationWorker({ queue: "german-transcript", language: "German", langCode: "de" });

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
