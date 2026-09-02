# News Broadcast Experience System Documentation

## 1. Project Overview

This project is a Next.js based interactive broadcast experience for a multi-screen news studio installation. It records three camera feeds and one master audio feed, stores the media in MinIO, tracks each recording cycle as a database generation, and uses background workers to create transcripts, translations, translated speech, highlight reels, green-screen composites, ad-supported layouts, and final portrait or landscape previews.

The experience is designed for a physical room with:

- Three camera inputs.
- One master audio input.
- ESP32 and Nexmosphere hardware controls.
- A control-room landing screen.
- Capture, processing, post-production, preview, camera, sensor, and device-preview screens.

The app is not only a visual screen launcher. It also coordinates an asynchronous media-processing pipeline using PostgreSQL, Redis, BullMQ, MinIO, FFmpeg, Whisper/faster-whisper, Qwen, Gemini, and CosyVoice.

## 2. Main User Flow

1. Open the studio control route at `/`.
2. Navigate to `/camera` to select three camera devices and confirm master audio capture.
3. Press `Start Recording`.
4. The app creates a `BroadcastSession` row and assigns the same session id to all camera and audio uploads.
5. Press `End Recording`.
6. The browser saves three camera recordings through `/api/save-recording`.
7. The browser saves the master audio through `/api/save-audio`.
8. The backend stores media objects in MinIO and metadata in PostgreSQL.
9. BullMQ jobs are enqueued for transcription, translation, TTS, highlight analysis, highlight rendering, green-screen composition, and final exports.
10. Screens poll the relevant APIs and keep showing the last good output while new generation assets are being prepared.
11. The operator can choose a background on Screen 07 and subtitle language on Screen 08.
12. Screens 11 and 12 show final portrait and landscape broadcast previews using the selected background, subtitles, audio, and ad layout.

## 3. Technology Stack

### Frontend

- Next.js `16.2.12`
- React `19.2.4`
- TypeScript
- Tailwind CSS `4`
- HTML5 `video` and `audio`
- Server-Sent Events for ESP32/Nexmosphere event streams
- Browser MediaRecorder APIs for camera and audio capture

### Backend And APIs

- Next.js App Router API routes under `app/api`
- Prisma `7.9.1`
- PostgreSQL
- MinIO S3-compatible object storage
- Redis
- BullMQ job queues
- Node.js/tsx worker processes

### Media And AI Processing

- FFmpeg and FFprobe for video/audio processing.
- Docker faster-whisper service for speech-to-text.
- Qwen through an Ollama-compatible API for translation.
- Gemini for highlight analysis and some media-generation logic.
- CosyVoice service for translated speech synthesis.
- Sharp for image processing and subtitle image generation.

### Infrastructure

- `compose.yaml` runs supporting services:
  - `whisper` on port `8000`
  - `db` PostgreSQL on host port `38472`
  - `minio` on ports `9000` and `9001`
  - `redis` on port `6379`
  - `cosyvoice` on host port `9500`

## 4. Important Project Files

- `app/page.tsx`: Control-room landing page.
- `app/(main)/camera/page.tsx`: Camera and master-audio recording studio.
- `app/(main)/sensor/page.tsx`: ESP32 media-control telemetry screen.
- `app/(main)/main/page.tsx`: Multi-device preview wall.
- `app/(screens)/screen1` through `screen12`: Broadcast output screens.
- `components/screen-navigation-matrix.tsx`: Screen launcher grid.
- `components/recording-looper.tsx`: Shared looping player for raw and derived videos.
- `components/screen11-highlight-player.tsx`: Portrait final preview.
- `components/screen12-highlight-player.tsx`: Landscape final preview.
- `lib/queue.ts`: BullMQ queue definitions and enqueue helpers.
- `lib/generation.ts`: Generation/task readiness and publication logic.
- `lib/video-export.ts`: Final export pipeline with re-timed subtitles.
- `lib/green-screen.ts`: Background definitions and composite URL conventions.
- `prisma/schema.prisma`: Database models.
- `scripts/run-workers.mjs`: Worker process supervisor.

## 5. Screen-By-Screen Details

