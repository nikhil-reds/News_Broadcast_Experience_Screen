import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient } from "pg";
import { UnrecoverableError, type Job } from "bullmq";
import { prisma } from "@/lib/prisma";

// Separate connections hold session advisory locks, never long transactions.
// A shared lock covers the entire writer, including its final DB writes.
const globalFlow = globalThis as unknown as { flowPool?: Pool; flowContext?: AsyncLocalStorage<string> };
const pool = globalFlow.flowPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 16 });
const context = globalFlow.flowContext ??= new AsyncLocalStorage<string>();
export const flowLockKey = (id: string) => `recording-flow:${id}`;

export async function assertFlowWritable(id: string) {
  const flow = await prisma.broadcastSession.findUnique({ where: { id }, select: { retiredAt: true } });
  if (!flow || flow.retiredAt) throw new UnrecoverableError("This recording flow has been replaced");
}

export async function withFlowWork<T>(id: string | null | undefined, work: () => Promise<T>): Promise<T> {
  if (!id) throw new UnrecoverableError("A recording session is required");
  if (context.getStore() === id) {
    await assertFlowWritable(id);
    return work();
  }
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock_shared(hashtextextended($1, 0))", [flowLockKey(id)]);
    await assertFlowWritable(id);
    return await context.run(id, work);
  } finally {
    // Destroy the dedicated connection if unlock fails: never pool a held lock.
    try {
      await client.query("SELECT pg_advisory_unlock_shared(hashtextextended($1, 0))", [flowLockKey(id)]);
      client.release();
    } catch { client.release(true); }
  }
}

export function flowProcessor<D extends { generationId?: string | null }, R>(processor: (job: Job<D>) => Promise<R>) {
  return (job: Job<D>) => withFlowWork(job.data.generationId, () => processor(job));
}

// Journal BEFORE uploading: an interrupted upload or failed metadata write is
// still discoverable by cleanup. Existing objects cannot change owners.
export async function trackFlowAsset(bucket: string, objectKey: string) {
  const generationId = context.getStore();
  if (!generationId) throw new Error("Media upload must run inside a recording flow");
  await assertFlowWritable(generationId);
  const asset = await prisma.flowAsset.upsert({
    where: { bucket_objectKey: { bucket, objectKey } },
    create: { generationId, bucket, objectKey }, update: {},
  });
  if (asset.generationId !== generationId) throw new Error("Media object belongs to another recording flow");
}

export async function withFlowCleanup<T>(id: string, work: () => Promise<T>): Promise<T | null> {
  const client: PoolClient = await pool.connect();
  let locked = false;
  try {
    const result = await client.query("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [flowLockKey(id)]);
    locked = result.rows[0].locked;
    return locked ? await work() : null;
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [flowLockKey(id)]);
      client.release();
    } catch { client.release(true); }
  }
}
