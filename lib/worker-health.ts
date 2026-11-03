import os from "node:os";
import type { Job, Worker } from "bullmq";
import { redisConnection } from "@/lib/redis";

export type WorkerHealthStatus = "ready" | "busy" | "failed";
export type WorkerHealthRecord = {
  workerName: string;
  queueName: string;
  status: WorkerHealthStatus;
  host: string;
  pid: number;
  startedAt: string;
  lastHeartbeatAt: string;
  currentJobId?: string;
  currentJobType?: string;
  currentJobStartedAt?: string;
  lastSuccessfulJobAt?: string;
  lastFailedJobAt?: string;
  lastError?: string;
  model?: string;
  concurrency?: number;
};

const PREFIX = "news-broadcast:worker-health:";
const TTL_MS = 90_000;

function key(name: string) { return `${PREFIX}${name}`; }

export function attachWorkerHealth<T extends Worker>(worker: T, meta: { workerName: string; queueName: string; model?: string }) {
  const startedAt = new Date().toISOString();
  let current: WorkerHealthRecord = {
    workerName: meta.workerName, queueName: meta.queueName, status: "ready", host: os.hostname(), pid: process.pid,
    startedAt, lastHeartbeatAt: startedAt, model: meta.model, concurrency: worker.opts.concurrency,
  };
  let timer: NodeJS.Timeout | undefined;
  const write = async () => {
    current = { ...current, lastHeartbeatAt: new Date().toISOString() };
    await redisConnection.set(key(meta.workerName), JSON.stringify(current), "PX", TTL_MS).catch(() => undefined);
  };
  const active = (job: Job) => { current = { ...current, status: "busy", currentJobId: job.id, currentJobType: job.name, currentJobStartedAt: new Date().toISOString() }; void write(); };
  const completed = () => { current = { ...current, status: "ready", lastSuccessfulJobAt: new Date().toISOString(), currentJobId: undefined, currentJobType: undefined, currentJobStartedAt: undefined }; void write(); };
  const failed = (_job: Job | undefined, err: Error) => { current = { ...current, status: "failed", lastFailedJobAt: new Date().toISOString(), lastError: err.message, currentJobId: undefined, currentJobType: undefined, currentJobStartedAt: undefined }; void write(); };
  worker.on("ready", () => { void write(); timer = setInterval(() => void write(), 30_000); });
  worker.on("active", active);
  worker.on("completed", completed);
  worker.on("failed", failed);
  worker.on("error", (err) => failed(undefined, err));
  const cleanup = () => { if (timer) clearInterval(timer); void redisConnection.del(key(meta.workerName)); };
  process.once("SIGTERM", cleanup);
  process.once("SIGINT", cleanup);
  return worker;
}

export async function readWorkerHealth() {
  const keys = await redisConnection.keys(`${PREFIX}*`);
  const records = await Promise.all(keys.map(async (item) => {
    const raw = await redisConnection.get(item);
    try { return raw ? JSON.parse(raw) as WorkerHealthRecord : null; } catch { return null; }
  }));
  return records.filter(Boolean) as WorkerHealthRecord[];
}
