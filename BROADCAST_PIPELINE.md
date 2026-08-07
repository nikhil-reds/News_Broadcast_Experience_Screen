# News Broadcast Experience Screen - Complete Pipeline Guide

## 📺 System Overview

This is a **3-camera + audio multi-language news broadcast system** that:
- Records 3 camera angles simultaneously with synchronized audio
- Automatically generates highlight reels using AI
- Transcribes audio in English
- Translates transcripts to 5 languages (English, German, Hindi, French, Spanish)
- Creates dubbed/subtitled versions for each language
- Displays final content across 12 broadcast screens

---

## 🏗️ Architecture Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Web Framework** | Next.js 16 | Server + Client rendering |
| **Database** | PostgreSQL + Prisma | Metadata storage |
| **Object Storage** | MinIO (S3-compatible) | Video/Audio files |
| **Queue System** | BullMQ + Redis | Background job processing |
| **AI Services** | Gemini 2.5 Pro | Timestamps + Translations |
| **Transcription** | Whisper (Docker) | Audio → Text |
| **Text-to-Speech** | CosyVoice2 | Translation audio synthesis |
| **Video Processing** | FFmpeg | Video editing + encoding |
| **Hardware Interface** | Nexmosphere/SerialPort | Physical knobs + sensors |

---

## 📊 Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    INPUT STAGE (Camera Page)                    │
│                                                                 │
│  [Camera 01] [Camera 02] [Camera 03]        [Master Audio]      │
│       ↓           ↓            ↓                  ↓              │
│   Media Stream (getUserMedia) + MediaRecorder    │              │
│       ↓           ↓            ↓                  ↓              │
│  Sync'd Recording: All 3 cameras + audio start/stop together    │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                   UPLOAD & STORAGE (MinIO S3)                   │
│                                                                 │
│  POST /api/save-recording (for videos)                          │
│  POST /api/save-audio (for audio)                               │
│       ↓                           ↓                              │
│   ┌─────────────────────┐   ┌──────────────────┐               │
│   │ MinIO videos bucket │   │ MinIO audio      │               │
│   │ - cam1-*.webm       │   │ bucket           │               │
│   │ - cam2-*.webm       │   │ - master-audio-* │               │
│   │ - cam3-*.webm       │   │   .wav           │               │
│   └─────────────────────┘   └──────────────────┘               │
│                                                                 │
│   + Store metadata in PostgreSQL (AudioFile, VideoRecording)   │
└─────────────────────────────────────────────────────────────────┘
                           ↓ (parallel queues)
        ┌──────────────────┬─────────────────────┐
        ↓                  ↓                      ↓
┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐
│ QUEUE 1:         │  │ QUEUE 2:         │  │ QUEUE 3:     │
│ Audio            │  │ Highlight Reel   │  │ Translations │
│ Transcription    │  │ Generation       │  │ (5 languages)│
└──────────────────┘  └──────────────────┘  └──────────────┘
        ↓                  ↓                      ↓
```

---

## 🔄 QUEUE 1: Audio Transcription Pipeline

### Trigger
- After audio file uploaded to MinIO
- API enqueues transcription job with filename

### Worker: `app/worker/audio-transcription.ts`
```bash
npm run worker:audio
```

### Process
1. **Download** audio from MinIO `audio` bucket
2. **Transcribe** using Whisper (Docker container)
   - Produces full transcript text
   - Extracts per-sentence segments with start/end timestamps
3. **Create SRT subtitles** from segments
4. **Save to Postgres**
   - `Transcript` table: full text + metadata
   - `TranscriptSegment` table: each sentence with timing
5. **Upload SRT to MinIO** `transcripts` bucket
6. **Enqueue translations** → Push job to 4 language queues (German, Hindi, French, Spanish)

### Database Tables
```
Transcript
├─ id (uuid)
├─ sourceAudio: string
├─ audioFile: FK → AudioFile
├─ language: "en" (English)
├─ text: full transcript
├─ srtContent: SRT subtitle file
└─ segments: [] → TranscriptSegment[]

