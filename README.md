# Multi-Camera Interactive Video System

## Step-by-Step Implementation Plan

## 1. Project Objective

Build an interactive system for a physical room containing:

* Three cameras positioned at different angles
* One dedicated audio recorder
* Twelve interactive screens
* Physical or digital buttons for controlling each screen
* Local AI processing using a local LLM and Whisper
* Automated video editing using FFmpeg
* Portrait and landscape final previews
* Docker-based deployment
* Next.js-based user interface

The system should allow users to review individual camera recordings, generate transcripts, translate audio and subtitles, create multiple edited videos, change backgrounds, insert advertisements, and preview final output.

---

# 2. High-Level System Architecture

```text
Three Cameras ───────┐
                     │
Audio Recorder ──────┼──> Recording/Ingestion Service
                     │
                     └──> Local Storage
                              │
                              ▼
                     Processing Pipeline
                     - Audio extraction
                     - Whisper transcription
                     - Translation
                     - Video synchronisation
                     - FFmpeg editing
                     - Background replacement
                     - Subtitle generation
                     - Advertisement overlays
                              │
                              ▼
                       Media API Server
                              │
                              ▼
                     Next.js Control System
                              │
                              ▼
                        Twelve Screens
```

---

# 3. Recommended Technology Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* HTML5 video and audio players
* WebSocket or Socket.IO for real-time screen control

## Backend

Use either:

* Next.js API routes for basic media controls
* A separate Node.js service for processing jobs

For better scalability, use:

* Next.js for frontend and control APIs
* Node.js worker for FFmpeg and AI processing
* Redis for job queues and screen state
* BullMQ for background processing

## Media Processing

* FFmpeg
* FFprobe
* OpenCV, if advanced background replacement is required

## AI Processing

* Whisper or faster-whisper for speech-to-text
* Local LLM through Ollama
* Local translation models through Ollama or Hugging Face
* Optional speaker diarisation using pyannote.audio

## Storage

Initially use local disk storage:

```text
/data/raw
/data/audio
/data/transcripts
/data/subtitles
/data/processed
/data/final
/data/advertisements
/data/backgrounds
```

For production, consider:

* MinIO for local S3-compatible storage
* PostgreSQL for metadata
* Redis for temporary state and processing queues

## Deployment

* Docker
* Docker Compose
* NVIDIA Container Toolkit when using an NVIDIA GPU
* Nginx as reverse proxy
* Local Linux server or high-performance workstation

---

# 4. Hardware Setup

## Camera Configuration

Install three cameras in the first room:

### Camera 01

* Front-facing wide shot
* Captures the complete subject and room

### Camera 02

* Left-side angle
* Captures profile or close-up view

### Camera 03

* Right-side angle
* Captures an alternative close-up or profile

All cameras should use the same:

* Resolution
* Frame rate
* Video codec
* Time settings
* Recording start mechanism

Recommended recording configuration:

```text
Resolution: 1920 × 1080
Frame rate: 30 FPS
Codec: H.264
Container: MP4 or MOV
Audio: Disabled or retained only for synchronisation
```

## Audio Recorder

Use one dedicated audio recorder or microphone interface.

Recommended format:

```text
Format: WAV
Sample rate: 48 kHz
Bit depth: 24-bit
Channels: Mono or stereo
```

The dedicated recorder should capture cleaner audio than the camera microphones.

---

# 5. Recording Synchronisation

Synchronisation is one of the most important parts of the system.

## Preferred Method

Start all cameras and the audio recorder through one central recording controller.

The controller should generate a session ID:

```text
session-2026-07-27-001
```

Store files using this structure:

```text
/data/raw/session-2026-07-27-001/
    camera-01.mp4
    camera-02.mp4
    camera-03.mp4
    master-audio.wav
    session.json
```

## Session Metadata

Example:

```json
{
  "sessionId": "session-2026-07-27-001",
  "createdAt": "2026-07-27T10:30:00Z",
  "status": "recorded",
  "cameraFiles": {
    "camera01": "camera-01.mp4",
    "camera02": "camera-02.mp4",
    "camera03": "camera-03.mp4"
  },
  "audioFile": "master-audio.wav",
  "defaultLanguage": "en"
}
```

## Synchronisation Options

