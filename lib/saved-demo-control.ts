import "server-only";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { redisConnection } from "@/lib/redis";
import type { ScreenWorkflow } from "@/lib/screen-workflow";
import type { SavedDemoPackage } from "@/lib/saved-demo-types";
import { AD_INDUSTRIES } from "@/lib/ad-catalog";

const STATE_KEY = "broadcast:saved-demo:state";
const LOCK_KEY = "broadcast:saved-demo:lock";
export const DEMO_DURATION_MS = 15 * 60_000;
export interface DemoState {
  active: boolean; sessionId: string | null; startedAt: string | null; endsAt: string | null;
  stoppedReason: string | null; revision: number;
}
export interface DemoPlayback extends DemoState {
  session: SavedDemoPackage["session"] | null;
  workflow: ScreenWorkflow | null;
  readyDisplays: number[];
  resumeSessionId: string | null;
}
const inactive = (revision = 0, stoppedReason: string | null = null): DemoPlayback => ({
  active: false, sessionId: null, startedAt: null, endsAt: null, stoppedReason, revision,
  session: null, workflow: null, readyDisplays: [], resumeSessionId: null,
});
function publicState(state: DemoPlayback): DemoState {
  const { active, sessionId, startedAt, endsAt, stoppedReason, revision } = state;
  return { active, sessionId, startedAt, endsAt, stoppedReason, revision };
}
let cachedPackage: { mtime: number; data: SavedDemoPackage } | undefined;
export async function savedDemoPackage(): Promise<SavedDemoPackage> {
  const path = join(process.cwd(), "public", "demo", "snapshot", "snapshot.json");
  const info = await stat(path).catch(() => null);
  if (!info) throw new Error("Save the current footage with npm run demo:save before starting Demo.");
  if (cachedPackage?.mtime === info.mtimeMs) return cachedPackage.data;
  const data = JSON.parse(await readFile(path, "utf8")) as SavedDemoPackage;
  if (data.version !== 2 || !data.recordings?.length || !data.audioFiles?.length) throw new Error("The saved demo package is incomplete.");
  cachedPackage = { mtime: info.mtimeMs, data };
  return data;
}
async function readState(): Promise<DemoPlayback> {
  const raw = await redisConnection.get(STATE_KEY);
  return raw ? JSON.parse(raw) as DemoPlayback : inactive();
}
async function withDemoLock<T>(work: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  if (await redisConnection.set(LOCK_KEY, token, "PX", 10000, "NX") !== "OK") throw new Error("Another demo action is in progress. Please retry.");
  try { return await work(); }
  finally { await redisConnection.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", 1, LOCK_KEY, token).catch(() => {}); }
}
export async function getDemoPlayback(): Promise<DemoPlayback> {
  const state = await readState();
  if (state.active && state.endsAt && Date.parse(state.endsAt) <= Date.now()) {
    await stopDemo("timeout");
    return readState();
  }
  return state;
}
export async function getDemoState(): Promise<DemoState> { return publicState(await getDemoPlayback()); }

export async function startDemo(): Promise<DemoState> {
  const snapshot = await savedDemoPackage();
  await Promise.all(Object.values(snapshot.assets).map(url => stat(join(process.cwd(), "public", decodeURIComponent(url))).then(info => {
    if (!info.size) throw new Error("A saved demo asset is empty. Save the demo package again.");
  })));
  return withDemoLock(async () => {
    const existing = await readState();
    if (existing.active && existing.endsAt && Date.parse(existing.endsAt) > Date.now()) return publicState(existing);
    const id = `demo-${randomUUID()}`;
    const now = Date.now();
    const state: DemoPlayback = {
      active: true, sessionId: id, startedAt: new Date(now).toISOString(), endsAt: new Date(now + DEMO_DURATION_MS).toISOString(),
      stoppedReason: null, revision: existing.revision + 1,
      resumeSessionId: await redisConnection.get("broadcast:active-session-id"),
      session: { ...snapshot.session, id },
      workflow: { sessionId: id, revision: 0, applied: [], restartAt: now, publishedAt: null }, readyDisplays: [],
    };
    const transaction = redisConnection.multi().set(STATE_KEY, JSON.stringify(state));
    const codes: Record<string, string> = { English: "en", German: "de", Hindi: "hi", French: "fr", Spanish: "es", Off: "off" };
    const defaults = {
      background: snapshot.session.selectedBackgroundId, "subtitle-language": codes[snapshot.session.selectedSubtitleLanguage],
      industry: AD_INDUSTRIES[0].id, brand: AD_INDUSTRIES[0].brands[0].id, ...snapshot.selections,
    };
    for (const [kind, value] of Object.entries(defaults)) transaction.set(`broadcast:session:${id}:${kind}`, JSON.stringify({ sessionId: id, value, version: 1, updatedAt: state.startedAt }), "EX", 86400);
    transaction.set(`broadcast:session:${id}:audio-language`, JSON.stringify({ sessionId: id, audioLanguage: codes[snapshot.session.selectedAudioLanguage], voiceId: snapshot.voiceId, version: 1, updatedAt: state.startedAt }), "EX", 86400);
    transaction.set(`broadcast:session:${id}:brightness`, JSON.stringify({ sessionId: id, brightness: snapshot.session.selectedBrightness, version: 1, updatedAt: state.startedAt }), "EX", 86400);
    await transaction.exec();
    return publicState(state);
  });
}

export async function updateDemoPlayback(sessionId: string, change: (state: DemoPlayback) => void): Promise<DemoPlayback> {
  return withDemoLock(async () => {
    const state = await readState();
    if (!state.active || state.sessionId !== sessionId || !state.endsAt || Date.parse(state.endsAt) <= Date.now()) throw new Error("This demo has ended. Refresh the screen.");
    change(state);
    await redisConnection.set(STATE_KEY, JSON.stringify(state));
    return state;
  });
}

export async function stopDemo(reason: "manual" | "timeout" | "new-recording"): Promise<DemoState> {
  return withDemoLock(async () => {
    const current = await readState();
    if (!current.active) return publicState(current);
    if (reason === "timeout" && current.endsAt && Date.parse(current.endsAt) > Date.now()) return publicState(current);
    const state = inactive(current.revision + 1, reason);
    await redisConnection.set(STATE_KEY, JSON.stringify(state));
    // No live workflow, session, publication or selection was changed by Demo.
    return publicState(state);
  });
}
