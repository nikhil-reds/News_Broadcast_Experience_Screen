/**
 * Combined All-Workers Launcher
 * ------------------------------
 * Starts every BullMQ worker in this project — transcription, the two
 * highlight-reel stages (Gemini analysis, then ffmpeg render), all 4
 * transcript-translation workers, all 4 Gemini TTS audio workers,
 * green-screen compose, and video-export — in a single process, for
 * convenient local development.
 *
 *     npm run worker:all
 *
 * Each still runs standalone too (e.g. to scale onto separate machines):
 *     npm run worker:audio
 *     npm run worker:highlight-analysis
 *     npm run worker:highlight
 *     npm run worker:translations   (or the 4 worker:<lang>-transcript scripts)
 *     npm run worker:tts             (or the 4 worker:<lang>-audio scripts)
 *     npm run worker:green-screen
 *     npm run worker:video-export
 *
 * Every imported module registers its own SIGINT/SIGTERM handler and starts
 * closing on Ctrl+C; whichever finishes first calls process.exit(0) for the
 * whole process. That's fine for local dev — for a production deployment
 * that needs a clean drain per worker, run the standalone scripts instead.
 */
import "dotenv/config";
import "@/app/worker/audio-transcription";
import "@/app/worker/highlight-analysis";
import "@/app/worker/highlight-reel";
import "@/app/worker/translations";
import "@/app/worker/tts";
import "@/app/worker/green-screen-compose";
import "@/app/worker/video-export";