TranscriptSegment
├─ id
├─ transcript: FK → Transcript
├─ segmentIndex: 0, 1, 2, ...
├─ start: 0.5 (seconds)
├─ end: 3.2 (seconds)
└─ text: "Hello everyone..."
```

### Output
- ✅ Full English transcript in database
- ✅ Timestamped segments for teleprompter (Screen 4)
- ✅ SRT file in MinIO for potential video overlays
- ✅ Ready for translations

---

## 🎬 QUEUE 2: Highlight Reel Generation

### Trigger
- After all 3 cameras upload their videos
- API enqueues highlight-reel job with cam1, cam2, cam3 filenames

### Worker: `app/worker/highlight-reel.ts`
```bash
npm run worker:highlight
```

### Process
1. **Download** all 3 camera videos from MinIO `videos` bucket
2. **Send to Gemini 2.5 Pro** with prompt:
   ```
   "Analyze these 3 camera angles of a news broadcast.
   Find the most engaging/important moments (30-60 second segments).
   Return timing data for each moment."
   ```
3. **Parse Gemini response** → Extract segment timecodes
4. **Use FFmpeg** to:
   - Extract segments from each camera (3 cameras × N segments)
   - Re-encode with x264 for compatibility
   - Concatenate into final highlight reel
   - Sync audio (if present)
5. **Upload to MinIO** as `highlight-{cam1filename}.webm`
6. **Save metadata** to database

### Output
- ✅ `highlight-*.webm` in MinIO `videos` bucket
- ✅ Displayed on **Screen 6** (looping highlight reel)
- ✅ Duration: typically 30-120 seconds
- ✅ Best moments from all 3 camera angles

---

## 🌍 QUEUE 3: Translation Pipeline (4 Workers, Parallel)

### Triggered By
- Transcription worker finishes → Fans out to 4 language queues

### Languages (4 Total)
1. German (Deutsch) - Queue: `german-transcript`
2. Hindi (हिंदी) - Queue: `hindi-transcript`
3. French (Français) - Queue: `french-transcript`
4. Spanish (Español) - Queue: `spanish-transcript`

### Worker Flow (Per Language)
Each language has a dedicated worker:
- `app/worker/german-transcript.ts`
- `app/worker/hindi-transcript.ts`
- `app/worker/french-transcript.ts`
- `app/worker/spanish-transcript.ts`

```bash
# Run all 4 in parallel (different terminals)
npm run worker:german-transcript
npm run worker:hindi-transcript
npm run worker:french-transcript
npm run worker:spanish-transcript
```

### Translation Process
1. **Receive** English `TranscriptSegment[]` data
2. **Translate with Gemini** (per-language model)
   - Send: English segment text + start/end timing
   - Receive: Translated text in target language
   - Preserve timing data exactly
3. **Save to Postgres**
   - `TranscriptTranslation`: full translated text
   - `TranscriptTranslationSegment`: per-sentence translations with timing
4. **Upload to MinIO** `transcripts` bucket as `{language}-{transcriptId}.txt`

### Database Tables
```
TranscriptTranslation
├─ id
├─ transcript: FK → Transcript (English)
├─ language: "German" / "Hindi" / "French" / "Spanish"
├─ langCode: "de" / "hi" / "fr" / "es"
├─ text: full translated text
└─ segments: [] → TranscriptTranslationSegment[]

