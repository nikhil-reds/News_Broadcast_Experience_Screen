import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { verifyAdminSession } from "@/lib/auth";

const root = process.cwd();
const dir = resolve(root, "script/worker-performance/results");
const stateFile = resolve(dir, "health-check-latest.json");
const steps = [
  ["worker-health", "script/worker-health.ts"],
  ["worker-performance", "script/worker-performance/run-workers.ts"],
  ["pipeline-performance", "script/worker-performance/run-pipeline.ts"],
] as const;

function readState() { try { return JSON.parse(readFileSync(stateFile, "utf8")); } catch { return null; } }

export async function GET() { await verifyAdminSession(); return NextResponse.json(readState() ?? { status: "idle", steps: [] }); }

export async function POST() {
  await verifyAdminSession();
  mkdirSync(dir, { recursive: true });
  const existing = readState();
  if (existing?.status === "running") return NextResponse.json(existing, { status: 202 });
  const runId = crypto.randomUUID();
  const state = { runId, status: "running", startedAt: new Date().toISOString(), currentStep: steps[0][0], steps: steps.map(([name]) => ({ name, status: "queued" })), logs: [] as string[] };
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
  void runBenchmark(runId);
  return NextResponse.json(state, { status: 202 });
}

async function runBenchmark(runId: string) {
  const state = readState(); if (!state || state.runId !== runId) return;
  for (const [index, [name, entry]] of steps.entries()) {
    state.currentStep = name; state.steps[index].status = "running"; writeFileSync(stateFile, JSON.stringify(state, null, 2));
    const result = await runCommand(entry);
    state.steps[index] = { name, status: result.code === 0 ? "passed" : "failed", exitCode: result.code, output: result.output.slice(-4000) };
    state.logs.push(`${name}: ${result.code === 0 ? "passed" : "failed"}`);
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    if (result.code !== 0) { state.status = "failed"; state.finishedAt = new Date().toISOString(); writeFileSync(stateFile, JSON.stringify(state, null, 2)); return; }
  }
  state.status = "completed"; state.finishedAt = new Date().toISOString();
  state.reports = { workerHealth: readJson("script/worker-health/results/latest.json"), workerPerformance: readJson("script/worker-performance/results/workers-latest.json"), pipelinePerformance: readJson("script/worker-performance/results/pipeline-latest.json") };
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function readJson(relative: string) { const file = resolve(root, relative); return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null; }
function runCommand(entry: string) { return new Promise<{ code: number; output: string }>((resolveResult) => { const child = spawn(process.execPath, [resolve(root, "node_modules/tsx/dist/cli.mjs"), resolve(root, entry)], { cwd: root, env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "development" }, stdio: ["ignore", "pipe", "pipe"] }); let output = ""; child.stdout.on("data", (data) => { output += data.toString(); }); child.stderr.on("data", (data) => { output += data.toString(); }); child.on("error", (error) => resolveResult({ code: 1, output: `${output}\n${error.message}` })); child.on("close", (code) => resolveResult({ code: code ?? 1, output })); }); }
