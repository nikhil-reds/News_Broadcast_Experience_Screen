# News Broadcast Experience - Client Application Flow And Technology Guide

## 1. Executive Overview

The News Broadcast Experience is an interactive multi-screen studio application. It records three camera feeds and one master audio feed, stores all media safely, processes the recordings in the background, and publishes ready-to-play outputs across twelve screens.

The application is designed for a physical broadcast-style installation where an operator can:

- Record a session from three camera angles.
- Capture clean master audio.
- Generate an English transcript.
- Translate subtitles and speech into multiple languages.
- Create an edited highlight reel from the three camera recordings.
- Replace the video background using AI matting.
- Add advertisement layouts.
- Preview final portrait and landscape broadcast outputs.

The system is built so screens do not break while processing is still running. Each screen keeps showing the last good output until the next generation is fully ready.

## 2. High-Level Application Flow

```text
Operator starts recording
        |
        v
Three camera videos + master audio are captured
        |
        v
Files are uploaded to MinIO and metadata is saved in PostgreSQL
        |
        v
BullMQ background jobs are queued
        |
        v
Workers process transcript, translations, audio, edits, backgrounds, and exports
        |
        v
Screen readiness is tracked in PostgreSQL
        |
        v
Screens publish the latest completed generation
```

Every full recording cycle is treated as a "generation". A generation represents one complete take containing all camera recordings, master audio, and the generated outputs derived from them.

## 3. Main User Journey

1. The operator opens the control room application.
2. The operator goes to the camera studio page.
3. The application detects available camera and microphone devices.
4. The operator starts recording.
5. The app creates a `BroadcastSession` record.
6. Three camera recorders and one audio recorder capture media together.
7. The operator stops recording.
8. The app uploads camera videos and master audio.
9. The backend stores files in MinIO and metadata in PostgreSQL.
10. Background workers start processing the uploaded media.
11. The screens poll for readiness and update only when their required outputs are complete.
12. The operator can choose background, subtitle language, audio language, and final preview format.

## 4. Screen-By-Screen Flow

### Screen 01 - Camera 01 Footage

Screen 01 shows the latest Camera 01 recording. It is used as the main raw camera monitor.

Flow:

```text
Camera 01 upload -> video metadata saved -> Screen 01 loads latest Camera 01 video
```

### Screen 02 - Camera 02 Footage

Screen 02 shows the latest Camera 02 recording. It gives the operator a second angle for review.

Flow:

```text
Camera 02 upload -> video metadata saved -> Screen 02 loads latest Camera 02 video
```

### Screen 03 - Camera 03 Footage

Screen 03 shows the latest Camera 03 recording. It gives the operator a third angle for review.

Flow:

```text
Camera 03 upload -> video metadata saved -> Screen 03 loads latest Camera 03 video
```

### Screen 04 - Audio In Text

Screen 04 shows the English transcript from the master audio. It behaves like a teleprompter, highlighting the active transcript segment as the audio plays.

Flow:

```text
Master audio upload -> transcription worker -> transcript saved -> Screen 04 displays text
```

### Screen 05 - Multi-Language Audio

Screen 05 lets users switch between original English audio and translated audio tracks.

Supported language flow:

```text
English transcript -> translation worker -> translated text -> TTS worker -> translated WAV audio
```

Languages currently handled by the worker pipeline:

- German
- Hindi
- French
- Spanish

### Screen 06 - Edited Highlight Reel

Screen 06 plays the generated multi-camera highlight reel. This reel is created from the three camera recordings.

Flow:

```text
Three camera videos -> highlight analysis worker -> selected segments -> highlight reel worker -> edited MP4
```

### Screen 07 - Background Change Video

Screen 07 lets the operator choose a new background for the edited highlight reel.

Available backgrounds:

- Newsroom Blue
- City Skyline
- World Map
- Sunrise Studio
- Corporate Grey

Current background-removal approach:

```text
Edited highlight reel
      |
      v
RVM creates foreground + alpha matte
      |
      v
Matte files are cached in MinIO
      |
      v
FFmpeg composites the subject over each selected background
      |
      v
Screen 07 displays the composited MP4
```

The first background for a reel takes longer because it creates the RVM matte. Other backgrounds reuse the cached matte and complete much faster.

If RVM fails, the system can fall back to chromakey when `GREEN_SCREEN_FALLBACK_CHROMAKEY=true`. Each output writes metadata showing whether it used true RVM or fallback chromakey.

### Screen 08 - Subtitle Language Change

Screen 08 previews translated subtitles over the video. The selected subtitle language is stored on the current generation/session so final previews can use the same choice.

Flow:

```text
Transcript -> translated transcript segments -> subtitle overlay -> selected language saved
```

### Screen 09 - Advertisement Banner Video

