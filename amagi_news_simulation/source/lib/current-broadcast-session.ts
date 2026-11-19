import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/redis";

const ACTIVE_SESSION_KEY = "broadcast:active-session-id";

export async function currentBroadcastSession() {
  const activeId = await redisConnection.get(ACTIVE_SESSION_KEY);
  if (activeId) {
    const active = await prisma.broadcastSession.findUnique({ where: { id: activeId } });
    if (active && !active.retiredAt) return active;
  }

  const latest = await prisma.broadcastSession.findFirst({ where: { retiredAt: null, recordingSavedAt: { not: null } }, orderBy: { seq: "desc" } })
    ?? await prisma.broadcastSession.findFirst({ where: { retiredAt: null, retentionManaged: false }, orderBy: { seq: "desc" } });
  if (latest) await redisConnection.set(ACTIVE_SESSION_KEY, latest.id);
  return latest;
}

export async function setCurrentBroadcastSession(sessionId: string) {
  await redisConnection.set(ACTIVE_SESSION_KEY, sessionId);
}
