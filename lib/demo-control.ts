import "server-only";

import { randomUUID } from "node:crypto";
import { currentBroadcastSession } from "@/lib/current-broadcast-session";
import { redisConnection } from "@/lib/redis";
import type { ScreenWorkflow } from "@/lib/screen-workflow";

const DEMO_STATE_KEY = "broadcast:demo-state";
const DEMO_LOCK_KEY = "broadcast:demo-state:lock";
const DEMO_DURATION_MS = 15 * 60_000;

export interface DemoState {
  active: boolean;
  sessionId: string | null;
  startedAt: string | null;
  endsAt: string | null;
  stoppedReason: string | null;
  revision: number;
}

interface StoredDemoState extends DemoState {
  resumeWorkflow: ScreenWorkflow | null;
}

const workflowKey = (sessionId: string) => `broadcast:session:${sessionId}:screen-workflow`;

function inactiveState(revision = 0, stoppedReason: string | null = null): StoredDemoState {
  return {
    active: false,
    sessionId: null,
    startedAt: null,
    endsAt: null,
    stoppedReason,
    revision,
    resumeWorkflow: null,
  };
}

function publicState(state: StoredDemoState): DemoState {
  return {
    active: state.active,
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    stoppedReason: state.stoppedReason,
    revision: state.revision,
  };
}

async function readStoredState(): Promise<StoredDemoState> {
  const raw = await redisConnection.get(DEMO_STATE_KEY);
  if (!raw) return inactiveState();
  try {
    return JSON.parse(raw) as StoredDemoState;
  } catch {
    return inactiveState();
  }
}

async function withDemoLock<T>(work: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  const locked = await redisConnection.set(DEMO_LOCK_KEY, token, "PX", 10_000, "NX") === "OK";
  if (!locked) throw new Error("Another demo action is already in progress");
  try {
    return await work();
  } finally {
    await redisConnection.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
      1,
      DEMO_LOCK_KEY,
      token
    ).catch(() => {});
  }
}

export async function getDemoState(): Promise<DemoState> {
  const state = await readStoredState();
  if (state.active && state.endsAt && Date.parse(state.endsAt) <= Date.now()) {
    return stopDemo("timeout");
  }
  return publicState(state);
}

export async function startDemo(): Promise<DemoState> {
  return withDemoLock(async () => {
    const existing = await readStoredState();
    if (existing.active && existing.endsAt && Date.parse(existing.endsAt) > Date.now()) {
      return publicState(existing);
    }

    const session = await currentBroadcastSession();
    if (!session) throw new Error("No current recording session is available");

    const rawWorkflow = await redisConnection.get(workflowKey(session.id));
    const resumeWorkflow: ScreenWorkflow = rawWorkflow
      ? JSON.parse(rawWorkflow) as ScreenWorkflow
      : { sessionId: session.id, revision: 0, applied: [], publishedAt: null };
    const demoWorkflow: ScreenWorkflow = {
      sessionId: session.id,
      revision: resumeWorkflow.revision + 1,
      applied: [],
      // Force every open screen to mount a fresh playback tree. Screen 01
      // starts the current camera footage at 0; all later screens show the
      // logo until they become active through the normal Apply sequence.
      restartAt: Date.now(),
      publishedAt: null,
    };
    const startedAt = new Date();
    const state: StoredDemoState = {
      active: true,
      sessionId: session.id,
      startedAt: startedAt.toISOString(),
      endsAt: new Date(startedAt.getTime() + DEMO_DURATION_MS).toISOString(),
      stoppedReason: null,
      revision: existing.revision + 1,
      resumeWorkflow,
    };
    await redisConnection.multi()
      .set(workflowKey(session.id), JSON.stringify(demoWorkflow))
      .set(DEMO_STATE_KEY, JSON.stringify(state))
      .exec();
    return publicState(state);
  });
}

export async function stopDemo(
  reason: "manual" | "timeout" | "new-recording",
  restoreWorkflow = true
): Promise<DemoState> {
  return withDemoLock(async () => {
    const current = await readStoredState();
    if (!current.active) return publicState(current);

    const state = inactiveState(current.revision + 1, reason);
    const transaction = redisConnection.multi().set(DEMO_STATE_KEY, JSON.stringify(state));
    if (restoreWorkflow && current.sessionId && current.resumeWorkflow) {
      const rawWorkflow = await redisConnection.get(workflowKey(current.sessionId));
      const activeWorkflow = rawWorkflow
        ? JSON.parse(rawWorkflow) as ScreenWorkflow
        : current.resumeWorkflow;
      const restored: ScreenWorkflow = {
        ...current.resumeWorkflow,
        revision: Math.max(activeWorkflow.revision, current.resumeWorkflow.revision) + 1,
      };
      transaction.set(workflowKey(current.sessionId), JSON.stringify(restored));
    }
    await transaction.exec();
    return publicState(state);
  });
}
