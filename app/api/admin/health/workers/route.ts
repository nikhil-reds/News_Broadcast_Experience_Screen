import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import { verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/redis";
import { readWorkerHealth } from "@/lib/worker-health";

const WORKERS = [
  ["audio-transcription", "Audio"], ["highlight-analysis", "Highlights"], ["highlight-reel", "Highlights"],
  ["german-transcript", "Translation"], ["hindi-transcript", "Translation"], ["french-transcript", "Translation"], ["spanish-transcript", "Translation"],
  ["german-audio", "TTS"], ["hindi-audio", "TTS"], ["french-audio", "TTS"], ["spanish-audio", "TTS"],
  ["translations", "Translation"], ["tts", "TTS"], ["green-screen-compose", "Video"], ["video-export", "Video"], ["watchdog", "Infrastructure"],
] as const;

export async function GET() {
  await verifyAdminSession();
  const checkedAt = new Date().toISOString();
  const [health, processing, failed, stale, redis] = await Promise.all([
    readWorkerHealth(),
    prisma.generationTask.count({ where: { status: "processing" } }),
    prisma.generationTask.count({ where: { status: "failed" } }),
    prisma.generationTask.count({ where: { status: "processing", lastHeartbeatAt: { lt: new Date(Date.now() - 10 * 60_000) } } }),
    redisConnection.ping().then(() => ({ status: "healthy" })).catch((error: unknown) => ({ status: "down", error: error instanceof Error ? error.message : "Redis unavailable" })),
  ]);
  const byName = new Map(health.map((item) => [item.workerName.replace(/-worker$/, ""), item]));
  const workers = WORKERS.map(([name, group]) => {
    const item = byName.get(name);
    const ageMs = item ? Date.now() - Date.parse(item.lastHeartbeatAt) : Infinity;
    const status = !item ? "unknown" : ageMs > 90_000 ? "stale" : item.status === "failed" ? "degraded" : "healthy";
    return { ...item, name, group, status, heartbeatAgeMs: Number.isFinite(ageMs) ? ageMs : null };
  });
  const healthy = workers.filter((worker) => worker.status === "healthy").length;
  return NextResponse.json({ checkedAt, checkDurationMs: Date.now() - Date.parse(checkedAt), overall: healthy === workers.length && redis.status === "healthy" ? "healthy" : healthy ? "degraded" : "down", summary: { healthy, total: workers.length, processing, failed, stale }, dependencies: { redis }, workers, pipeline: { processing, failed, stale } });
}
