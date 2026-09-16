import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import IORedis from "ioredis";
import {
  AUDIO_LANGUAGE_CHANNEL,
  getAudioLanguageState,
  isAudioLanguageCode,
  saveAudioLanguageState,
  type AudioLanguageState,
} from "../lib/audio-language-state";
import {
  BRIGHTNESS_CHANNEL,
  getBrightnessState,
  isBrightness,
  saveBrightnessState,
  type BrightnessState,
} from "../lib/brightness-state";
import { realtimeSelections } from "../lib/realtime-selections";
import { stateChannel, type SelectionState } from "../lib/selection-state";

type ClientMessage =
  | { type: "audio-language:get"; sessionId: string }
  | { type: "audio-language:set"; sessionId: string; audioLanguage: string }
  | { type: "brightness:get"; sessionId: string }
  | { type: "brightness:set"; sessionId: string; brightness: number }
  | { type: `${"background" | "subtitle-language" | "industry" | "brand"}:get`; sessionId: string }
  | { type: `${"background" | "subtitle-language" | "industry" | "brand"}:set`; sessionId: string; value: string };

type ClientSocket = WebSocket & { sessionId?: string };
const port = Number(process.env.AUDIO_LANGUAGE_WS_PORT || 3001);
const redisOptions = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
};
const subscriber = new IORedis(redisOptions);
const server = createServer();
const wss = new WebSocketServer({ server, path: "/ws" });
let startupFailed = false;

function validSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);
}

function send(socket: WebSocket, message: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(type: string, state: AudioLanguageState | BrightnessState | SelectionState<string>) {
  for (const client of wss.clients) {
    const socket = client as ClientSocket;
    if (socket.sessionId === state.sessionId) send(socket, { type, state });
  }
}

subscriber.on("message", (channel, payload) => {
  try {
    if (channel === AUDIO_LANGUAGE_CHANNEL) broadcast("audio-language:changed", JSON.parse(payload) as AudioLanguageState);
    if (channel === BRIGHTNESS_CHANNEL) broadcast("brightness:changed", JSON.parse(payload) as BrightnessState);
    for (const kind of Object.keys(realtimeSelections)) if (channel === stateChannel(kind)) broadcast(`${kind}:changed`, JSON.parse(payload) as SelectionState<string>);
  } catch {
    console.error("Ignored malformed realtime Redis message");
  }
});

subscriber.subscribe(AUDIO_LANGUAGE_CHANNEL, BRIGHTNESS_CHANNEL, ...Object.keys(realtimeSelections).map(stateChannel)).catch((error) => {
  console.error("Unable to subscribe to realtime updates:", error);
});

wss.on("connection", (socket: ClientSocket) => {
  socket.on("message", async (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send(socket, { type: "error", error: "Invalid JSON message" });
      return;
    }

    if (!validSessionId(message.sessionId)) {
      send(socket, { type: "error", error: "Invalid sessionId" });
      return;
    }

    socket.sessionId = message.sessionId;
    if (message.type === "audio-language:get") {
      send(socket, { type: "audio-language:state", state: await getAudioLanguageState(message.sessionId) });
      return;
    }

    if (message.type === "brightness:get") {
      send(socket, { type: "brightness:state", state: await getBrightnessState(message.sessionId) });
      return;
    }

    if (message.type === "brightness:set") {
      if (!isBrightness(message.brightness)) {
        send(socket, { type: "error", error: "Brightness must be an integer from 1 to 100" });
        return;
      }
      try {
        const state = await saveBrightnessState(message.sessionId, message.brightness);
        send(socket, { type: "brightness:saved", state });
      } catch (error) {
        console.error("Unable to save brightness state:", error);
        send(socket, { type: "error", error: "Unable to save brightness" });
      }
      return;
    }

    const selectionMatch = message.type.match(/^(background|subtitle-language|industry|brand):(get|set)$/);
    if (selectionMatch) {
      const [, kind, action] = selectionMatch as [string, keyof typeof realtimeSelections, "get" | "set"];
      const definition = realtimeSelections[kind];
      if (action === "get") { send(socket, { type: `${kind}:state`, state: await definition.get(message.sessionId) }); return; }
      if (!("value" in message) || !definition.allowed.includes(message.value as never)) { send(socket, { type: "error", error: `Invalid ${kind} value` }); return; }
      try { const state = await definition.save(message.sessionId, message.value as never); send(socket, { type: `${kind}:saved`, state }); }
      catch (error) { console.error(`Unable to save ${kind} state:`, error); send(socket, { type: "error", error: `Unable to save ${kind}` }); }
      return;
    }

    if (message.type !== "audio-language:set" || !isAudioLanguageCode(message.audioLanguage)) {
      send(socket, { type: "error", error: "Invalid audio language" });
      return;
    }

    try {
      const state = await saveAudioLanguageState(message.sessionId, message.audioLanguage);
      send(socket, { type: "audio-language:saved", state });
    } catch (error) {
      console.error("Unable to save audio-language state:", error);
      send(socket, { type: "error", error: "Unable to save audio language" });
    }
  });
});

function reportStartupError(error: NodeJS.ErrnoException) {
  if (startupFailed) return;
  startupFailed = true;
  if (error.code === "EADDRINUSE") {
    console.error(`Audio-language WebSocket gateway is already running on port ${port}.`);
  } else {
    console.error("Audio-language WebSocket gateway failed to start:", error);
  }
  void subscriber.quit().finally(() => process.exit(1));
}

server.on("error", reportStartupError);
wss.on("error", reportStartupError);

server.listen(port, () => console.log(`Realtime WebSocket gateway listening on :${port}/ws`));

async function shutdown() {
  await subscriber.quit();
  wss.close();
  server.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
