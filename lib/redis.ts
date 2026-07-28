import IORedis from "ioredis";

// Shared Redis connection for BullMQ. `maxRetriesPerRequest: null` is required
// by BullMQ workers/queues. Cached on globalThis for Next dev hot-reload.
const globalForRedis = globalThis as unknown as { __redis?: IORedis };

export const redisConnection =
  globalForRedis.__redis ??
  new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.__redis = redisConnection;
}