Screen 09 displays a sponsored broadcast layout. It combines the current video with advertising graphics.

Flow:

```text
Active video output -> ad creative selection -> broadcast layout with ad frame
```

### Screen 10 - Advertisement Mirror

Screen 10 is another ad-supported broadcast view. It can use active campaigns from the backend or fallback campaign content.

Flow:

```text
Video output -> active ad campaign -> bottom campaign rail / sponsor layout
```

### Screen 11 - Final Portrait Preview

Screen 11 shows a mobile portrait version of the final broadcast output.

Flow:

```text
Highlight reel + selected background + selected audio/subtitle + ads -> portrait export
```

### Screen 12 - Final Landscape Preview

Screen 12 shows the landscape final broadcast output.

Flow:

```text
Highlight reel + selected background + selected audio/subtitle + ads -> landscape export
```

## 5. Background Worker Architecture

Heavy media and AI operations do not run directly inside browser requests. Instead, the app queues jobs in Redis/BullMQ and separate workers process them asynchronously.

This keeps the UI responsive and allows the application to recover from slow or failed processing jobs.

### Worker Supervisor

Command:

```bash
npm run worker:all
```

Supervisor file:

```text
scripts/run-workers.mjs
```

The supervisor starts these process groups:

| Group | Entry File | Purpose |
|---|---|---|
| `video` | `app/worker/video.ts` | Runs video-heavy workers together: highlight reel, green-screen compose, and video export. |
| `audio` | `app/worker/audio-transcription.ts` | Runs speech-to-text transcription. |
| `analysis` | `app/worker/highlight-analysis.ts` | Runs AI highlight analysis. |
| `translations` | `app/worker/translations.ts` | Runs all transcript translation workers. |
| `tts` | `app/worker/tts.ts` | Runs all translated audio generation workers. |
| `watchdog` | `app/worker/watchdog.ts` | Monitors stuck or orphaned jobs and recovers when possible. |

## 6. Explanation Of Each Worker

### Audio Transcription Worker

File:

```text
app/worker/audio-transcription.ts
```

Queue:

```text
audio-transcription
```

What it does:

- Downloads the master audio from MinIO.
- Sends it to the faster-whisper transcription service.
- Saves the English transcript and SRT-style segment timing.
- Stores transcript records in PostgreSQL.
- Queues translation jobs when speech segments are available.

Why it exists:

Transcription can be slow and should not block the recording/upload API request.

### Highlight Analysis Worker

File:

```text
app/worker/highlight-analysis.ts
```

Queue:

```text
highlight-analysis
```

What it does:

- Receives the three camera video filenames.
- Uses Gemini to decide which moments are useful for the edited reel.
- Produces a structured list of camera segments.
- Queues the highlight reel render job.

Why it exists:

AI analysis is separated from video rendering so model failures and FFmpeg failures can be retried independently.

### Highlight Reel Worker

File:

```text
app/worker/highlight-reel.ts
```

Queue:

```text
highlight-reel
```

What it does:

- Downloads the three camera videos.
- Cuts selected segments with FFmpeg.
- Synchronizes the chosen clips with master audio.
- Concatenates the clips into one edited highlight reel.
- Uploads the final reel back to MinIO.
- Queues background composition jobs for Screen 07.

Why it exists:

Video cutting and encoding are CPU-heavy and need retry/timeout handling outside the UI.

### Green-Screen Compose Worker

File:

```text
app/worker/green-screen-compose.ts
```

Queue:

```text
green-screen-compose
```

What it does:

- Downloads the edited highlight reel.
- Runs Robust Video Matting using local Python/Torch.
- Produces foreground and alpha matte files.
- Validates the matte outputs.
- Caches the matte files in MinIO.
- Uses FFmpeg to composite the subject over the selected background.
- Uploads the composited MP4 and metadata.

Why it exists:

Background removal is one of the heaviest parts of the pipeline. Caching the RVM matte once per reel makes all later background choices much faster.

Current RVM behavior:

- Primary engine: RVM.
- Fallback engine: FFmpeg chromakey, only if enabled.
- Matte timeout: configured through `RVM_TIMEOUT_MS`.
- Matte cache wait: configured through `RVM_MATTE_WAIT_TIMEOUT_MS`.

### Translation Workers

Files:

```text
app/worker/german-transcript.ts
app/worker/hindi-transcript.ts
app/worker/french-transcript.ts
app/worker/spanish-transcript.ts
app/worker/translations.ts
```

Queues:

```text
german-transcript
hindi-transcript
french-transcript
spanish-transcript
```

What they do:

- Receive English transcript segments.
- Translate each segment while preserving timing.
- Save translated text files to MinIO.
- Store translated transcript records in PostgreSQL.
- Queue translated audio generation jobs.