### Option A: Timecode

Use cameras and audio recorders that support shared timecode.

This provides the most accurate result.

### Option B: Audio Waveform Synchronisation

Record reference audio on every camera.

Compare the camera audio waveform with the master audio waveform and calculate the offset.

### Option C: Clap Synchronisation

At the start of recording, perform one loud clap.

The FFmpeg or Python worker detects the audio peak and aligns all recordings.

---

# 6. Screen-by-Screen Implementation

## Screen 01: Camera 01 Playback

### Requirement

When the user presses a button, Screen 01 plays the Camera 01 recording.

### Implementation

* Display an HTML5 video player
* Load the Camera 01 video for the current session
* Button sends a play command
* Screen listens for commands through WebSocket

Example command:

```json
{
  "screenId": "screen-01",
  "action": "play",
  "mediaType": "video",
  "source": "/media/session-001/camera-01.mp4"
}
```

Required controls:

* Play
* Pause
* Restart
* Seek
* Volume
* Full screen

---

## Screen 02: Camera 02 Playback

Use the same architecture as Screen 01.

Source:

```text
camera-02.mp4
```

Each screen should maintain independent playback state.

---

## Screen 03: Camera 03 Playback

Use the same architecture as Screens 01 and 02.

Source:

```text
camera-03.mp4
```

---

## Screen 04: Audio-to-Text Display

### Requirement

When the button is pressed, display the transcript generated from the recorded audio.

### Processing Flow

```text
master-audio.wav
        │
        ▼
faster-whisper
        │
        ▼
Transcript JSON
        │
        ▼
Screen 04
```

Use Whisper to generate:

* Complete transcript
* Timestamped segments
* Detected language
* Word-level timestamps when required

Example transcript output:

```json
{
  "language": "en",
  "segments": [
    {
      "start": 0.0,
      "end": 4.8,
      "text": "Welcome to the interactive video experience."
    }
  ]
}
```

Screen 04 should support:

* Transcript display
* Automatic scrolling
* Highlighting the current sentence
* Search
* Font-size controls
* Transcript download

---

## Screen 05: Audio Language Change

### Requirement

When the rotate button is pressed, change the audio language.

### Language Workflow

```text
Original audio
    │
    ▼
Whisper transcription
    │
    ▼
Local translation model
    │
    ▼
Local text-to-speech model
    │
    ▼
Translated audio file
```

Possible languages:

* English
* Hindi
* Spanish
* French
* Arabic
* German

Store translated audio as:

```text
/data/audio/session-001/en.wav
/data/audio/session-001/hi.wav
/data/audio/session-001/es.wav
```

Rotate-button behaviour:

```text
English → Hindi → Spanish → French → English
```

The screen should show the selected language before playback.

For local text-to-speech, consider:

* Piper TTS
* Coqui TTS
* XTTS
* A language-specific local TTS model

Voice cloning should only be used with the recorded speaker’s permission.

---

## Screen 06: Automatically Edited Videos

### Requirement

Create at least three or four edited videos by combining footage from all three cameras.

### Suggested Output Versions

#### Edit 01: Standard Interview

* Camera 01 as the main camera
* Camera 02 and Camera 03 used for alternate angles
* Cut every 8–15 seconds

#### Edit 02: Dynamic Cut

* Faster angle changes
* Close-up shots during important sentences
* Intro and outro
* Background music

#### Edit 03: Speaker-Focused Cut

* Select camera using speaker position or face detection
* Use Camera 01 for wide shots
* Use side cameras during emotional or important moments

#### Edit 04: Social Media Cut

* Portrait 9:16 layout
* Automatic subtitles
* Quick cuts
* Branding
* Advertisement banner

### FFmpeg Processing Steps

1. Normalise resolution and frame rate.
2. Synchronise all three videos.
3. Replace camera audio with the master audio.
4. Generate a cut timeline.
5. Trim camera segments.
6. Concatenate the segments.
7. Add transitions.
8. Add subtitles.
9. Add branding and advertisements.
10. Export final video.

Example timeline:

```json
[
  {
    "camera": "camera01",
    "start": 0,
    "end": 10
  },
  {
    "camera": "camera02",
    "start": 10,
    "end": 18
  },
  {
    "camera": "camera03",
    "start": 18,
    "end": 29
  }
]
```

