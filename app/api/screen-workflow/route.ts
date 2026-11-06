import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/redis";
import { CAMERA_FILENAME_PREFIX, type CameraId } from "@/lib/camera-recordings";
import { SCREEN_REQUIREMENTS } from "@/lib/generation";
import { composedFilename, DEFAULT_BACKGROUND_ID } from "@/lib/green-screen";
import { objectExists, VIDEO_BUCKET } from "@/lib/minio";
import { activeScreens, workflowRun, type ScreenWorkflow } from "@/lib/screen-workflow";
import { currentBroadcastSession, setCurrentBroadcastSession } from "@/lib/current-broadcast-session";
import { getDemoState } from "@/lib/demo-control";

const key = (id: string) => `broadcast:session:${id}:screen-workflow`;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function stateFor(sessionId: string): Promise<ScreenWorkflow> {
  const initial: ScreenWorkflow = { sessionId, revision: 0, applied: [], publishedAt: null };
  await redisConnection.set(key(sessionId), JSON.stringify(initial), "NX");
  return JSON.parse((await redisConnection.get(key(sessionId)))!);
}
async function isReady(session: NonNullable<Awaited<ReturnType<typeof currentBroadcastSession>>>, screen: number) {
  if (screen <= 3) return Boolean(await prisma.videoRecording.findFirst({ where: {
    sessionId: session.id, filename: { startsWith: CAMERA_FILENAME_PREFIX[screen as CameraId] },
  }, select: { id: true } }));
  const required = SCREEN_REQUIREMENTS[screen] ?? SCREEN_REQUIREMENTS[6];
  const tasks = await prisma.generationTask.findMany({ where: { generationId: session.id, taskType: { in: required }, status: "completed" }, select: { taskType: true } });
  if (!required.every(type => tasks.some(task => task.taskType === type))) return false;
  if ([7, 11, 12].includes(screen)) {
    const reel = await prisma.videoRecording.findFirst({ where: { sessionId: session.id, filename: { startsWith: "highlight-" } }, orderBy: { createdAt: "desc" } });
    if (!reel) return false;
    return objectExists(VIDEO_BUCKET, composedFilename(session.selectedBackgroundId ?? DEFAULT_BACKGROUND_ID, reel.filename));
  }
  return true;
}
export async function GET(request: NextRequest) {
  const screen = Number(request.nextUrl.searchParams.get("screen"));
  if (!Number.isInteger(screen) || screen < 1 || screen > 12) return json({ error: "Invalid screen" }, 400);
  try {
    // Enforce the saved-demo deadline before returning the preserved live flow.
    await getDemoState();
    const session = await currentBroadcastSession();
    if (request.nextUrl.searchParams.get("output") === "1") {
      const state = session && await stateFor(session.id);
      return json({ serverNow: Date.now(), sessionId: session?.id,
        startedAt: state?.publishedAt ? Date.parse(state.publishedAt) : null });
    }
    if (!session) return json({ state: null, active: [], ready: false });
    const state = await stateFor(session.id);
    const active = activeScreens(state.applied);
    const readyDisplays = request.nextUrl.searchParams.has("handoff")
      ? (await redisConnection.smembers(displayKey(state))).map(Number) : undefined;
    return json({ state, active, readyDisplays, ready: active.includes(screen) && await isReady(session, screen === 7 ? 6 : screen) });
  } catch { return json({ error: "Unable to load screen progress" }, 503); }
}
function displayKey(state: ScreenWorkflow) {
  return key(state.sessionId) + ":ready:" + workflowRun(state);
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !Number.isInteger(body.screen) || body.screen < 2 || body.screen > 11) return json({ error: "Invalid display" }, 400);
  try {
    const session = await currentBroadcastSession();
    if (!session || session.id !== body.sessionId) return json({ error: "Session changed" }, 409);
    const state = await stateFor(session.id);
    if (workflowRun(state) !== body.run || !activeScreens(state.applied).includes(body.screen)) {
      return json({ error: "Display is no longer active" }, 409);
    }
    await redisConnection.multi().sadd(displayKey(state), body.screen).expire(displayKey(state), 86400).exec();
    return json({ ready: true });
  } catch { return json({ error: "Unable to acknowledge readiness" }, 503); }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !Number.isInteger(body.screen) || body.screen < 1 || body.screen > 12 || typeof body.sessionId !== "string") return json({ error: "Invalid screen action" }, 400);
  const lockKey = `broadcast:workflow:lock:${body.sessionId}`;
  const token = randomUUID();
  let locked = false;
  try {
    locked = await redisConnection.set(lockKey, token, "PX", 15000, "NX") === "OK";
    if (!locked) return json({ error: "Another screen is being applied. Please retry." }, 409);
    const session = await currentBroadcastSession();
    if (!session || session.id !== body.sessionId) return json({ error: "A new recording session has started. Refresh and try again." }, 409);
    const state = await stateFor(session.id);
    if (state.applied.includes(body.screen)) return json({ state, active: activeScreens(state.applied), ready: false });
    if (!activeScreens(state.applied).includes(body.screen)) return json({ error: "This screen is not active yet" }, 409);
    if (!await isReady(session, body.screen)) return json({ error: "This screen's content is still preparing" }, 409);
    state.applied.push(body.screen);
    state.applied.sort((a, b) => a - b);
    state.revision++;
    if (body.screen === 11) state.broadcastAt = Date.now();
    if (body.screen === 12) state.publishedAt = new Date().toISOString();
    // Compare the lock token at commit time: an expired request must never overwrite a newer transition.
    const saved = await redisConnection.eval(`
      if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
      redis.call('SET', KEYS[2], ARGV[2]); return 1
    `, 2, lockKey, key(session.id), token, JSON.stringify(state));
    if (saved !== 1) return json({ error: "The action timed out. Please retry." }, 409);
    return json({ state, active: activeScreens(state.applied), ready: false });
  } catch { return json({ error: "Unable to save progress. Please retry." }, 503); }
  finally {
    if (locked) await redisConnection.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", 1, lockKey, token).catch(() => {});
  }
}

export async function DELETE() {
  const session = await prisma.broadcastSession.findFirst({
    where: {
      videoRecordings: {
        some: { filename: { startsWith: CAMERA_FILENAME_PREFIX[1] } },
      },
    },
    orderBy: { startedAt: "desc" },
  }).catch(() => null);
  if (!session) return json({ error: "No simulation is available to restart" }, 404);

  const lockKey = `broadcast:workflow:lock:${session.id}`;
  const token = randomUUID();
  let locked = false;
  try {
    locked = await redisConnection.set(lockKey, token, "PX", 15000, "NX") === "OK";
    if (!locked) return json({ error: "Another screen action is in progress. Please retry." }, 409);

    const current = await stateFor(session.id);
    const state: ScreenWorkflow = {
      sessionId: session.id,
      revision: current.revision + 1,
      applied: [],
      restartAt: Date.now(),
      publishedAt: null,
    };
    const saved = await redisConnection.eval(`
      if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
      redis.call('SET', KEYS[2], ARGV[2]); return 1
    `, 2, lockKey, key(session.id), token, JSON.stringify(state));
    if (saved !== 1) return json({ error: "The restart timed out. Please retry." }, 409);
    await setCurrentBroadcastSession(session.id);

    return json({
      state,
      active: activeScreens(state.applied),
      ready: await isReady(session, 1),
    });
  } catch {
    return json({ error: "Unable to restart the simulation" }, 503);
  } finally {
    if (locked) await redisConnection.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", 1, lockKey, token).catch(() => {});
  }
}
