import { redisConnection } from "@/lib/redis";

export interface SelectionState<T extends string> { sessionId: string; value: T; updatedAt: string; version: number }

export function stateKey(kind: string, sessionId: string) { return `broadcast:session:${sessionId}:${kind}`; }
export function stateChannel(kind: string) { return `broadcast:${kind}:changed`; }

export async function saveSelectionState<T extends string>(kind: string, sessionId: string, value: T) {
  const updatedAt = new Date().toISOString();
  const raw = await redisConnection.eval(`
    local previous = redis.call("GET", KEYS[1]); local version = 0
    if previous then local ok, parsed = pcall(cjson.decode, previous); if ok and type(parsed.version) == "number" then version = parsed.version end end
    local state = {sessionId = ARGV[1], value = ARGV[2], updatedAt = ARGV[3], version = version + 1}
    local encoded = cjson.encode(state); redis.call("SET", KEYS[1], encoded); redis.call("PUBLISH", KEYS[2], encoded); return encoded
  `, 2, stateKey(kind, sessionId), stateChannel(kind), sessionId, value, updatedAt);
  return JSON.parse(String(raw)) as SelectionState<T>;
}

export async function getSelectionState<T extends string>(kind: string, sessionId: string, allowed: readonly T[]) {
  const raw = await redisConnection.get(stateKey(kind, sessionId));
  if (!raw) return null;
  try { const state = JSON.parse(raw) as SelectionState<T>; return state.sessionId === sessionId && allowed.includes(state.value) ? state : null; } catch { return null; }
}
