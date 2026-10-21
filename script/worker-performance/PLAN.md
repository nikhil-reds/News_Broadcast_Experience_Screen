# Worker performance test plan

## 1. Individual worker benchmark

`run-workers.ts` starts each worker in isolation, waits for its ready signal,
records startup latency and peak runner memory, then terminates it. It should
be used for comparing workers and finding slow or failing startup paths.

Command:

```powershell
npm run worker:performance
```

Output: `results/workers-latest.json`.

## 2. Whole-pipeline readiness benchmark

`run-pipeline.ts` starts all configured workers concurrently. It measures the
time until the complete worker fleet is ready and reports how many workers are
healthy. It uses no real media jobs, so it is safe to run repeatedly.

Command:

```powershell
npm run pipeline:performance
```

Output: `results/pipeline-latest.json`.

## 3. Real end-to-end pipeline benchmark

The next phase should use a dedicated fixture generation ID and test assets:

1. Create an isolated test generation/session.
2. Enqueue transcription, translation, TTS, highlight, green-screen and video
   export stages using the same queue functions as production.
3. Record enqueue-to-processing and processing-to-completion time for every
   `GenerationTask`.
4. Wait for the final pipeline status and verify expected output objects exist.
5. Clean up only the fixture generation, queue jobs and fixture assets.
6. Write stage timings, total duration, failures and environment metadata to a
   separate `pipeline-e2e-latest.json` report.

This phase must not reuse a user's real session or production media. It also
requires stable local fixtures for external services such as Whisper, Qwen,
CosyVoice, MinIO and FFmpeg so results are reproducible.