### `/` - Control Room Multi-View

The landing page renders the Amagi-branded control matrix. It lists every screen and provides navigation links into each output view. It also listens to ESP32 serial events through `/api/esp32/events`, where configured button frames can start or stop camera recording.

Current screen cards include capture screens, processing screens, post-production screens, preview screens, the camera control page, the sensor page, and the responsive preview page.

### `/camera` - Multi-Camera And Audio Studio Control

This is the main recording operator page. It initializes three camera recorders with `useCameraRecorder`, assigns separate devices where available, and registers master-audio controls through `AudioStudioCard`.

When recording starts, the page:

- Creates a broadcast session with `POST /api/sessions`.
- Shares the session id with all three camera recorders and the audio recorder.
- Starts all capture streams together.

When recording ends, the page:

- Stops all camera and audio recorders.
- Uploads the media.
- Marks the session as `processing`.

### `/sensor` - ESP32 Media Controller

This screen visualizes hardware input from the ESP32 controller. It supports:

- Button press/release state.
- Click-based play/pause toggles.
- Rotary volume changes.
- A small event log.
- Connection status from `/api/esp32/events`.

It also supports browser media-key events, so keyboard media controls can mimic the hardware behavior.

### `/screen1` - Camera 01 Footage

Screen 01 uses `RecordingLooper` with `source={{ camera: 1 }}`. It loops the newest Camera 01 recording and is intended as the primary camera monitor.

### `/screen2` - Camera 02 Feed

Screen 02 uses `RecordingLooper` with `source={{ camera: 2 }}`. It loops the newest Camera 02 recording.

### `/screen3` - Camera 03 Feed

Screen 03 uses `RecordingLooper` with `source={{ camera: 3 }}`. It loops the newest Camera 03 recording.

### `/screen4` - Audio In Text

Screen 04 is the English teleprompter/transcript screen. It:

- Polls `/api/save-audio` for the newest master audio file.
- Polls `/api/transcript/english` until the transcript is ready.
- Plays the source audio.
- Uses transcript segment timestamps to keep the active line centered.
- Uses a Nexmosphere rotary control to adjust volume.

The visual style is a full-screen, centered teleprompter with active-line emphasis.

### `/screen5` - Multi-Language Audio

Screen 05 lets the operator switch between English, German, Hindi, French, and Spanish audio.

English uses the original master audio. Other languages depend on:

- English transcription.
- Qwen transcript translation.
- CosyVoice speech synthesis.

The language ring is driven by Nexmosphere rotation and regular button clicks. The selected language is committed after a short delay, which avoids reloading audio repeatedly while the knob is spinning.

### `/screen6` - First Edited Highlight Reel

Screen 06 plays the generated highlight reel with embedded synchronized audio. It uses `RecordingLooper` with `source={{ highlight: true }}`, `muted={false}`, and `screenId={6}`.

Because `screenId` is passed, playback is gated by screen publication/readiness logic. The screen should only show a fully prepared highlight reel for a generation whose highlight analysis and highlight render tasks completed.

### `/screen7` - Background Change Video

Screen 07 is the green-screen background selection screen. It composites Camera 01 against selectable backgrounds:

- Newsroom Blue
- City Skyline
- World Map
- Sunrise Studio
- Corporate Grey

For each new Camera 01 take, the app pre-warms all background composites through the green-screen BullMQ queue. The UI shows which backgrounds are ready, warming, selected, or actively rendering. When a background is chosen, the selected id is persisted to the current session so final preview screens can use the same background.

### `/screen8` - Subtitle Language Change

Screen 08 previews subtitle language choices over the composited video. It:

- Uses the newest master audio as the transcript source.
- Uses the Camera 01 newsroom-blue composite as the video source.
- Lets the operator select English, German, Hindi, French, or Spanish subtitle text.
- Persists `selectedSubtitleLanguage` onto the current session.

The subtitles are CSS overlays in this screen. Final export rendering burns subtitles into the video through FFmpeg.

### `/screen9` - Ads Banner Video

Screen 09 renders a sponsored L-band style layout. A full-screen ad creative from `public/ads` forms the broadcast frame, while the current composited video plays inside the program window.

