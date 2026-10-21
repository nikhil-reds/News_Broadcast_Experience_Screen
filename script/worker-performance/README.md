# Worker and pipeline performance tests

This folder measures worker startup performance safely. It starts each worker,
waits for its ready signal, records startup latency and test-runner memory,
then terminates the worker. It does not submit real media jobs.

Test each worker independently:

```bash
npm run worker:performance
```

Test whole-pipeline readiness with all workers starting concurrently:

```bash
npm run pipeline:performance
```

Run multiple baseline rounds:

```powershell
$env:WORKER_PERF_RUNS='3'
npm run worker:performance
```

Override the startup timeout:

```powershell
$env:WORKER_PERF_TIMEOUT_MS='60000'
npm run worker:performance
```

Reports are written to `results/workers-latest.json` and
`results/pipeline-latest.json`, which are ignored by Git. See `PLAN.md` for the
safe design for a future real media end-to-end benchmark.
