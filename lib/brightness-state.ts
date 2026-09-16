import { redisConnection } from "@/lib/redis";

export interface BrightnessState {
  sessionId: string;
  brightness: number;
  updatedAt: string;
  version: number;
}

export const BRIGHTNESS_CHANNEL = "broadcast:brightness:changed";

export function brightnessStateKey(sessionId: string) {
  return `broadcast:session:${sessionId}:brightness`;
}

export function isBrightness(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100;
}

/** Replaces the one saved brightness value for a session and publishes it. */
export async function saveBrightnessState(sessionId: string, brightness: number): Promise<BrightnessState> {
  const updatedAt = new Date().toISOString();
  const raw = await redisConnection.eval(
    `
      local previous = redis.call("GET", KEYS[1])
      local version = 0
      if previous then
        local ok, parsed = pcall(cjson.decode, previous)
        if ok and type(parsed.version) == "number" then version = parsed.version end
      end
      local state = {
        sessionId = ARGV[1],
        brightness = tonumber(ARGV[2]),
        updatedAt = ARGV[3],
        version = version + 1
      }
      local encoded = cjson.encode(state)
      redis.call("SET", KEYS[1], encoded)
      redis.call("PUBLISH", KEYS[2], encoded)
      return encoded
    `,
    2,
    brightnessStateKey(sessionId),
    BRIGHTNESS_CHANNEL,
    sessionId,
    String(brightness),
    updatedAt
  );

  return JSON.parse(String(raw)) as BrightnessState;
}

export async function getBrightnessState(sessionId: string): Promise<BrightnessState | null> {
  const raw = await redisConnection.get(brightnessStateKey(sessionId));
  if (!raw) return null;

  try {
    const state = JSON.parse(raw) as BrightnessState;
    return state.sessionId === sessionId && isBrightness(state.brightness) ? state : null;
  } catch {
    return null;
  }
}
