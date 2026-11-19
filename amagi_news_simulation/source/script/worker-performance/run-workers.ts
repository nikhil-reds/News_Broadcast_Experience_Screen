import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { WORKERS, runs } from "./config";
import { measureWorker, type PerformanceResult } from "./run-worker";

/** Measures each worker independently: startup latency, readiness and memory. */
async function main() {
  const results: PerformanceResult[] = [];
  for (let run = 1; run <= runs; run++) {
    for (const worker of WORKERS) {
      process.stdout.write(`Worker ${run}/${runs} · ${worker.name}... `);
      const result = await measureWorker(worker);
      results.push({ ...result, worker: `${worker.name}#${run}` });
      process.stdout.write(`${result.status}${result.startupMs === null ? "" : ` (${result.startupMs}ms)`}\n`);
    }
  }

  const outputDir = resolve(process.cwd(), "script/worker-performance/results");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "workers-latest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), runs, scope: "individual-workers", results }, null, 2)}\n`);
  console.table(results);
  process.exitCode = results.some((result) => result.status !== "PASS") ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
