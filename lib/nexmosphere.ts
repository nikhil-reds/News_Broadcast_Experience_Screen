import { ReadlineParser, SerialPort } from "serialport";

/**
 * Nexmosphere X-talk controller listener.
 *
 * The controller sits on a USB-serial cable (Prolific PL2303) and pushes one
 * ASCII frame per line whenever a sensor or button fires, e.g. `X001A[17]`:
 *
 *   X    001   A     [17]
 *   ^    ^     ^     ^
 *   type addr  cmd   value
 *
 * Only one process can hold the COM port open, so the connection is a lazy
 * singleton cached on globalThis — Next.js dev hot-reload re-evaluates modules
 * and would otherwise leave orphaned handles on the port.
 */

export interface NexmosphereEvent {
  /** Full frame as received, e.g. "X001A[17]". Match on this. */
  raw: string;
  /** Interface address, e.g. "001". */
  address: string;
  /** Command letter, e.g. "A". */
  command: string;
  /** Bracketed payload, e.g. "17". */
  value: string;
  at: string;
}

export interface NexmosphereStatus {
  connected: boolean;
  path: string;
  baudRate: number;
  lastError: string | null;
  lastEventAt: string | null;
  lastEventRaw: string | null;
  subscribers: number;
}

type Listener = (event: NexmosphereEvent) => void;

interface Hub {
  port: SerialPort | null;
  listeners: Set<Listener>;
  status: NexmosphereStatus;
  reconnectTimer: NodeJS.Timeout | null;
}

const PORT_PATH = process.env.NEXMOSPHERE_PORT ?? "COM3";
const BAUD_RATE = Number(process.env.NEXMOSPHERE_BAUD ?? 115200);
const RECONNECT_DELAY_MS = 3000;

/** X001A[17] — also matches D-type frames the controller emits. */
const FRAME = /^([A-Z])(\d{3})([A-Z])\[(.*)\]$/;

const globalForNexmosphere = globalThis as unknown as {
  __nexmosphereHub?: Hub;
};

function getHub(): Hub {
  if (!globalForNexmosphere.__nexmosphereHub) {
    globalForNexmosphere.__nexmosphereHub = {
      port: null,
      listeners: new Set(),
      reconnectTimer: null,
      status: {
        connected: false,
        path: PORT_PATH,
        baudRate: BAUD_RATE,
        lastError: null,
        lastEventAt: null,
        lastEventRaw: null,
        subscribers: 0,
      },
    };
  }
  return globalForNexmosphere.__nexmosphereHub;
}

function scheduleReconnect(hub: Hub) {
  if (hub.reconnectTimer) return;
  hub.reconnectTimer = setTimeout(() => {
    hub.reconnectTimer = null;
    openPort(hub);
  }, RECONNECT_DELAY_MS);
  // Don't hold the event loop open just to retry a cable that may never return.
  hub.reconnectTimer.unref?.();
}

function openPort(hub: Hub) {
  if (hub.port?.isOpen) return;

  const port = new SerialPort({
    path: PORT_PATH,
    baudRate: BAUD_RATE,
    autoOpen: false,
  });
  hub.port = port;

  port.open((err) => {
    if (err) {
      hub.status.connected = false;
      hub.status.lastError = err.message;
      console.error(`[nexmosphere] cannot open ${PORT_PATH}: ${err.message}`);
      scheduleReconnect(hub);
      return;
    }
    hub.status.connected = true;
    hub.status.lastError = null;
    console.log(`[nexmosphere] listening on ${PORT_PATH} @ ${BAUD_RATE}`);
  });

  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

  parser.on("data", (line: string) => {
    const raw = line.trim();
    if (!raw) return;

    const match = FRAME.exec(raw);
    if (!match) {
      // Boot banners and status text share the line; not an error.
      console.log(`[nexmosphere] ignored non-frame line: ${JSON.stringify(raw)}`);
      return;
    }

    const event: NexmosphereEvent = {
      raw,
      address: match[2],
      command: match[3],
      value: match[4],
      at: new Date().toISOString(),
    };

    hub.status.lastEventAt = event.at;
    hub.status.lastEventRaw = raw;

    for (const listener of hub.listeners) {
      try {
        listener(event);
      } catch (listenerErr) {
        console.error("[nexmosphere] listener threw:", listenerErr);
      }
    }
  });

  port.on("error", (err) => {
    hub.status.connected = false;
    hub.status.lastError = err.message;
    console.error(`[nexmosphere] port error: ${err.message}`);
  });

  port.on("close", () => {
    hub.status.connected = false;
    console.warn("[nexmosphere] port closed — will retry");
    scheduleReconnect(hub);
  });
}

/**
 * Subscribe to controller frames, opening the port on first use.
 * Returns an unsubscribe function. The port is deliberately left open after the
 * last subscriber leaves so a page reload doesn't drop hardware events.
 */
export function subscribe(listener: Listener): () => void {
  const hub = getHub();
  openPort(hub);

  hub.listeners.add(listener);
  hub.status.subscribers = hub.listeners.size;

  return () => {
    hub.listeners.delete(listener);
    hub.status.subscribers = hub.listeners.size;
  };
}

export function getStatus(): NexmosphereStatus {
  const hub = getHub();
  return { ...hub.status, connected: hub.port?.isOpen ?? false };
}
