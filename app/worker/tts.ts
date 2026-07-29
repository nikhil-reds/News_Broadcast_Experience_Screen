/**
 * Combined TTS (Audio Conversion) Workers Launcher
 * --------------------------------------------------
 * Starts all 4 per-language CosyVoice 2 audio-conversion workers
 * (german-audio, hindi-audio, french-audio, spanish-audio) in a single
 * process, for convenient local development.
 *
 *     npm run worker:tts
 *
 * Each can also be run standalone (e.g. to scale onto separate machines):
 *     npm run worker:german-audio
 *     npm run worker:hindi-audio
 *     npm run worker:french-audio
 *     npm run worker:spanish-audio
 */
import "dotenv/config";
import { startAudioConversionWorker } from "@/lib/audio-conversion-worker";
import { AUDIO_LANGUAGES } from "@/lib/queue";

const workers = AUDIO_LANGUAGES.map((opts) => startAudioConversionWorker(opts));

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
