/**
 * Combined Video Workers Launcher
 * --------------------------------
 * Starts the three ffmpeg-heavy workers (video-export, highlight-reel,
 * green-screen-compose) in one process — grouped together because they're
 * all CPU-bound ffmpeg work, and isolated from the lighter-weight
 * transcription/translation/TTS/Gemini workers (see app/worker/audio-
 * transcription.ts, app/worker/highlight-analysis.ts, app/worker/
 * translations.ts, app/worker/tts.ts) so a stuck/slow export can't starve
 * their Redis connections of event-loop time — exactly the failure mode
 * observed when every worker shared one process (see docs/generation-
 * pipeline.md).
 *
 *     npm run worker:video
 *
 * Each still runs standalone too, e.g. to scale onto separate machines:
 *     npm run worker:video-export
 *     npm run worker:highlight
 *     npm run worker:green-screen
 */
import "dotenv/config";
import "@/app/worker/video-export";
import "@/app/worker/highlight-reel";
import "@/app/worker/green-screen-compose";

// Each imported module registers its own SIGINT/SIGTERM handler and calls
// process.exit(0) once it's closed — same pattern as app/worker/all.ts.