It rotates local ad images every 10 seconds and plays the original master audio separately because the displayed video is muted.

### `/screen10` - Ads Banner Mirror

Screen 10 mirrors the ad-supported broadcast feed with a bottom campaign rail. It fetches active campaigns from `/api/ad-campaigns`, falls back to built-in Amagi campaign copy, and rotates campaigns every 5 seconds.

It uses the same newsroom-blue composited Camera 01 source as Screen 09.

### `/screen11` - Final Preview Portrait

Screen 11 is the mobile portrait preview. It renders a `390 x 844` framed layout with:

- Composited highlight video.
- Original audio.
- English subtitles.
- Bottom ad rail.
- Portrait-first output styling.

The final export queue maps portrait requests to screen id `11`.

### `/screen12` - Final Preview Landscape

Screen 12 is the final landscape broadcast preview. It uses:

- A left sponsor rail.
- A full-height composited highlight player.
- Original audio.
- English subtitles.
- Landscape-first output styling.

The final export queue maps landscape requests to screen id `12`.

### `/main` - Responsive Preview Studio

This route shows the same composited video across multiple device frames, including phones, tablets, laptops, monitors, TVs, ultrawide screens, and portrait signage. It is useful for checking how the broadcast feed looks across different screen shapes.

## 6. Backend Data Flow

### Recording Storage

Camera recordings are uploaded to:

- API: `POST /api/save-recording`
- MinIO bucket: `videos`
- Database table: `video_recordings`

Audio recordings are uploaded to:

- API: `POST /api/save-audio`
- MinIO bucket: `audio`
- Database table: `audio_files`

Each upload can include a `sessionId`, connecting it to the same `BroadcastSession`.

### Broadcast Sessions

`BroadcastSession` is the unit of one recording cycle. It ties together:

- Three camera recordings.
- One master audio file.
- Transcript rows.
- Translation rows.
- TTS audio rows.
- Highlight/video jobs.
- Generation task status.
- Selected background and subtitle language.

The session status moves from `recording` to `processing`, and the pipeline status eventually becomes `ready` or `failed`.

### Generation Tasks

`GenerationTask` rows track background work for each generation. Task types include:

- `transcription`
- `translation-de`
- `translation-hi`
- `translation-fr`
- `translation-es`
- `tts-de`
- `tts-hi`
- `tts-fr`
- `tts-es`
- `highlight-analysis`
- `highlight-reel`
- `greenscreen-<backgroundId>`
- `video-export-11`
- `video-export-12`

Workers mark tasks as `pending`, `processing`, `completed`, `failed`, or `cancelled`. These rows are used for progress, retries, stale-generation protection, and screen readiness.

### Screen Publication

`ScreenPublication` stores what each screen is currently allowed to show. It separates:

- `currentGenerationId` and `currentParams`: the last known-good output.
- `pendingGenerationId` and `pendingParams`: the next variant being prepared.
- `pendingStatus`: `idle`, `preparing`, or `failed`.

This is why screens can avoid going blank while the next generation is still rendering.

## 7. Queue And Worker Flow

The main queues are defined in `lib/queue.ts`.

### Transcription

- Queue: `audio-transcription`
- Worker: `app/worker/audio-transcription.ts`
- Input: master audio filename.
- Output: English transcript and timestamped segments.
- Downstream: translation jobs.

### Translation

- Queues: `german-transcript`, `hindi-transcript`, `french-transcript`, `spanish-transcript`
- Workers: language-specific transcript workers or `app/worker/translations.ts`
- Input: English transcript segments.
- Output: translated transcript text and segments.
- Engine: Qwen.
- Downstream: TTS jobs.

### Text-To-Speech

- Queues: `german-audio`, `hindi-audio`, `french-audio`, `spanish-audio`
- Workers: language-specific audio workers or `app/worker/tts.ts`
- Input: translated transcript text.
- Output: translated `.wav` files in MinIO.
- Engine: CosyVoice.

### Highlight Reel

The highlight reel is split into two stages:

- Queue: `highlight-analysis`
- Worker: `app/worker/highlight-analysis.ts`
- Purpose: Gemini chooses the best camera moments.