TranscriptTranslationSegment
├─ id
├─ translation: FK → TranscriptTranslation
├─ segmentIndex: 0, 1, 2, ... (matches English)
├─ start: 0.5 (same timing as English)
├─ end: 3.2 (same timing as English)
└─ text: "Hallo alle..." / "नमस्ते..." / etc.
```

### Output (Per Language)
- ✅ Full translated transcript in database
- ✅ Timestamped segments (synchronized with English)
- ✅ Translation text file in MinIO
- ✅ Ready for text-to-speech/video creation

---

## 🔊 Text-to-Speech: Create Language Audio

### Workers
- `app/worker/german-audio.ts`
- `app/worker/hindi-audio.ts`
- `app/worker/french-audio.ts`
- `app/worker/spanish-audio.ts`

### Trigger
- After translation is saved

### Process
1. **Receive** translated transcript
2. **Text-to-Speech with CosyVoice2** (0.5B model)
   - Language: German / Hindi / French / Spanish
   - Input: Full translated text
   - Output: `.wav` audio file
3. **Split audio** into per-segment WAV files (aligned with timing)
4. **Upload to MinIO** `tts-audio` bucket
5. **Save metadata** to `TranslationAudio` table

### Output
- ✅ Language-specific audio files in MinIO
- ✅ Segment-aligned with timestamps
- ✅ Ready to embed in final videos

### Database Table
```
TranslationAudio
├─ id
├─ translation: FK → TranscriptTranslation
├─ language: "German" / "Hindi" / ...
├─ bucket: "tts-audio"
├─ url: /api/asset/tts-audio/...wav
├─ engine: "CosyVoice2-0.5B"
└─ createdAt: timestamp
```

---

## 🎥 Video Creation: Final Output with Subtitles

### Workers
- `app/worker/green-screen-compose.ts` (advanced: chroma-key compositing)
- Custom FFmpeg workflow (to be implemented/extended)

### Stages

#### Stage 1: Raw Camera Loop (Screens 1-3)
**Source:** Camera 1, 2, 3 videos from MinIO
**Process:** Simple looping playback
**Output:** Screens 1, 2, 3 display raw camera feeds continuously

#### Stage 2: Edited Video with Subtitles (Screens 7-10)
**Source:** Highlight reel + translation audio + translation subtitles
**Process:**
1. Get best camera angle from highlight reel
2. Extract segments for each language
3. For each language:
   - Create new video with:
     - Background: camera video
     - Audio track: translated audio (TTS)
     - Subtitles: translated text (hardcoded with ffmpeg)
     - Branding: overlays, lower-thirds, timestamps
   - Save to MinIO as `edited-{language}.webm`
4. Create portrait version (9:16) for mobile
5. Create landscape version (16:9) for broadcast

**Output:**
- Screen 7: Edited German with subtitles
- Screen 8: Edited Hindi with subtitles
- Screen 9: Edited French with subtitles
- Screen 10: Edited Spanish with subtitles

#### Stage 3: Final Polished Output (Screens 11-12)
**Source:** Edited videos from Stage 2
**Process:**
- Apply final color grading
- Add watermarks/logos
- Optimize for delivery
- Create both portrait (Screen 11) and landscape (Screen 12) versions

**Output:**
- Screen 11: **Final Video (Portrait 9:16)**
- Screen 12: **Final Video (Landscape 16:9)**

---

## 📺 Display Screens (12 Total)

| Screen | Name | Content | Source | Purpose |
|--------|------|---------|--------|---------|
| **1** | Camera 01 Feed | Raw camera 1 loop | `videos` MinIO | Studio monitor |
| **2** | Camera 02 Feed | Raw camera 2 loop | `videos` MinIO | Studio monitor |
| **3** | Camera 03 Feed | Raw camera 3 loop | `videos` MinIO | Studio monitor |
| **4** | Teleprompter | Audio + Transcript | `Transcript`/`TranscriptSegment` DB | On-air prompter |
| **5** | Language Selector | UI to pick language + change audio | Translation controls | Director control |
| **6** | Highlight Reel | Best moments (30-120s) | `highlight-*.webm` MinIO | Filler/VT |
| **7** | Edited German | Video + German subtitles | FFmpeg output | Broadcast |
| **8** | Edited Hindi | Video + Hindi subtitles | FFmpeg output | Broadcast |
| **9** | Edited French | Video + French subtitles | FFmpeg output | Broadcast |
| **10** | Edited Spanish | Video + Spanish subtitles | FFmpeg output | Broadcast |
| **11** | Final Output (Portrait) | Polished 9:16 vertical | FFmpeg + branding | Social media |
| **12** | Final Output (Landscape) | Polished 16:9 widescreen | FFmpeg + branding | Broadcast/Archive |

---

## 🔌 API Endpoints

### Recording Upload
```
POST /api/save-recording
- Body: FormData with video blob
- Returns: { filename, url, queuedForHighlightReel }

POST /api/save-audio
- Body: FormData with audio blob
- Returns: { filename, url, queuedForTranscription }
```

### Asset Retrieval
```
GET /api/asset/{bucket}/{filename}
- bucket: "videos" | "audio" | "transcripts" | "tts-audio"
- Returns: File stream with correct MIME type
```

### Transcription
```
GET /api/transcript/{language}?audioFileId=...
- language: "english" | "german" | "hindi" | "french" | "spanish"
- Returns: { id, text, segments: [...], language, url }
```

### Audio Language Control
```
POST /api/audio-language
- Body: { transcriptId, language }
- Returns: { languageChanged, audioUrl, subtitles }
```

---

## 🚀 Step-by-Step Setup & Execution

### Prerequisites
```bash
# Required services running:
- PostgreSQL (connection string in .env.local)
- Redis (for BullMQ, connection string in .env.local)
- MinIO (S3-compatible object storage)
- Docker (for Whisper transcription)
```

### 1️⃣ Initialize Database
```bash
# Create tables from Prisma schema
npx prisma migrate dev --name init
```

### 2️⃣ Start Dev Server
```bash
# Terminal 1: Next.js dev server (port 3000)
npm run dev
```

### 3️⃣ Start Background Workers (Parallel)
```bash
# Terminal 2: Audio transcription
npm run worker:audio

# Terminal 3: Highlight reel generation
npm run worker:highlight

# Terminal 4: German translation + audio
npm run worker:german-transcript
npm run worker:german-audio

# Terminal 5: Hindi translation + audio
npm run worker:hindi-transcript
npm run worker:hindi-audio

# Terminal 6: French translation + audio
npm run worker:french-transcript
npm run worker:french-audio

# Terminal 7: Spanish translation + audio
npm run worker:spanish-transcript
npm run worker:spanish-audio