Why they exist:

Each language is isolated into its own queue so one slow language does not block the others.

### TTS / Audio Conversion Workers

Files:

```text
app/worker/german-audio.ts
app/worker/hindi-audio.ts
app/worker/french-audio.ts
app/worker/spanish-audio.ts
app/worker/tts.ts
```

Queues:

```text
german-audio
hindi-audio
french-audio
spanish-audio
```

What they do:

- Receive translated text.
- Generate translated speech using CosyVoice when speaker reference is available.
- Fall back to Gemini TTS where required.
- Upload generated WAV audio to MinIO.
- Store translated audio records in PostgreSQL.

Why they exist:

Speech generation can be slow and language-specific. Dedicated queues make it observable and retryable.

### Video Export Worker

File:

```text
app/worker/video-export.ts
```

Queue:

```text
video-export
```

What it does:

- Builds final portrait or landscape videos for Screens 11 and 12.
- Combines highlight video, selected background, selected audio language, subtitles, and layout rules.
- Uploads the final output to MinIO.
- Updates screen publication state when the export is ready.

Why it exists:

Final exports are expensive FFmpeg jobs and must run outside the request/response path.

### Watchdog Worker

File:

```text
app/worker/watchdog.ts
```

What it does:

- Scans generation tasks.
- Detects stuck, missing, or orphaned jobs.
- Requeues recoverable jobs using saved task payloads.
- Marks unrecoverable jobs as failed.

Why it exists:

Media jobs can hang because of FFmpeg, AI services, Redis lock expiry, or worker crashes. The watchdog makes the system safer for continuous installation use.

## 7. Core Technologies Used And Why

### Next.js

Used for the web application, screen routes, and API routes.

Why:

- One framework handles UI and backend endpoints.
- App Router gives clear route organization.
- Good fit for a multi-screen browser-based installation.

### React

Used for all interactive screens and control panels.

Why:

- Component-based structure keeps twelve screens maintainable.
- Works well with browser media APIs.
- Supports live state updates and polling behavior.

### TypeScript

Used across frontend, backend, and workers.

Why:

- Safer media job payloads.
- Clearer API contracts.
- Fewer runtime mistakes in a queue-based system.

### Tailwind CSS

Used for screen styling and responsive layouts.

Why:

- Fast UI iteration.
- Consistent utility-based styling.
- Good for full-screen broadcast-style layouts.

### PostgreSQL

Used for durable metadata.

Why:

- Stores sessions, recordings, transcripts, translations, jobs, screen publication state, and ad campaigns.
- Reliable relational data model for generation tracking.

Important tables:

- `broadcast_sessions`
- `video_recordings`
- `audio_files`
- `generation_tasks`
- `screen_publications`
- `transcripts`
- `transcript_translations`
- `translation_audio`
- `video_jobs`
- `ad_campaigns`

### Prisma

Used as the database ORM.

Why:

- Type-safe database access.
- Clear schema definition.
- Easier migrations and model relationships.

### MinIO

Used for object storage.

Why:

- Stores large files outside PostgreSQL.
- S3-compatible API.
- Works locally without depending on cloud storage.

Stored file types:

- Camera recordings.
- Master audio.
- Transcript text files.
- Translated audio.
- Highlight reels.
- RVM matte files.
- Green-screen composites.
- Final exports.

### Redis

Used for fast queue and temporary state.

Why:

- Required by BullMQ.
- Fast job coordination.
- Useful for locks, cached status, and worker coordination.

### BullMQ

Used for background job queues.

Why:

- Retries failed jobs.
- Tracks waiting, active, completed, and failed states.
- Allows separate worker processes for heavy tasks.
- Prevents long-running media work from blocking the UI.

### FFmpeg And FFprobe

Used for media processing.

Why:

- Industry-standard video/audio toolchain.
- Cuts and joins camera clips.
- Encodes highlight reels.
- Composites backgrounds.
- Burns or aligns subtitles/audio for final exports.
- FFprobe validates duration and stream metadata.

### Robust Video Matting

Used for AI background removal on Screen 07.

Why:

- Produces a foreground video and alpha matte.
- Better than simple green chromakey when the input is not perfectly keyed.
- Matte caching makes repeated background renders efficient.

### OpenCV

Used inside the RVM Python script.

Why:

- Reads video frames.
- Writes foreground and alpha matte videos.
- Bridges video files into the Torch model pipeline.

### PyTorch / TorchVision

Used to run the RVM model.

Why:

- RVM is a Torch model.
- Supports CPU locally and can support GPU when configured.

### faster-whisper

Used for speech-to-text transcription.

Why:

- Faster and more practical than running large transcription models directly inside Node.js.
- Produces timestamped speech segments needed for subtitles and translation.

### Gemini

