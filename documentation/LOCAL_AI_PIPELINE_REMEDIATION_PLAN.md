# Local AI broadcast pipeline remediation plan

## Objective

Make the broadcast pipeline fully local, recoverable, and production-safe:

```text
Capture → PostgreSQL/MinIO → BullMQ → local AI services → validated assets → screens
```

PostgreSQL remains the source of truth for state and relationships. MinIO stores bytes. Redis/BullMQ coordinates work and retries. Workers must never publish an asset until validation and database persistence have succeeded.

## Current gaps

1. The Qwen service is not defined in `compose.yaml`.
2. Translation and vision use cases do not have separate endpoints or model settings.
3. The Qwen2.5-VL analysis worker is not implemented.
4. FFmpeg has a renderer but needs a validated local-vision manifest.
5. CosyVoice language support, especially Hindi, is not yet verified.
6. Translation timing and dubbed-audio duration are not treated as separate concerns.
7. Retry/watchdog paths need stable output identities and reconciliation after partial uploads.
8. Screen readiness must be based on published, playable assets rather than queued jobs.
9. `app/worker/all.ts` is a legacy launcher and can accidentally create duplicate workers.

## Target service contract

Use separate configuration for each model capability:

```env
QWEN_TRANSLATION_URL=http://translation-model:8000
QWEN_TRANSLATION_MODEL=madlad400
QWEN_VL_URL=http://vision-model:8000
QWEN_VL_MODEL=Qwen2.5-VL-7B-Instruct
COSYVOICE_API_URL=http://cosyvoice:50000
```

Each local model service must expose `/health` and a private inference endpoint with request ID, model version, timeout, and structured error responses. No browser route should call a model service directly.

## Phase 1 — service and configuration foundation

### Work

- Add a dedicated `qwen`/vision service to Compose, or document the externally managed runtime explicitly.
- Add separate translation and vision variables; remove the shared `QWEN_MODEL` ambiguity.
- Add Compose health checks and startup dependencies for Postgres, Redis, MinIO, Whisper, translation, vision, and CosyVoice.
- Add resource limits and concurrency defaults so CPU FFmpeg, CPU Whisper, and model memory do not starve each other.
- Add a single supported worker launcher; mark `all.ts` legacy and prevent duplicate launch in development.

### Exit criteria

- `docker compose config` succeeds.
- Every configured service resolves by Compose DNS, not `localhost`.
- Each health endpoint is reachable from the worker process.
- A cold start does not enqueue work before dependencies are healthy.

## Phase 2 — Qwen2.5-VL analysis worker

### Work

- Add `app/worker/qwen-video-analysis.ts`.
- Add a dedicated queue and task type keyed by `sessionId` plus the three source recording IDs.
- Download or stream synchronized camera recordings from MinIO.
- Sample frames with FFmpeg at configurable intervals; start with uniform sampling and add shot-change/transcript-guided sampling later.
- Send frame batches and transcript/timecode context to Qwen2.5-VL.
- Require structured output:

```json
{
  "title": "...",
  "segments": [
    {
      "camera": 1,
      "start": 12.5,
      "end": 20.0,
      "reason": "...",
      "confidence": 0.86
    }
  ]
}
```

- Record model name, model version, prompt version, source IDs, and frame-sampling settings.

### Exit criteria

- A worker restart does not duplicate analysis.
- A malformed model response fails safely without deleting raw recordings.
- A valid manifest is persisted before FFmpeg is queued.
- Analysis status is visible as queued, processing, completed, or failed.

## Phase 3 — manifest validation and FFmpeg integration

### Work

- Move shared segment types and sanitization into a model-neutral module.
- Validate camera IDs, finite timestamps, source boundaries, minimum/maximum segment duration, total reel duration, ordering, and overlap rules.
- Confirm all referenced source objects exist in MinIO before rendering.
- Keep FFmpeg responsible only for deterministic rendering.
- Validate rendered output with ffprobe: playable stream, expected duration, audio presence, and non-zero size.
- Upload using a deterministic object key and checksum.
- Commit the output database record only after the upload and probe succeed.

### Exit criteria

- Invalid manifests never reach FFmpeg.
- A repeated job reuses or verifies the same output instead of creating duplicates.
- A partial MinIO upload is detectable and recoverable.

## Phase 4 — translation, subtitles, and speech timing

### Work

- Replace the temporary Qwen text translation adapter with MADLAD-400 behind the translation endpoint.
- Preserve segment count, source IDs, and original start/end times.
- Treat translated text duration as different from source duration.
- Define subtitle policy: preserve source cue windows, split long cues, and clamp overlaps.
- Benchmark German, Hindi, French, and Spanish with representative broadcast material.
- Verify CosyVoice output language quality and speaker-reference behavior.
- Add XTTS or Piper as an explicit local fallback only after language-specific acceptance tests.

### Exit criteria

- Translation never changes segment order or silently drops text.
- Subtitle cues remain synchronized and non-overlapping.
- Each generated audio file records engine, model, language, speaker profile, duration, and checksum.
- Unsupported language/model combinations fail clearly instead of producing misleading audio.

## Phase 5 — idempotency, recovery, and reconciliation

### Work

- Use stable job IDs derived from session ID, source recording versions, operation, and model/prompt version.
- Store source IDs, output key, checksum, job ID, model/runtime version, and timestamps in task metadata.
- Make every worker safe to retry after each external side effect.
- Add reconciliation for “MinIO upload succeeded, database commit failed.”
- Make watchdog retries conditional on task state, job state, generation freshness, and output existence.
- Add failure cleanup only for objects owned by the failed job; never delete source recordings.

### Failure tests

- Worker crash before inference.
- Worker crash after inference but before sidecar commit.
- Worker crash after MinIO upload but before database commit.
- Redis restart during an active job.
- MinIO unavailable during download and upload.
- Model timeout and malformed JSON.
- Duplicate queue submission.
- Stale generation retry.

## Phase 6 — screen readiness and end-to-end validation

| Screen | Required readiness |
| --- | --- |
| 01–03 | Raw camera asset exists and passes playback check |
| 04 | Timestamped transcript exists |
| 05 | Translation and selected-language audio status is known |
| 06 | Published edited-video asset exists and is playable |
| 07 | Background composition is complete |
| 08 | Video, selected language, and subtitle cues are compatible |
| 09–10 | Industry and brand selections are valid |
| 11 | Highlight/export asset is ready |
| 12 | Required video/audio/background/subtitle assets are all ready |

The UI should show pending/unavailable states explicitly. The existence of a queued job must not be presented as a ready broadcast asset.

## Recommended implementation order

1. Fix Compose services, DNS, health checks, and separate model configuration.
2. Implement Qwen2.5-VL analysis and model-neutral manifest validation.
3. Connect validated manifests to the existing FFmpeg renderer.
4. Harden idempotency, checksums, reconciliation, and watchdog behavior.
5. Verify translation and speech language support, including Hindi.
6. Update screen readiness and error states.
7. Run a full camera-to-Screen-12 test with forced failures and retries.

## Definition of done

- One complete session can go from three camera uploads to Screen 12 without manual database edits.
- No incomplete or unplayable asset is published.
- Every stage can be retried safely.
- Raw recordings survive all downstream failures.
- Local model/runtime versions are auditable for every generated artifact.
- Docker startup, health checks, worker launch, and shutdown are repeatable.