Then:

- Queue: `highlight-reel`
- Worker: `app/worker/highlight-reel.ts`
- Purpose: FFmpeg cuts and concatenates the selected moments.

A sidecar JSON file is stored with the reel so subtitles can be re-timed to the edited reel timeline.

### Green-Screen Composition

- Queue: `green-screen-compose`
- Worker: `app/worker/green-screen-compose.ts`
- Input: background id and Camera 01 source filename.
- Output: composited MP4 in the `videos` bucket.

Composites are cached per `(backgroundId, sourceFilename)`.

### Final Video Export

- Queue: `video-export`
- Worker: `app/worker/video-export.ts`
- Input: reel filename, source audio, language, aspect, and background.
- Output: final portrait or landscape MP4.

The export pipeline re-times subtitles using the reel sidecar before burning them into the output.

### Watchdog

- Worker: `app/worker/watchdog.ts`
- Purpose: detects stalled or missing generation tasks and supports recovery using stored `GenerationTask.payload`.

## 8. API Route Summary

### Media

- `POST /api/save-recording`: Uploads a camera recording to MinIO and database.
- `GET /api/save-recording`: Lists recordings by camera, highlight kind, and optional session.
- `POST /api/save-audio`: Uploads master audio to MinIO and database.
- `GET /api/save-audio`: Lists saved audio files.
- `GET /api/asset/[bucket]/[...key]`: Serves MinIO objects through the app.

### Sessions

- `POST /api/sessions`: Creates a new broadcast session.
- `GET /api/sessions`: Lists sessions.
- `GET /api/sessions/current`: Returns the newest/current session.
- `GET /api/sessions/[id]`: Returns one session.
- `PATCH /api/sessions/[id]`: Updates session state and operator selections.

### Transcript And Language

- `POST /api/transcribe`: Requests transcription for an audio file.
- `GET /api/transcript`: Reads transcript data.
- `GET /api/transcript/english`: Reads English transcript.
- `GET /api/transcript/german`: Reads German transcript.
- `GET /api/transcript/hindi`: Reads Hindi transcript.
- `GET /api/transcript/french`: Reads French transcript.
- `GET /api/transcript/spanish`: Reads Spanish transcript.
- `POST /api/translate`: Requests translation.
- `GET /api/audio-language`: Lists audio readiness by language.
- `POST /api/audio-language`: Requests translation and TTS for a language.
- `GET /api/subtitle-cues`: Returns subtitle cues re-mapped to highlight reel timing.

### Green Screen And Export

- `POST /api/green-screen/compose`: Starts or reuses a green-screen compose job.
- `GET /api/green-screen/compose/[jobId]`: Polls one compose job.
- `GET /api/green-screen/status`: Reads background composite status.
- `POST /api/video-export`: Starts or reuses a portrait/landscape export job.
- `GET /api/video-export`: Lists export jobs.
- `GET /api/video-export/[id]`: Reads one export job.

### Ads And Hardware

- `GET /api/ad-campaigns`: Lists active ad campaigns.
- `POST /api/ad-campaigns`: Creates an ad campaign.
- `POST /api/ad-campaigns/impression`: Tracks an ad impression.
- `GET /api/esp32/events`: Streams ESP32 frames and status.
- `POST /api/esp32/events`: Accepts ESP32 frames.
- `GET /api/nexmosphere/events`: Streams Nexmosphere events.
- `POST /api/nexmosphere/events`: Accepts Nexmosphere events.

## 9. Database Model Summary

- `BroadcastSession`: One complete recording/generation cycle.
- `VideoRecording`: Raw camera recordings and generated video assets.
- `AudioFile`: Master audio recordings.
- `Transcript`: English speech-to-text result.
- `TranscriptSegment`: Timestamped English transcript segments.
- `TranscriptTranslation`: Translated transcript per language.
- `TranscriptTranslationSegment`: Timestamped translated segments.
- `TranslationAudio`: TTS output for translated transcripts.
- `GenerationTask`: Processing state for pipeline jobs.
- `ScreenPublication`: Current and pending output state per screen.
- `VideoJob`: Final export jobs for screens 11 and 12.
- `AdCampaign`: Sponsored campaign copy and scheduling metadata.
- `BroadcastScreen`: Interactive screen state.
- `CameraFeed`: Camera stream metadata.

