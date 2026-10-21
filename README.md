# News Broadcast Experience

Interactive multi-camera broadcast system built with Next.js, React,
TypeScript, PostgreSQL, MinIO, Redis/BullMQ, FFmpeg, Whisper, Qwen, and
CosyVoice.

Detailed design notes are in [news-broadcast-system-documentation.md](news-broadcast-system-documentation.md).

## Supported commands

The project exposes only two npm scripts:

```bash
npm run dev
npm run worker:all
```

Run them in separate terminals. The old `script/` utilities, seed commands,
requeue commands, and individual worker commands have been removed.

To run the worker startup health check without adding another npm script:

```bash
npx tsx script/worker-health.ts
```

The check starts each worker entry point independently, waits for its ready
signal, stops the test process, and writes an ignored report to
`script/worker-health/results/latest.json`. It validates startup and service
connectivity; it does not submit production media jobs.

For the worker performance baseline, run:

```bash
npx tsx script/worker-performance/run-all.ts
```

This measures per-worker startup latency and runner memory without submitting
media jobs. Set `WORKER_PERF_RUNS=3` for repeated runs or
`WORKER_PERF_TIMEOUT_MS=60000` to change the timeout. Results are written to
`script/worker-performance/results/latest.json` and `latest.csv`.

## Complete script and worker reference

The following table lists every executable file currently used for worker
operation or worker testing. Run direct worker files only for debugging. For
normal operation, use `npm run worker:all`.

| File | What it does | Command |
| --- | --- | --- |
| `script/run-workers.mjs` | Starts the production worker groups as separate Node processes. | `node script/run-workers.mjs` or `npm run worker:all` |
| `script/worker-health.ts` | Starts every worker individually, checks its ready signal, stops it, and writes a JSON report. | `npx tsx script/worker-health.ts` |
| `app/worker/all.ts` | Starts the main workers in one process for legacy/manual debugging. | `npx tsx app/worker/all.ts` |
| `app/worker/video.ts` | Starts the FFmpeg-heavy video export, highlight, and green-screen workers together. | `npx tsx app/worker/video.ts` |
| `app/worker/audio-transcription.ts` | Consumes audio jobs and creates timestamped transcripts through Whisper. | `npx tsx app/worker/audio-transcription.ts` |
| `app/worker/highlight-analysis.ts` | Analyses camera recordings and transcript timing to create highlight manifests. | `npx tsx app/worker/highlight-analysis.ts` |
| `app/worker/highlight-reel.ts` | Renders selected camera segments into highlight reels with FFmpeg. | `npx tsx app/worker/highlight-reel.ts` |
| `app/worker/translations.ts` | Starts the four transcript translation workers. | `npx tsx app/worker/translations.ts` |
| `app/worker/german-transcript.ts` | Translates transcript segments into German. | `npx tsx app/worker/german-transcript.ts` |
| `app/worker/hindi-transcript.ts` | Translates transcript segments into Hindi. | `npx tsx app/worker/hindi-transcript.ts` |
| `app/worker/french-transcript.ts` | Translates transcript segments into French. | `npx tsx app/worker/french-transcript.ts` |
| `app/worker/spanish-transcript.ts` | Translates transcript segments into Spanish. | `npx tsx app/worker/spanish-transcript.ts` |
| `app/worker/tts.ts` | Starts the four translated-audio workers. | `npx tsx app/worker/tts.ts` |
| `app/worker/german-audio.ts` | Generates German audio from translated transcript text. | `npx tsx app/worker/german-audio.ts` |
| `app/worker/hindi-audio.ts` | Generates Hindi audio from translated transcript text. | `npx tsx app/worker/hindi-audio.ts` |
| `app/worker/french-audio.ts` | Generates French audio from translated transcript text. | `npx tsx app/worker/french-audio.ts` |
| `app/worker/spanish-audio.ts` | Generates Spanish audio from translated transcript text. | `npx tsx app/worker/spanish-audio.ts` |
| `app/worker/green-screen-compose.ts` | Removes the speaker background and composites the result over a selected background. | `npx tsx app/worker/green-screen-compose.ts` |
| `app/worker/video-export.ts` | Produces final videos with subtitles, orientation, backgrounds, and advertisements. | `npx tsx app/worker/video-export.ts` |
| `app/worker/watchdog.ts` | Detects stale generation tasks and re-enqueues recoverable jobs. | `npx tsx app/worker/watchdog.ts` |

All commands require the local `.env`, Redis, PostgreSQL, MinIO, and any
required AI services to be available. Stop a foreground worker with `Ctrl+C`.

## Requirements

- Node.js and npm
- PostgreSQL 16, Redis 7, and MinIO
- FFmpeg and FFprobe
- Docker Desktop and Docker Compose (recommended)
- Whisper, Qwen/Ollama, CosyVoice, and optional RVM dependencies

Install packages:

```bash
npm install
```

## Local services

The root `compose.yaml` provides:

| Service | Purpose | Port |
| --- | --- | ---: |
| `db` | PostgreSQL metadata | `38472` |
| `redis` | BullMQ queues and transient state | `6379` |
| `minio` | S3-compatible media storage | `9000`, `9001` |
| `whisper` | Faster-Whisper API | `8000` |
| `qwen` | Ollama translation model | `11434` |
| `cosyvoice` | Local text-to-speech | `9500` |

```bash
docker compose up -d
docker compose ps
docker compose down
```

Create a local `.env` file for database, Redis, MinIO, and AI-service values.
Never commit credentials or API keys.

## Database

After PostgreSQL is running, apply migrations:

```bash
npx prisma migrate deploy
```

The schema is in [`../prisma/schema.prisma`](../prisma/schema.prisma), with
history in [`../prisma/migrations`](../prisma/migrations).

## End-to-end flow

```text
Camera / microphone
        |
        v
Next.js pages and API routes
        |
        +--> PostgreSQL: sessions, jobs, settings
        +--> MinIO: recordings, transcripts, audio, videos, assets
        +--> Redis/BullMQ: asynchronous jobs
                                      |
                                      v
                              npm run worker:all
                                      |
       audio/STT -> highlights -> translation -> TTS -> video/export
                                      |
                                      v
                         Published media for Screens 1–12
```

1. The camera page captures video/audio and sends it to the recording APIs.
2. Recordings are stored in MinIO and attached to a broadcast session.
3. BullMQ jobs are created for transcription, highlights, translations,
   translated audio, background composition, and video export.
4. Workers process jobs and persist generation progress and heartbeats.
5. The screen publication API exposes the latest finished media and settings.
6. Screens poll publication state and render the current broadcast experience.

## Worker processing

`npm run worker:all` starts `script/run-workers.mjs`, which launches the
production worker groups covering:

- Audio transcription
- Highlight analysis and reel generation
- German, Hindi, French, and Spanish transcript translation
- German, Hindi, French, and Spanish audio generation
- Text-to-speech orchestration
- Green-screen composition
- Video export
- Watchdog and generation-heartbeat recovery

Restart the complete worker process with `npm run worker:all`; individual
launchers under `script/` no longer exist.

## Screen map

| Screen | Purpose |
| --- | --- |
| 1–3 | Camera 1, 2, and 3 playback |
| 4 | English transcript / teleprompter |
| 5 | Translated audio-language playback |
| 6 | Brightness-controlled playback |
| 7 | Background-selected edited highlight reel |
| 8 | Subtitle and transcript experience |
| 9–10 | Advertisement placement and campaigns |
| 11 | Portrait final preview |
| 12 | Landscape final preview |

Screen routes are under `app/(screens)/`. Admin and control-room pages are
under `app/(admin)/admin/`.

## Main API areas

- Sessions and recordings: `/api/sessions`, `/api/save-recording`,
  `/api/save-audio`
- Transcription: `/api/transcribe`, `/api/transcript/*`, `/api/subtitle-cues`
- Translation: `/api/translate`
- Audio language: `/api/audio-language/*`
- Brightness: `/api/brightness/selection`
- Green screen: `/api/green-screen/*`
- Video export: `/api/video-export/*`
- Advertisements: `/api/ad-campaigns/*`
- Screen publication: `/api/screens/[screenId]/publication`
- Media objects: `/api/asset/*` and `/api/asset-stream/*`

## Storage and media

PostgreSQL stores sessions, metadata, campaigns, generation tasks, and job
state. MinIO stores recordings, transcripts, translated audio, videos,
backgrounds, and advertisement assets. Browser components should use the
application asset routes instead of hard-coded MinIO URLs.

## Background removal

Screen 7 supports RVM matting with optional FFmpeg chromakey fallback. RVM is
a local dependency and is not installed by `npm install`.

```env
GREEN_SCREEN_ENGINE=rvm
GREEN_SCREEN_FALLBACK_CHROMAKEY=true
RVM_MODEL=mobilenetv3
RVM_DEVICE=cpu
```

RVM helper files and requirements are in `tools/rvm/`.

## Development workflow

1. Start services: `docker compose up -d`.
2. Apply migrations: `npx prisma migrate deploy`.
3. Start workers: `npm run worker:all`.
4. Start the web app: `npm run dev`.
5. Use the admin control room to inspect sessions, tasks, recordings,
   transcripts, translations, exports, workers, and settings.
6. Open the screen routes to validate published media.

## Troubleshooting

- Jobs stalled: run `docker compose ps`, check Redis, and compare `.env` values
  used by the web and worker processes.
- Missing media: confirm MinIO and the expected object key in the admin task.
- STT/translation failure: confirm Whisper and Qwen model services are healthy.
- Export failure: confirm FFmpeg, FFprobe, and available temporary disk space.
- Green-screen failure: confirm the RVM environment/model or enable fallback.

## Repository layout

```text
app/            Next.js pages, API handlers, and workers
components/     Shared React components
lib/            Database, storage, queue, media, and state modules
prisma/         Schema and migrations
public/         Backgrounds, advertisements, and local assets
tools/rvm/      RVM helper scripts and requirements
compose.yaml    Local infrastructure and AI services
```

Generated folders such as `.next/`, `.tmp/`, and local virtual environments
are not source files and should not be committed.
