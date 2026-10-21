# Worker performance tests

This folder measures worker startup performance safely. It starts each worker,
waits for its ready signal, records startup latency and test-runner memory,
then terminates the worker. It does not submit real media jobs.

Run all workers:

```bash
npx tsx script/worker-performance/run-all.ts
```

Run multiple baseline rounds:

```powershell
$env:WORKER_PERF_RUNS='3'
npx tsx script/worker-performance/run-all.ts
```

Override the startup timeout:

```powershell
$env:WORKER_PERF_TIMEOUT_MS='60000'
npx tsx script/worker-performance/run-all.ts
```

Reports are written to `results/latest.json` and `results/latest.csv`, which
are ignored by Git. A future job-performance layer can reuse this runner after
isolated audio/video fixtures and test-only storage buckets are provided.
