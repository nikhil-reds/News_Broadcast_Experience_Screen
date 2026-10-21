import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { WORKERS, timeoutMs } from "./config";
import { measureWorker, type PerformanceResult } from "./run-worker";

/**
 * Measures whole-pipeline readiness by starting every worker concurrently.
 * This deliberately does not enqueue real media jobs or change application data.
 */
async function main() {
  const startedAt = Date.now();
  process.stdout.write(`Starting ${WORKERS.length} workers concurrently...\n`);
  const results: PerformanceResult[] = await Promise.all(WORKERS.map((worker) => measureWorker(worker)));
  const durationMs = Date.now() - startedAt;
  const healthy = results.filter((result) => result.status === "PASS").length;
  const report = {
    generatedAt: new Date().toISOString(),
    scope: "whole-pipeline-readiness",
    workerCount: WORKERS.length,
    timeoutMs,
    durationMs,
    healthy,
    failed: WORKERS.length - healthy,
    status: healthy === WORKERS.length ? "PASS" : "FAIL",
    results,
  };
  const outputDir = resolve(process.cwd(), "script/worker-performance/results");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "pipeline-latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.table({ status: report.status, durationMs, healthy, total: WORKERS.length });
  process.exitCode = report.status === "PASS" ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
