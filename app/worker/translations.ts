/**
 * Combined Translation Workers Launcher
 * --------------------------------------
 * Starts all 4 per-language transcript translation workers (german-transcript,
 * hindi-transcript, french-transcript, spanish-transcript) in a single process,
 * for convenient local development.
 *
 *     npm run worker:translations
 *
 * Each can also be run standalone (e.g. to scale onto separate machines):
 *     npm run worker:german-transcript
 *     npm run worker:hindi-transcript
 *     npm run worker:french-transcript
 *     npm run worker:spanish-transcript
 */
import "dotenv/config";
import { startTranslationWorker } from "@/lib/translation-worker";
import { TRANSLATION_LANGUAGES } from "@/lib/queue";

const workers = TRANSLATION_LANGUAGES.map((opts) => startTranslationWorker(opts));

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
