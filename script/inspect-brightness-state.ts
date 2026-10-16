import { getBrightnessState } from "../lib/brightness-state";
import { redisConnection } from "../lib/redis";

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: npm run realtime:brightness:state -- <sessionId>");
    process.exitCode = 1;
    return;
  }

  try {
    const state = await getBrightnessState(sessionId);
    console.log(state ? JSON.stringify(state, null, 2) : `No saved brightness state for session ${sessionId}.`);
  } finally {
    await redisConnection.quit();
  }
}

void main();
