import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Prisma 7 requires a driver adapter at runtime. Cache the client (and pool) on
// globalThis so Next.js dev hot-reload doesn't open a new pool on every reload.
const globalForPrisma = globalThis as unknown as {
  __prismaPool?: Pool;
  __prisma?: PrismaClient;
};

const pool =
  globalForPrisma.__prismaPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalForPrisma.__prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prismaPool = pool;
  globalForPrisma.__prisma = prisma;
}
