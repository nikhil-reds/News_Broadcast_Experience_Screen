import { getAudioLanguageState } from "../lib/audio-language-state";
import { redisConnection } from "../lib/redis";

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: npm run realtime:audio-language:state -- <sessionId>");
    process.exitCode = 1;
    return;
  }

  try {
    const state = await getAudioLanguageState(sessionId);
    if (!state) {
      console.log(`No saved audio-language state for session ${sessionId}.`);
      return;
    }
    console.log(JSON.stringify(state, null, 2));
  } finally {
    await redisConnection.quit();
  }
}

void main();
