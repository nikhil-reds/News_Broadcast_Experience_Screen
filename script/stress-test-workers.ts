import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { AUDIO_BUCKET, VIDEO_BUCKET, uploadObject } from "@/lib/minio";
import { enqueueHighlightAnalysis, enqueueTranscription } from "@/lib/queue";

const RUNS = Number(process.env.WORKER_STRESS_RUNS || 100);
const POLL_MS = Number(process.env.WORKER_STRESS_POLL_MS || 5000);
const TIMEOUT_MS = Number(process.env.WORKER_STRESS_TIMEOUT_MS || 24 * 60 * 60 * 1000);
const sourceVideo = path.resolve(process.env.WORKER_STRESS_VIDEO || "public/demo/C0001.MP4");
const sourceAudio = path.resolve(process.env.WORKER_STRESS_AUDIO || "public/demo/demo-audio.wav");

type TaskRow = { taskType: string; status: string; attempt: number; maxAttempts: number; errorMessage: string | null; startedAt: Date | null; completedAt: Date | null };

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function duration(row: TaskRow): number | null {
  if (!row.startedAt || !row.completedAt) return null;
  return row.completedAt.getTime() - row.startedAt.getTime();
}

async function createRun(video: Buffer, audio: Buffer, index: number, stamp: number) {
  const session = await prisma.broadcastSession.create({ data: { status: "processing", pipelineStatus: "processing" } });
  const suffix = `${stamp}-run-${String(index + 1).padStart(3, "0")}`;
  const files = [1, 2, 3].map((camera) => `stress-${suffix}-camera-${camera}.mp4`);
  for (const filename of files) {
    await uploadObject(VIDEO_BUCKET, filename, video, "video/mp4");
    await prisma.videoRecording.create({ data: { filename, url: `/api/asset/${VIDEO_BUCKET}/${filename}`, bucket: VIDEO_BUCKET, objectKey: filename, contentType: "video/mp4", size: video.length, sessionId: session.id } });
  }
  const audioFilename = `stress-${suffix}.wav`;
  await uploadObject(AUDIO_BUCKET, audioFilename, audio, "audio/wav");
  await prisma.audioFile.create({ data: { filename: audioFilename, url: `/api/asset/${AUDIO_BUCKET}/${audioFilename}`, bucket: AUDIO_BUCKET, objectKey: audioFilename, contentType: "audio/wav", size: audio.length, sessionId: session.id } });
  await enqueueTranscription(audioFilename, session.id);
  await enqueueHighlightAnalysis(files[0], files[1], files[2], session.id);
  return session.id;
}

async function printOverview(ids: string[], label: string) {
  const rows = await prisma.generationTask.findMany({ where: { generationId: { in: ids } }, orderBy: [{ generationId: "asc" }, { taskType: "asc" }] });
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) || 0) + 1);
  const failures = rows.filter((row) => row.status === "failed");
  const complete = rows.filter((row) => row.status === "completed" && duration(row) !== null);
  const averageMs = complete.length ? complete.reduce((sum, row) => sum + (duration(row) || 0), 0) / complete.length : null;
  console.log(`\n${label}`);
  console.log(`Runs: ${ids.length} | Tasks: ${rows.length} | ${[...counts].map(([status, count]) => `${status}=${count}`).join(" | ")}`);
  console.log(`Completed-task average latency: ${averageMs === null ? "n/a" : `${(averageMs / 1000).toFixed(2)}s`}`);
  if (failures.length) {
    console.log("Failures:");
    for (const row of failures.slice(0, 20)) console.log(`  ❌ ${row.generationId} ${row.taskType} attempt=${row.attempt}/${row.maxAttempts}: ${row.errorMessage || "unknown error"}`);
  }
  const byType = new Map<string, { completed: number; failed: number; active: number; latencies: number[] }>();
  for (const row of rows) {
    const item = byType.get(row.taskType) || { completed: 0, failed: 0, active: 0, latencies: [] };
    if (row.status === "completed") item.completed++;
    else if (row.status === "failed") item.failed++;
    else item.active++;
    const ms = duration(row); if (ms !== null) item.latencies.push(ms);
    byType.set(row.taskType, item);
  }
  console.log("Worker overview:");
  for (const [type, item] of [...byType].sort()) {
    const avg = item.latencies.length ? `${(item.latencies.reduce((a, b) => a + b, 0) / item.latencies.length / 1000).toFixed(2)}s` : "n/a";
    console.log(`  ${item.failed ? "❌" : item.active ? "⏳" : "✅"} ${type}: completed=${item.completed}, failed=${item.failed}, active=${item.active}, avg=${avg}`);
  }
  return { rows, failures };
}

async function main() {
  const runs = Number(arg("runs") || RUNS);
  const watch = arg("watch") !== "false";
  if (!Number.isInteger(runs) || runs < 1 || runs > 1000) throw new Error("--runs must be an integer between 1 and 1000");
  const [video, audio] = await Promise.all([readFile(sourceVideo), readFile(sourceAudio)]);
  const ids: string[] = [];
  const stamp = Date.now();
  console.log(`Submitting ${runs} distinct worker runs using ${sourceVideo}`);
  for (let index = 0; index < runs; index++) {
    ids.push(await createRun(video, audio, index, stamp));
    if ((index + 1) % 10 === 0 || index + 1 === runs) console.log(`Submitted ${index + 1}/${runs}`);
  }
  console.log(`Generation IDs saved in memory: ${ids.length}`);
  if (!watch) { await printOverview(ids, "Initial status overview"); return; }
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await printOverview(ids, `Status at ${new Date().toISOString()}`);
    const terminal = result.rows.length > 0 && result.rows.every((row) => ["completed", "failed"].includes(row.status));
    if (terminal) break;
    await sleep(POLL_MS);
  }
  await printOverview(ids, "Final status overview");
}

main().catch(async (error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