# Or run all at once:
npm run worker:all
```

### 4️⃣ Access UI
- **Camera Recording Page:** http://localhost:3000/camera
  - Record 3 cameras + audio
  - View saved recordings

- **Main Hub:** http://localhost:3000/main
  - Navigate to all 12 screens
  - Monitor broadcasts

- **Screen 1:** http://localhost:3000/screen1 (Camera 1 loop)
- **Screen 4:** http://localhost:3000/screen4 (Teleprompter)
- **Screen 6:** http://localhost:3000/screen6 (Highlight reel)
- ... (Screens 7-12 for multi-language outputs)

---

## 📦 Data Pipeline Summary

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          COMPLETE WORKFLOW                               │
└──────────────────────────────────────────────────────────────────────────┘

                          🎬 RECORDING PHASE
                          Camera 1, 2, 3 + Audio
                                  ↓
                    📁 MinIO Upload (Videos + Audio)
                    + 💾 Postgres Metadata
                                  ↓
                    ┌─────────────┼─────────────┐
                    ↓             ↓             ↓
            🎙️ TRANSCRIBE    🎬 HIGHLIGHT     🌍 TRANSLATE
             (Whisper)      (Gemini+FFmpeg)    (Gemini)
                    ↓             ↓             ↓
            📝 English Text   🎬 30-120s      [German]
            + Timestamps       Highlight      [Hindi]
            + Segments         Reel           [French]
                    ↓             ↓            [Spanish]
                    ├─────────────┼────────────┤
                    ↓             ↓            ↓
            🔊 Screen 4      🎬 Screen 6   🔊 TTS + Subtitles
            (Teleprompter)   (Best Clips)
                    ↓             ↓            ↓
                    │             │     🎬 Edited Videos
                    │             │     with Language Audio
                    │             │            ↓
                    └─────────────┼────────────┘
                                  ↓
                    📺 Screens 7-10 (Multi-language)
                    📺 Screens 11-12 (Final Output)
```

---

## 🔧 Configuration Files

### `.env.local`
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost/news_broadcast

# Redis
REDIS_URL=redis://localhost:6379

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# AI APIs
GEMINI_API_KEY=your_api_key_here

# FFmpeg paths (if not in PATH)
FFMPEG_PATH=/usr/local/bin/ffmpeg
FFPROBE_PATH=/usr/local/bin/ffprobe

# Docker Whisper
WHISPER_DOCKER_IMAGE=openai/whisper:latest
```

### `prisma/schema.prisma`
Already configured with all models:
- `AudioFile` - Master audio recordings
- `VideoRecording` - Camera videos
- `Transcript` - English transcripts
- `TranscriptSegment` - English segments with timing
- `TranscriptTranslation` - Per-language translations
- `TranscriptTranslationSegment` - Per-language segments
- `TranslationAudio` - TTS audio files
- `BroadcastScreen` - Screen state/settings
- `CameraFeed` - Camera metadata

---

## ✅ Deployment Checklist

- [ ] PostgreSQL database initialized and running
- [ ] Redis instance running with BullMQ
- [ ] MinIO configured with buckets: `videos`, `audio`, `transcripts`, `tts-audio`
- [ ] Gemini API key configured
- [ ] FFmpeg/FFprobe installed on server
- [ ] Docker available for Whisper transcription
- [ ] All environment variables in `.env.local`
- [ ] Prisma migrations applied
- [ ] All workers deployed and running
- [ ] Nexmosphere hardware configured (optional, for physical controls)
- [ ] SSL certificates (if production)

---

## 📊 Performance Notes

| Stage | Typical Duration | Bottleneck |
|-------|------------------|-----------|
| Recording | Real-time | Depends on segment length |
| Audio Upload | < 5 sec | Network speed |
| Transcription | 1-3 min | Whisper processing |
| Highlight Generation | 5-15 min | Gemini + FFmpeg |
| Translation (1 language) | 1-2 min | Gemini + DB |
| TTS (1 language) | 2-5 min | CosyVoice2 |
| Video Composition | 3-10 min | FFmpeg encoding |
| **Total Pipeline** | **20-45 min** | Full parallel processing |

---

## 🎯 Next Steps / Future Enhancements

1. **Green Screen Compositing** - Replace background in camera feeds
2. **Real-time Analytics** - Dashboard for broadcast metrics
3. **Multi-broadcast Sessions** - Support simultaneous recordings
4. **Custom Branding** - Configurable logos, lower-thirds, overlays
5. **Archive Management** - Retention policies, compression
6. **Streaming Integration** - Direct YouTube/Facebook Live publishing
7. **Mobile App** - iOS/Android app for remote broadcast control
8. **API Webhooks** - Notify external systems of pipeline events

---

## 📞 Support

- **Logs:** Check worker terminal output for detailed job processing logs
- **Queue Dashboard:** Access BullMQ admin UI at `/api/queue-dashboard` (when implemented)
- **Database Queries:** Use `npx prisma studio` to inspect and query data
- **MinIO Console:** http://localhost:9000 (access raw files)

---

*Last Updated: 2026-08-07*
*System: News Broadcast Experience Screen v0.1.0*