Used for AI highlight analysis and configured TTS fallback behavior.

Why:

- Can reason over media/context to choose highlight-worthy moments.
- Provides a practical fallback where local services are unavailable.

### Qwen / Translation Model

Used for transcript translation.

Why:

- Translates text segments while preserving timing.
- Keeps subtitle and translated speech timing aligned with the original recording.

### CosyVoice

Used for translated speech synthesis.

Why:

- Generates speech for translated language tracks.
- Can use a speaker reference to better match the source speaker.

### Sharp

Used for image/subtitle-related processing.

Why:

- Efficient image handling in Node.js.
- Useful for generated overlays and subtitle image assets.

### SerialPort

Used for hardware integration.

Why:

- Supports ESP32/Nexmosphere physical controls.
- Allows button/rotary inputs to control the installation experience.

## 8. Storage And Data Flow

### Media Storage

Media files are stored in MinIO buckets:

```text
audio
videos
transcripts
tts-audio
```

### Database Tracking

PostgreSQL stores metadata and status, not large media files.

Important records:

- `BroadcastSession`: one full recording generation.
- `VideoRecording`: raw and derived video objects.
- `AudioFile`: master audio objects.
- `Transcript`: English transcript.
- `TranscriptTranslation`: translated transcript.
- `TranslationAudio`: generated translated speech.
- `GenerationTask`: status/timing for each worker task.
- `ScreenPublication`: what each screen is currently allowed to show.

## 9. Generation Readiness Logic

The app does not immediately publish a new recording to every screen. Each screen has different requirements.

Examples:

- Screen 04 needs transcription.
- Screen 06 needs highlight analysis and highlight reel rendering.
- Screen 05 needs transcription, translations, and translated audio.
- Screen 07 depends on the selected background composite.
- Screens 11 and 12 depend on final export variants.

This prevents partially generated output from appearing on the client screens.

## 10. RVM Background Removal Details

Current local RVM configuration:

```env
GREEN_SCREEN_ENGINE=rvm
GREEN_SCREEN_FALLBACK_CHROMAKEY=true
GREEN_SCREEN_MATTING_VERSION=rvm-v1
RVM_PYTHON=C:/Users/RDX/Desktop/News_Broadcast_Experience_Screen/.venv-rvm/Scripts/python.exe
RVM_SCRIPT=tools/rvm/matte_video.py
RVM_MODEL=mobilenetv3
RVM_DEVICE=cpu
RVM_DOWNSAMPLE_RATIO=0.25
RVM_TIMEOUT_MS=300000
RVM_MATTE_WAIT_TIMEOUT_MS=360000
RVM_MATTE_LOCK_TTL_MS=420000
```

Output metadata example for successful RVM:

```json
{
  "engine": "rvm",
  "fallback": null,
  "fallbackReason": null
}
```

Output metadata example for fallback:

```json
{
  "engine": "chromakey",
  "fallback": "chromakey",
  "fallbackReason": "RVM timed out or failed"
}
```

## 11. Why The System Uses Background Workers

The application has several operations that can take seconds or minutes:

- Transcription.
- Translation.
- Speech generation.
- Highlight selection.
- FFmpeg rendering.
- RVM background removal.
- Final export generation.

Running these directly inside an API request would make the UI slow and fragile. Workers make the system more reliable by allowing:

- Async processing.
- Retry handling.
- Per-task status.
- Separate CPU-heavy processes.
- Cleaner recovery when one service fails.

## 12. Reliability And Recovery

The app uses several reliability mechanisms:

- BullMQ retries failed jobs.
- `generation_tasks` stores task status and timestamps.
- Worker heartbeats mark long-running jobs as alive.
- The watchdog checks stuck or orphaned jobs.
- Screens keep showing the last good completed output.
- Variant publishing prevents stale background/export results from replacing newer selections.

## 13. Deployment Notes

Supporting services are run through Docker Compose:

- PostgreSQL
- Redis
- MinIO
- faster-whisper
- CosyVoice

The Next.js app and workers run as Node.js processes. For production, the workers should run under a process manager so they restart automatically after failure or machine reboot.

Minimum practical machine profile:

- Multi-core CPU.
- 32 GB RAM recommended.
- SSD storage.
- GPU optional but recommended for faster AI/RVM processing.

## 14. Summary For Client

This application is a complete browser-based broadcast experience system. It captures media, processes it using AI and video tooling, and publishes polished outputs to multiple screens. The architecture separates the user interface from heavy processing, which keeps the experience responsive while still supporting advanced features like translation, text-to-speech, AI highlight editing, and RVM background replacement.

The most important technical design choice is the generation-based pipeline: every recording becomes a tracked generation, every worker updates task status, and each screen only switches when the exact assets it needs are ready.
