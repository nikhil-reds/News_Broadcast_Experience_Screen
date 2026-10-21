export type WorkerDefinition = {
  name: string;
  entry: string;
  group: string;
};

export const WORKERS: WorkerDefinition[] = [
  { name: "audio-transcription", entry: "app/worker/audio-transcription.ts", group: "audio" },
  { name: "highlight-analysis", entry: "app/worker/highlight-analysis.ts", group: "analysis" },
  { name: "highlight-reel", entry: "app/worker/highlight-reel.ts", group: "video" },
  { name: "german-transcript", entry: "app/worker/german-transcript.ts", group: "translation" },
  { name: "hindi-transcript", entry: "app/worker/hindi-transcript.ts", group: "translation" },
  { name: "french-transcript", entry: "app/worker/french-transcript.ts", group: "translation" },
  { name: "spanish-transcript", entry: "app/worker/spanish-transcript.ts", group: "translation" },
  { name: "german-audio", entry: "app/worker/german-audio.ts", group: "tts" },
  { name: "hindi-audio", entry: "app/worker/hindi-audio.ts", group: "tts" },
  { name: "french-audio", entry: "app/worker/french-audio.ts", group: "tts" },
  { name: "spanish-audio", entry: "app/worker/spanish-audio.ts", group: "tts" },
  { name: "translations", entry: "app/worker/translations.ts", group: "translation" },
  { name: "tts", entry: "app/worker/tts.ts", group: "tts" },
  { name: "green-screen-compose", entry: "app/worker/green-screen-compose.ts", group: "video" },
  { name: "video-export", entry: "app/worker/video-export.ts", group: "video" },
  { name: "watchdog", entry: "app/worker/watchdog.ts", group: "recovery" },
];

export const timeoutMs = Number(process.env.WORKER_PERF_TIMEOUT_MS || 20_000);
export const runs = Math.max(1, Number(process.env.WORKER_PERF_RUNS || 1));
