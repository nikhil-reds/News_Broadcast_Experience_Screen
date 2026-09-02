"use client";

type EventHandler = (event: MessageEvent) => void;

interface SharedEventSourceOptions {
  events: Record<string, EventHandler>;
  onError?: () => void;
}

interface BroadcastPayload {
  type: "event" | "error" | "heartbeat";
  event?: string;
  data?: string;
  ownerId?: string;
  at: number;
}

const OWNER_TTL_MS = 10000;
const HEARTBEAT_MS = 3000;
const OWNER_CHECK_MS = 1500;

function idForPath(path: string) {
  return path.replace(/[^\w.-]/g, "_");
}

function makeOwnerId(path: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${idForPath(path)}-${Date.now()}-${random}`;
}

function readOwner(key: string): { id: string; at: number } | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (parsed && typeof parsed.id === "string" && typeof parsed.at === "number") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function writeOwner(key: string, id: string) {
  window.localStorage.setItem(key, JSON.stringify({ id, at: Date.now() }));
}

function eventLike(data: string): MessageEvent {
  return new MessageEvent("message", { data });
}

/**
 * Share one SSE connection across every open tab for the same browser origin.
 * One tab becomes the leader and owns EventSource; the rest receive the same
 * named events through BroadcastChannel. This avoids Chrome's per-origin
 * connection cap blocking normal screen media/API requests when many screens
 * are open as separate tabs.
 */
export function subscribeSharedEventSource(
  path: string,
  options: SharedEventSourceOptions
): () => void {
  if (typeof window === "undefined") return () => {};
  if (!("BroadcastChannel" in window) || !("localStorage" in window)) {
    const source = new EventSource(path);
    for (const [event, handler] of Object.entries(options.events)) {
      source.addEventListener(event, (e) => handler(e as MessageEvent));
    }
    source.onerror = () => options.onError?.();
    return () => source.close();
  }

  const channelName = `shared-event-source:${path}`;
  const ownerKey = `shared-event-source-owner:${path}`;
  const ownerId = makeOwnerId(path);
  const channel = new BroadcastChannel(channelName);
  let source: EventSource | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let ownerCheckTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const broadcast = (payload: BroadcastPayload) => channel.postMessage(payload);

  const stopOwning = () => {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    source?.close();
    source = null;
    const owner = readOwner(ownerKey);
    if (owner?.id === ownerId) window.localStorage.removeItem(ownerKey);
  };

  const startOwning = () => {
    if (closed || source) return;
    const owner = readOwner(ownerKey);
    if (owner && owner.id !== ownerId && Date.now() - owner.at < OWNER_TTL_MS) return;

    writeOwner(ownerKey, ownerId);
    source = new EventSource(path);

    for (const eventName of Object.keys(options.events)) {
      source.addEventListener(eventName, (event) => {
        const data = (event as MessageEvent).data;
        broadcast({ type: "event", event: eventName, data, ownerId, at: Date.now() });
      });
    }

    source.onerror = () => {
      broadcast({ type: "error", ownerId, at: Date.now() });
    };

    heartbeatTimer = setInterval(() => {
      const ownerNow = readOwner(ownerKey);
      if (ownerNow && ownerNow.id !== ownerId && Date.now() - ownerNow.at < OWNER_TTL_MS) {
        stopOwning();
        return;
      }
      writeOwner(ownerKey, ownerId);
      broadcast({ type: "heartbeat", ownerId, at: Date.now() });
    }, HEARTBEAT_MS);
  };

  channel.addEventListener("message", (event) => {
    const payload = event.data as BroadcastPayload;
    if (!payload || payload.ownerId === ownerId) return;
    if (payload.type === "event" && payload.event && payload.data != null) {
      options.events[payload.event]?.(eventLike(payload.data));
    } else if (payload.type === "error") {
      options.onError?.();
    }
  });

  ownerCheckTimer = setInterval(() => {
    const owner = readOwner(ownerKey);
    if (!owner || Date.now() - owner.at >= OWNER_TTL_MS) startOwning();
  }, OWNER_CHECK_MS);

  startOwning();

  return () => {
    closed = true;
    if (ownerCheckTimer) window.clearInterval(ownerCheckTimer);
    stopOwning();
    channel.close();
  };
}
