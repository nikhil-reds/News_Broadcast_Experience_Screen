import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { WORKERS, runs } from "./config";
import { measureWorker, type PerformanceResult } from "./run-worker";

async function main() {
  const results: PerformanceResult[] = [];
  for (let run = 1; run <= runs; run++) {
    for (const worker of WORKERS) {
      process.stdout.write(`Run ${run}/${runs} · ${worker.name}... `);
      const result = await measureWorker(worker);
      results.push({ ...result, worker: `${worker.name}#${run}` });
      process.stdout.write(`${result.status}${result.startupMs === null ? "" : ` (${result.startupMs}ms)`}\n`);
    }
  }

  const outputDir = resolve(process.cwd(), "script/worker-performance/results");
  mkdirSync(resolve(outputDir, "raw"), { recursive: true });
  const report = { generatedAt: new Date().toISOString(), runs, results };
  writeFileSync(resolve(outputDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  const csv = [
    "worker,group,status,startupMs,runnerRssMb,exitCode,error",
    ...results.map((result) => [result.worker, result.group, result.status, result.startupMs ?? "", result.runnerRssMb ?? "", result.exitCode ?? "", JSON.stringify(result.error ?? "")].join(",")),
  ].join("\n");
  writeFileSync(resolve(outputDir, "latest.csv"), `${csv}\n`);
  console.table(results);
  process.exitCode = results.some((result) => result.status !== "PASS") ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