The local LLM can analyse the transcript and suggest:

* Important moments
* Scene-change positions
* Hook sections
* Advertisement insertion points
* Highlight clips
* Sections that should be removed

The LLM should return structured JSON rather than directly running FFmpeg.

---

## Screen 07: Video Background Change

### Requirement

Allow the user to select and apply a different video background.

### Background Options

* Static image
* Video loop
* Brand background
* Gradient background
* Green-screen replacement
* AI background removal

### Implementation Methods

#### Green-Screen Method

This is the fastest and most reliable method.

Use FFmpeg chroma key:

```bash
ffmpeg -i input.mp4 -i background.mp4 \
-filter_complex "[0:v]chromakey=0x00FF00:0.15:0.1[person];[1:v][person]overlay" \
output.mp4
```

#### AI Segmentation Method

Use a person-segmentation model to create an alpha mask.

Possible pipeline:

```text
Video frames
    │
    ▼
Person segmentation
    │
    ▼
Foreground mask
    │
    ▼
New background composition
    │
    ▼
FFmpeg export
```

The selected background should be stored in the session configuration.

---

## Screen 08: Subtitle Language Change

### Requirement

Change subtitle language using a button.

### Subtitle Workflow

```text
Original transcript
      │
      ▼
Local LLM or translation model
      │
      ▼
Translated subtitle files
```

Generate:

```text
subtitles-en.srt
subtitles-hi.srt
subtitles-es.srt
subtitles-fr.srt
```

Screen 08 should support:

* Rotate language
* Enable or disable subtitles
* Subtitle font size
* Subtitle position
* Subtitle background
* Live preview

Example language command:

```json
{
  "screenId": "screen-08",
  "action": "changeSubtitleLanguage",
  "language": "hi"
}
```

---

## Screens 09 and 10: Advertisement Banners

### Requirement

Insert advertisement banners into the edited video.

Use two screens for two advertisement controls or positions.

## Suggested Responsibilities

### Screen 09: Lower-Third Advertisement

* Logo
* Company name
* Offer text
* Website
* QR code

### Screen 10: Full-Width or Timed Advertisement

* Top banner
* Bottom banner
* Side banner
* Full-screen advertisement
* Timed advertisement video

Advertisement configuration:

```json
{
  "advertisementId": "ad-001",
  "type": "lower-third",
  "asset": "/ads/company-banner.png",
  "startTime": 20,
  "duration": 8,
  "position": "bottom",
  "opacity": 0.9
}
```

Use FFmpeg overlay filters:

```bash
ffmpeg -i video.mp4 -i advertisement.png \
-filter_complex "[0:v][1:v]overlay=20:H-h-20:enable='between(t,20,28)'" \
-c:a copy output.mp4
```

The interface should allow:

* Uploading advertisement artwork
* Selecting its position
* Setting start time
* Setting duration
* Previewing the overlay
* Enabling or disabling the advertisement

---

## Screen 11: Final Portrait Preview

### Requirement

Display the final edited video in portrait format.

Recommended size:

```text
1080 × 1920
Aspect ratio: 9:16
```

Use cases:

* Instagram Reels
* YouTube Shorts
* TikTok
* Portrait display screens

Portrait conversion options:

* Centre crop
* Intelligent face tracking
* Blurred-background layout
* Split-screen layout
* Speaker-focused crop

The portrait preview screen should display:

* Final video
* Selected audio language
* Selected subtitle language
* Advertisement overlays
* Background selection
* Export status

---

## Screen 12: Final Landscape Preview

### Requirement

Display the final edited video in landscape format.

Recommended size:

```text
1920 × 1080
Aspect ratio: 16:9
```

Use cases:

* YouTube
* Television
* Presentation displays
* Website videos
* Digital signage

Screen 12 should show the same final configuration as Screen 11 but rendered in landscape format.

---

# 7. Next.js Application Structure

Recommended project structure:

```text
apps/
  web/
    app/
      control-room/
      screens/
        screen-01/
        screen-02/
        screen-03/
        screen-04/
        screen-05/
        screen-06/
        screen-07/
        screen-08/
        screen-09/
        screen-10/
        screen-11/
        screen-12/
      api/
        sessions/
        media/
        controls/
        jobs/
        subtitles/
        advertisements/
    components/
      VideoPlayer.tsx
      AudioPlayer.tsx
      TranscriptViewer.tsx
      LanguageSelector.tsx
      AdvertisementEditor.tsx
      ProcessingStatus.tsx
      FinalPreview.tsx

services/
  media-worker/
  transcription-worker/
  translation-worker/
  websocket-server/

data/
  raw/
  audio/
  transcripts/
  subtitles/
  backgrounds/
  advertisements/
  processed/
  final/
```

---

# 8. Screen Identification

Each physical screen should open a dedicated route.

```text
/display/screen-01
/display/screen-02
/display/screen-03
...
/display/screen-12
```

Each screen registers itself with the WebSocket server:

```json
{
  "type": "register-screen",
  "screenId": "screen-01"
}
```

The control panel sends commands to a particular screen.

```json
{
  "type": "screen-command",
  "screenId": "screen-01",
  "command": "play"
}
```

Store the current screen state in Redis:

```text
screen:01:state
screen:02:state
screen:03:state
```

Example state:

```json
{
  "status": "playing",
  "media": "/media/session-001/camera-01.mp4",
  "currentTime": 12.4,
  "volume": 0.8
}
```

---

# 9. Physical Button Integration

Buttons can be connected using:

* Raspberry Pi
* ESP32
* Arduino
* USB HID controller
* Stream Deck
* Touchscreen control panel

## Recommended Approach

Use an ESP32 or Raspberry Pi.

Button event flow:

```text
Physical button
      │
      ▼
ESP32 or Raspberry Pi
      │
      ▼
HTTP or MQTT command
      │
      ▼
Node.js control server
      │
      ▼
WebSocket command
      │
      ▼
Target screen
```

Example API call:

```http
POST /api/screens/screen-01/action
```

Request:

```json
{
  "action": "play"
}
```

For the rotate-language button:

```json
{
  "action": "next-language"
}
```

---

# 10. Database Design

Use PostgreSQL.

## Main Tables

### Sessions

```text
id
name
status
created_at
recording_started_at
recording_ended_at
default_language
```

### Media Files

```text
id
session_id
media_type
camera_number
file_path
duration
resolution
frame_rate
processing_status
```

### Transcripts

```text
id
session_id
language
transcript_text
segments_json
created_at
```

### Subtitles

```text
id
session_id
language
file_path
format
```

### Edited Videos

```text
id
session_id
edit_name
edit_type
orientation
file_path
status
timeline_json
```

### Advertisements

```text
id
session_id
asset_path
position
start_time
duration
configuration_json
```

### Processing Jobs

```text
id
session_id
job_type
status
progress
error_message
started_at
completed_at
```

---

# 11. Local LLM Responsibilities

Run the local LLM through Ollama.

The LLM should not directly modify files. It should generate structured editing instructions.

## LLM Tasks

* Clean transcript text
* Generate titles and descriptions
* Identify key moments
* Suggest camera cuts
* Detect advertisement insertion points
* Translate transcript text
* Create short-form video highlights
* Identify filler words or removable sections
* Generate captions and summaries

Example LLM output:

```json
{
  "videoTitle": "Product Introduction",
  "cuts": [
    {
      "start": 0,
      "end": 8,
      "camera": "camera01"
    },
    {
      "start": 8,
      "end": 15,
      "camera": "camera02"
    }
  ],
  "advertisementSlots": [
    {
      "start": 25,
      "duration": 8
    }
  ],
  "highlightSections": [
    {
      "start": 42,
      "end": 68,
      "reason": "Main product explanation"
    }
  ]
}
```

Validate this JSON before sending it to the FFmpeg worker.

---

# 12. Processing Pipeline

## Stage 1: Ingestion

* Create session
* Copy recordings into the session directory
* Validate that all four files exist
* Generate metadata using FFprobe

## Stage 2: Synchronisation

* Calculate camera and audio offsets
* Trim files to the common duration
* Generate synchronised proxy videos

## Stage 3: Transcription

* Convert audio to Whisper-compatible format
* Run faster-whisper
* Save transcript JSON
* Generate English SRT subtitles

## Stage 4: Translation

