/**
 * French Transcript Worker
 * ------------------------
 * Consumes the "french-transcript" queue: translates a saved English
 * transcript into French via Qwen and saves it to MinIO as `<filename>.fr.txt`.
 *
 *     npm run worker:french-transcript
 */
import "dotenv/config";
import { startTranslationWorker } from "@/lib/translation-worker";

const worker = startTranslationWorker({ queue: "french-transcript", language: "French", langCode: "fr" });

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
