/**
 * Hindi Transcript Worker
 * -----------------------
 * Consumes the "hindi-transcript" queue: translates a saved English
 * transcript into Hindi via Qwen and saves it to MinIO as `<filename>.hi.txt`.
 *
 *     npm run worker:hindi-transcript
 */
import "dotenv/config";
import { startTranslationWorker } from "@/lib/translation-worker";

const worker = startTranslationWorker({ queue: "hindi-transcript", language: "Hindi", langCode: "hi" });

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