* Translate transcript
* Generate translated SRT files
* Generate translated audio using local TTS

## Stage 5: Edit Planning

* Send transcript to the local LLM
* Receive camera-cut timeline
* Validate cut timings
* Let the operator modify the timeline

## Stage 6: Video Editing

* Normalise video files
* Cut camera segments
* Combine segments
* Add master audio
* Add transitions
* Generate three or four edited versions

## Stage 7: Visual Processing

* Replace background
* Add subtitles
* Add advertisement banners
* Add logo or branding

## Stage 8: Final Rendering

Generate:

```text
final-landscape.mp4
final-portrait.mp4
```

## Stage 9: Preview

* Screen 11 loads portrait output
* Screen 12 loads landscape output
* Operator approves or requests changes

---

# 13. Job Queue Design

Heavy tasks must not run directly inside the Next.js request.

Use separate queues:

```text
media-ingestion
audio-transcription
translation
audio-generation
video-synchronisation
video-editing
background-processing
subtitle-rendering
advertisement-rendering
final-export
```

Job status:

```text
QUEUED
PROCESSING
COMPLETED
FAILED
CANCELLED
```

Example API response:

```json
{
  "jobId": "job-124",
  "status": "PROCESSING",
  "progress": 65,
  "currentStep": "Rendering subtitles"
}
```

Use WebSocket events to update the UI in real time.

---

# 14. Docker Architecture

Recommended Docker Compose services:

```yaml
services:
  web:
    build: ./apps/web
    ports:
      - "3000:3000"

  websocket:
    build: ./services/websocket-server
    ports:
      - "3001:3001"

  media-worker:
    build: ./services/media-worker
    volumes:
      - ./data:/data

  transcription-worker:
    build: ./services/transcription-worker
    volumes:
      - ./data:/data

  translation-worker:
    build: ./services/translation-worker
    volumes:
      - ./data:/data

  postgres:
    image: postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis

  ollama:
    image: ollama/ollama
    volumes:
      - ollama-data:/root/.ollama

  minio:
    image: minio/minio
    volumes:
      - minio-data:/data
```

The FFmpeg worker requires access to:

```text
/data/raw
/data/processed
/data/final
/data/backgrounds
/data/advertisements
```

---

# 15. GPU Support

A GPU is strongly recommended for:

* Whisper transcription
* Translation models
* Local LLM
* Background segmentation
* Video encoding

Recommended minimum development machine:

```text
CPU: 8 cores
RAM: 32 GB
Storage: 1 TB SSD
GPU: NVIDIA GPU with at least 12 GB VRAM
Operating system: Ubuntu Linux
```

For higher-resolution or multiple simultaneous sessions:

```text
RAM: 64 GB
GPU VRAM: 16–24 GB
Storage: 2–4 TB NVMe SSD
```

Use hardware-accelerated encoding when available:

```text
h264_nvenc
hevc_nvenc
```

---

# 16. User Interface Modules

## Main Control Dashboard

Display:

* Current session
* Camera recording status
* Audio recording status
* Processing jobs
* Connected screens
* Selected languages
* Selected advertisement
* Portrait render status
* Landscape render status

## Session Page

Include:

* Camera 01 preview
* Camera 02 preview
* Camera 03 preview
* Audio waveform
* Transcript
* Editing timeline
* Language settings
* Background settings
* Advertisement settings
* Export controls

## Screen Health Dashboard

Show:

```text
Screen 01: Connected
Screen 02: Connected
Screen 03: Disconnected
...
```

Also display:

* Last heartbeat
* Current media
* Playback state
* Device IP address
* Application version

---

# 17. Error Handling

The system should detect:

* Missing camera files
* Missing master audio
* Different frame rates
* Corrupted recordings
* Failed Whisper transcription
* Invalid translation output
* Missing FFmpeg binary
* FFmpeg render failure
* Disconnected screens
* Insufficient storage
* GPU memory errors
* Unsupported advertisement format

Never overwrite an existing final video directly.

Use versioned filenames:

```text
final-landscape-v1.mp4
final-landscape-v2.mp4
final-portrait-v1.mp4
```

Save FFmpeg logs for every processing job.

---

# 18. Security

