import { redisConnection } from "@/lib/redis";

export const AUDIO_LANGUAGE_CODES = ["en", "de", "hi", "fr", "es"] as const;
export type AudioLanguageCode = (typeof AUDIO_LANGUAGE_CODES)[number];

export interface AudioLanguageState {
  sessionId: string;
  audioLanguage: AudioLanguageCode;
  updatedAt: string;
  version: number;
}

export const AUDIO_LANGUAGE_CHANNEL = "broadcast:audio-language:changed";

export function audioLanguageStateKey(sessionId: string) {
  return `broadcast:session:${sessionId}:audio-language`;
}

export function isAudioLanguageCode(value: unknown): value is AudioLanguageCode {
  return typeof value === "string" && (AUDIO_LANGUAGE_CODES as readonly string[]).includes(value);
}

/**
 * Replaces the only audio-language state for a session, then emits that exact
 * value. The Lua script prevents concurrent screen clients from reusing a
 * version number. Redis retains one JSON value per session, never a history.
 */
export async function saveAudioLanguageState(
  sessionId: string,
  audioLanguage: AudioLanguageCode
): Promise<AudioLanguageState> {
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
        audioLanguage = ARGV[2],
        updatedAt = ARGV[3],
        version = version + 1
      }
      local encoded = cjson.encode(state)
      redis.call("SET", KEYS[1], encoded)
      redis.call("PUBLISH", KEYS[2], encoded)
      return encoded
    `,
    2,
    audioLanguageStateKey(sessionId),
    AUDIO_LANGUAGE_CHANNEL,
    sessionId,
    audioLanguage,
    updatedAt
  );

  return JSON.parse(String(raw)) as AudioLanguageState;
}

export async function getAudioLanguageState(sessionId: string): Promise<AudioLanguageState | null> {
  const raw = await redisConnection.get(audioLanguageStateKey(sessionId));
  if (!raw) return null;

  try {
    const state = JSON.parse(raw) as AudioLanguageState;
    return state.sessionId === sessionId && isAudioLanguageCode(state.audioLanguage) ? state : null;
  } catch {
    return null;
  }
}
