import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const tsx = resolve(root, "node_modules/tsx/dist/cli.mjs");
const timeoutMs = Number(process.env.WORKER_HEALTH_TIMEOUT_MS || 20_000);

const workers = [
  ["audio-transcription", "app/worker/audio-transcription.ts"],
  ["highlight-analysis", "app/worker/highlight-analysis.ts"],
  ["highlight-reel", "app/worker/highlight-reel.ts"],
  ["german-transcript", "app/worker/german-transcript.ts"],
  ["hindi-transcript", "app/worker/hindi-transcript.ts"],
  ["french-transcript", "app/worker/french-transcript.ts"],
  ["spanish-transcript", "app/worker/spanish-transcript.ts"],
  ["german-audio", "app/worker/german-audio.ts"],
  ["hindi-audio", "app/worker/hindi-audio.ts"],
  ["french-audio", "app/worker/french-audio.ts"],
  ["spanish-audio", "app/worker/spanish-audio.ts"],
  ["translations", "app/worker/translations.ts"],
  ["tts", "app/worker/tts.ts"],
  ["green-screen-compose", "app/worker/green-screen-compose.ts"],
  ["video-export", "app/worker/video-export.ts"],
  ["watchdog", "app/worker/watchdog.ts"],
] as const;

type Result = { name: string; status: "PASS" | "FAIL" | "TIMEOUT"; detail: string };

function testWorker(name: string, entry: string): Promise<Result> {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [tsx, resolve(root, entry)], {
      cwd: root,
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "development" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    const finish = (result: Result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!child.killed) child.kill("SIGTERM");
      resolveResult(result);
    };
    const onData = (data: Buffer) => {
      output += data.toString();
      if (/ready and listening|starting — scan|starting - scan/i.test(output)) {
        finish({ name, status: "PASS", detail: "startup health check passed" });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.on("error", (error) => finish({ name, status: "FAIL", detail: error.message }));
    child.on("exit", (code) => {
      if (!settled && code !== 0) finish({ name, status: "FAIL", detail: `exited with code ${code}` });
    });
    const timer = setTimeout(() => {
      finish({ name, status: "TIMEOUT", detail: output.trim().split("\n").slice(-1)[0] || "no ready signal" });
    }, timeoutMs);
  });
}

async function main() {
  const results: Result[] = [];
  for (const [name, entry] of workers) {
    if (!existsSync(resolve(root, entry))) {
      results.push({ name, status: "FAIL", detail: `missing entry: ${entry}` });
      continue;
    }
    process.stdout.write(`Testing ${name}... `);
    const result = await testWorker(name, entry);
    results.push(result);
    process.stdout.write(`${result.status}\n`);
  }

  const reportDir = resolve(root, "script/worker-health/results");
  mkdirSync(reportDir, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), timeoutMs, results };
  writeFileSync(resolve(reportDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.table(results.map(({ name, status, detail }) => ({ name, status, detail })));
  process.exitCode = results.some((result) => result.status !== "PASS") ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