* Keep the system on a private local network
* Protect the control dashboard with authentication
* Restrict file uploads by type and size
* Validate every FFmpeg path
* Never pass unvalidated user input directly into shell commands
* Use arrays of process arguments instead of constructing shell strings
* Add role-based access for administrators and operators
* Maintain an audit log for exports and configuration changes

---

# 19. Implementation Phases

## Phase 1: Basic Recording and Playback

Build:

* Session creation
* Camera file ingestion
* Audio file ingestion
* Screen 01 playback
* Screen 02 playback
* Screen 03 playback
* Basic control dashboard
* WebSocket screen control

Deliverable:

Three independent camera recordings can be selected and played on the first three screens.

---

## Phase 2: Transcription and Audio

Build:

* Whisper integration
* Transcript generation
* Screen 04 transcript viewer
* Timestamp highlighting
* Audio playback
* Transcript storage

Deliverable:

Recorded audio is automatically converted to timestamped text.

---

## Phase 3: Language Features

Build:

* Transcript translation
* SRT generation
* Local text-to-speech
* Screen 05 audio-language rotation
* Screen 08 subtitle-language rotation

Deliverable:

Users can switch audio and subtitle languages.

---

## Phase 4: Multi-Camera Editing

Build:

* Video synchronisation
* Camera-cut timeline
* FFmpeg editing service
* Three or four automatic edit styles
* Screen 06 edited-video selector

Deliverable:

The system automatically generates multiple edited versions from all three cameras.

---

## Phase 5: Background Processing

Build:

* Background upload
* Background selection
* Green-screen replacement
* Optional AI segmentation
* Screen 07 controls

Deliverable:

Users can change the video background and generate a new preview.

---

## Phase 6: Advertisement System

Build:

* Advertisement asset upload
* Banner-position controls
* Start-time and duration controls
* Screen 09 lower-third advertisement
* Screen 10 full-width or timed advertisement

Deliverable:

Advertisement banners can be added to the edited video.

---

## Phase 7: Final Export

Build:

* Portrait rendering
* Landscape rendering
* Screen 11 final portrait preview
* Screen 12 final landscape preview
* Approval workflow
* Download and archive controls

Deliverable:

The system generates final portrait and landscape videos.

---

## Phase 8: Physical Controls and Production Hardening

Build:

* Physical button controller
* MQTT or HTTP button events
* Screen heartbeat monitoring
* Automatic recovery
* Logging
* Storage cleanup
* Docker deployment
* Backup and restore

Deliverable:

A stable installation that can run continuously inside the room.

---

# 20. Recommended MVP Scope

For the first working version, implement only:

1. Three camera file uploads
2. One master audio upload
3. Camera playback on Screens 01–03
4. Whisper transcription on Screen 04
5. Subtitle-language switching on Screen 08
6. One FFmpeg multi-camera edit
7. One advertisement banner
8. Portrait preview on Screen 11
9. Landscape preview on Screen 12
10. Web-based buttons before physical-button integration

After the MVP works reliably, add:

* Audio translation
* Local text-to-speech
* AI camera selection
* Automatic background replacement
* Three or four editing styles
* Physical buttons
* Advanced screen monitoring

---

# 21. Final Processing Flow

```text
Start recording
      │
      ▼
Capture three camera videos and one audio recording
      │
      ▼
Create a session and validate files
      │
      ▼
Synchronise recordings
      │
      ▼
Run Whisper transcription
      │
      ▼
Generate translated transcripts and subtitles
      │
      ▼
Generate translated audio
      │
      ▼
Local LLM creates camera-cut suggestions
      │
      ▼
FFmpeg generates three or four edited videos
      │
      ▼
Operator selects an edited version
      │
      ▼
Apply background
      │
      ▼
Select subtitle and audio language
      │
      ▼
Add advertisements
      │
      ▼
Render portrait and landscape output
      │
      ▼
Preview on Screens 11 and 12
      │
      ▼
Approve and export
```

---

# 22. Important Recommendation

Do not attempt to build all twelve screens and all AI features at the same time.

First complete this core pipeline:

```text
Record → Synchronise → Transcribe → Edit → Preview
```

Once this pipeline works reliably, add:

```text
Translation → Background change → Advertisements → Physical buttons
```

This reduces technical risk and makes problems easier to identify.
