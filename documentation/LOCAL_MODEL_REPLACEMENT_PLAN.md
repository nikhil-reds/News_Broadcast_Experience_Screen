# Local model replacement plan

## Target architecture

- Vision service: Qwen2.5-VL, local HTTP service, sampled frames plus transcript context to validated highlight JSON.
- Translation service: MADLAD-400 behind a local translation API. The current Qwen translation adapter is the temporary fallback until MADLAD is deployed.
- Speech service: CosyVoice for voice cloning, with XTTS or Piper as explicit local fallback providers.
- Video renderer: FFmpeg only. It receives a validated segment manifest and never calls a model.
- Orchestration: Next.js route handlers enqueue BullMQ jobs; workers call only internal local services; MinIO stores source media and sidecars.

## Migration order

1. Deploy local service contracts and health checks for Qwen2.5-VL, MADLAD-400, speech, and FFmpeg.
2. Implement the Qwen2.5-VL adapter and replace the retired highlight-analysis queue with a local vision worker.
3. Validate and persist a versioned segment manifest before enqueueing FFmpeg rendering.
4. Switch translation from temporary Qwen text generation to MADLAD-400, preserving segment order and timing.
5. Keep CosyVoice as the primary speech engine; add XTTS/Piper fallback with explicit engine metadata.
6. Add shadow mode, retries, idempotency, heartbeats, GPU/CPU metrics, and failure states before enabling publication.

## Contracts

Every model service must expose a private internal endpoint with request id, model id, timeout, and health status. Responses must be schema-validated at the worker boundary. Video analysis returns `{ title, segments, audio }`; each segment contains `camera`, `start`, `end`, `reason`, and optional confidence. Invalid or empty output must fail the job without deleting raw recordings.

## Acceptance criteria

- No Gemini package, import, worker, environment variable, or network endpoint remains.
- Raw recordings are playable even when a local model is unavailable.
- Duplicate sessions produce no duplicate analysis sidecars or rendered reels.
- Translation preserves segment count/order and speech preserves timing metadata.
- Every output records the local model/runtime version for reproducibility.
- End-to-end processing is observable by stage: queued, analyzing, translating, synthesizing, rendering, ready, failed.