## 10. Storage Layout

The app uses MinIO buckets rather than only local files:

- `audio`: original master audio recordings.
- `videos`: camera recordings, highlight reels, green-screen composites, and exports.
- `transcripts`: transcript text, translated text, subtitle sidecars, and reel sidecars.
- `tts-audio`: synthesized translated audio files.

Public static assets live under:

- `public/backgrounds`: green-screen backgrounds and thumbnails.
- `public/ads`: ad creative images.
- `public/banner`: banner images.
- `public/bg-video`: background video assets.

## 11. Running The Project

Install dependencies:

```bash
npm install
```

Start infrastructure services:

```bash
docker compose up -d
```

Run database migrations/generation as needed:

```bash
npx prisma migrate deploy
npx prisma generate
```

Start the Next.js app:

```bash
npm run dev
```

Start all worker groups:

```bash
npm run worker:all
```

Useful worker commands:

```bash
npm run worker:audio
npm run worker:highlight-analysis
npm run worker:highlight
npm run worker:translations
npm run worker:tts
npm run worker:green-screen
npm run worker:video-export
npm run worker:watchdog
```


## 13. Operational Notes

- Keep `npm run worker:all` running whenever recording, transcription, translation, highlight generation, background composition, or export rendering should happen.
- If Screen 07 stays on a compositing loader, check the green-screen worker and FFmpeg availability.
- If Screen 04 has audio but no transcript, check the Whisper service and `audio-transcription` worker.
- If Screen 05 shows languages as unavailable, check translation workers, TTS workers, Qwen, and CosyVoice.
- If Screens 11 or 12 do not update, check `video-export` jobs and `ScreenPublication` state.
- The app intentionally keeps last known-good screen output visible while new work is pending.
- A newer broadcast session can make older base jobs stale. Workers use generation guards to avoid publishing superseded output.
- Green-screen outputs are cached per background and source take. A new Camera 01 recording requires fresh composites.

## 14. High-Level Architecture Diagram

```text
Browser Capture
  |-- Camera 01
  |-- Camera 02
  |-- Camera 03
  |-- Master Audio
        |
        v
Next.js API Routes
  |-- /api/save-recording
  |-- /api/save-audio
        |
        v
MinIO + PostgreSQL
  |-- raw media objects
  |-- metadata
  |-- BroadcastSession
  |-- GenerationTask
        |
        v
Redis + BullMQ
  |-- transcription
  |-- translations
  |-- TTS
  |-- highlight analysis
  |-- highlight reel
  |-- green-screen compose
  |-- video export
        |
        v
Workers + AI/Media Services
  |-- Whisper
  |-- Qwen
  |-- Gemini
  |-- CosyVoice
  |-- FFmpeg
        |
        v
Derived Assets
  |-- transcripts
  |-- translated transcripts
  |-- translated audio
  |-- highlight reels
  |-- green-screen composites
  |-- final exports
        |
        v
Broadcast Screens
  |-- Screen 01-03 raw camera feeds
  |-- Screen 04 transcript
  |-- Screen 05 language audio
  |-- Screen 06 highlight reel
  |-- Screen 07 background selection
  |-- Screen 08 subtitle preview
  |-- Screen 09-10 ad layouts
  |-- Screen 11-12 final previews
```

## 15. Current Known Design Choices

- Camera 01 captures audio in some paths, but the master audio file is the canonical source for transcription and language features.
- Screens 01 to 03 are raw recording monitors and are not gated on derived pipeline readiness.
- Screen 06 is gated on highlight readiness.
- Screens 07, 11, and 12 use variant publication logic because their output depends on selected background, language, and aspect parameters.
- Screen 08 previews subtitles live in CSS, while final export burns subtitles into video files.
- `scripts/run-workers.mjs` starts worker groups in separate OS processes to avoid one stuck FFmpeg-heavy worker starving all other queues.
