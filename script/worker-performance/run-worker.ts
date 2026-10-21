import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { timeoutMs, type WorkerDefinition } from "./config";

export type PerformanceResult = {
  worker: string;
  group: string;
  entry: string;
  status: "PASS" | "FAIL" | "TIMEOUT";
  startupMs: number | null;
  runnerRssMb: number | null;
  exitCode: number | null;
  error: string | null;
};

const readyPattern = /ready and listening|starting — scan|starting - scan/i;

export function measureWorker(worker: WorkerDefinition, root = process.cwd()): Promise<PerformanceResult> {
  const entryPath = resolve(root, worker.entry);
  if (!existsSync(entryPath)) {
    return Promise.resolve({
      worker: worker.name,
      group: worker.group,
      entry: worker.entry,
      status: "FAIL",
      startupMs: null,
      runnerRssMb: null,
      exitCode: null,
      error: "worker entry file does not exist",
    });
  }

  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [resolve(root, "node_modules/tsx/dist/cli.mjs"), entryPath], {
      cwd: root,
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "development" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let startupMs: number | null = null;
    let peakRss = 0;
    let settled = false;
    const sample = setInterval(() => {
      try {
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
      } catch {
        // The process may already be exiting.
      }
    }, 100);
    const finish = (status: PerformanceResult["status"], error: string | null, exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearInterval(sample);
      if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
      resolveResult({
        worker: worker.name,
        group: worker.group,
        entry: worker.entry,
        status,
        startupMs,
        runnerRssMb: peakRss ? Number((peakRss / 1024 / 1024).toFixed(2)) : null,
        exitCode,
        error: error || (output.trim().split("\n").slice(-1)[0] ?? null),
      });
    };
    const onOutput = (data: Buffer) => {
      output += data.toString();
      if (startupMs === null && readyPattern.test(output)) {
        startupMs = Date.now() - startedAt;
        finish("PASS", null, null);
      }
    };
    child.stdout.on("data", onOutput);
    child.stderr.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.on("error", (error) => finish("FAIL", error.message, null));
    child.on("exit", (code) => {
      if (!settled) finish(code === 0 ? "FAIL" : "FAIL", `exited before ready with code ${code}`, code);
    });
    setTimeout(() => finish("TIMEOUT", `ready signal not received within ${timeoutMs}ms`, null), timeoutMs);
  });
}
