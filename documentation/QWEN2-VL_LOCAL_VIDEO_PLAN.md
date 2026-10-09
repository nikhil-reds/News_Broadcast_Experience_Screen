# Qwen2-VL local video-analysis plan

## Decision

Automatic Gemini highlight analysis is disabled at upload time. Raw camera recordings continue to be stored in MinIO and indexed in `video_recordings`. The existing FFmpeg render code should remain available, but it must only run after a local-model analysis has produced a validated segment manifest.

## Target pipeline

1. Upload the three synchronized camera files as today.
2. A dedicated `qwen-video-analysis` BullMQ job reads the files from MinIO, samples frames at a bounded rate, and extracts the master-audio transcript with the existing Whisper path.
3. Send compact frame batches plus transcript/timecode context to a local Qwen2-VL service. Prefer a model/runtime that supports video or image sequences; keep the adapter HTTP-based so Ollama/vLLM can be swapped without changing workers.
4. Require strict JSON output: title, camera, start, end, reason, confidence. Validate with the existing segment guardrails and reject empty/unsafe manifests.
5. Persist the model name, prompt version, source filenames, timestamps, and normalized segments as an analysis sidecar in MinIO and as task metadata.
6. Enqueue the existing FFmpeg highlight-render job only after validation succeeds.
7. Publish the rendered asset to Screen 06. On analysis failure, leave raw recordings available and show a retryable status; never create a black or stale replacement asset.

## Implementation phases

### Phase 1 — adapter and contract

- Add `lib/qwen-vl.ts` with configurable `QWEN_API_URL`, `QWEN_VL_MODEL`, connect/read timeouts, and structured error handling.
- Define one model-neutral `HighlightAnalysisResult` schema and reuse `sanitizeSegments`.
- Add a health check and a small local fixture test for malformed, out-of-range, overlapping, and valid responses.

### Phase 2 — local worker

- Add `app/worker/qwen-video-analysis.ts` and a queue payload keyed by `sessionId`.
- Download from MinIO to a temporary directory, sample frames with FFmpeg, call Qwen, persist the sidecar, and clean up in `finally`.
- Add retry/backoff, heartbeat updates, concurrency limits, and idempotency by session/source filenames.

### Phase 3 — controlled cutover

- Replace the removed automatic highlight enqueue with the Qwen queue behind `QWEN_VIDEO_ANALYSIS_ENABLED=false` by default.
- Run shadow analysis against saved sessions without publishing output; compare segment validity, editorial usefulness, latency, and GPU memory.
- Enable publication only when acceptance thresholds are met, then remove Gemini-specific highlight imports and comments.

### Phase 4 — UI and operations

- Make Screen 06 display `queued`, `analyzing`, `rendering`, `ready`, and `failed` states from the existing publication channel.
- Add a manual retry endpoint that reuses the same session idempotency key.
- Add metrics for queue latency, inference latency, render latency, failure reason, GPU memory, and percentage of sessions producing usable segments.

## Acceptance criteria

- No upload performs a Gemini video upload or Gemini highlight call.
- Raw recordings remain playable after any model failure.
- At least 95% of test sessions produce a valid non-empty manifest.
- Segment timestamps stay within source bounds, use the shared session timeline, and render without A/V drift.
- A repeated job does not create duplicate sidecars or reels.
- The local service can be stopped and restarted without wedging the BullMQ queue.

## Open choices before implementation

- Exact Qwen2-VL checkpoint and runtime based on available GPU VRAM.
- Frame sampling policy: uniform baseline first, then transcript/shot-change adaptive sampling.
- Whether Screen 06 should show camera 01 raw footage while analysis is disabled, or remain an empty preview until a replacement reel exists.
