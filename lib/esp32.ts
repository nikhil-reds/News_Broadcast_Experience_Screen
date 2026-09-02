import { ReadlineParser, SerialPort } from "serialport";

export interface Esp32Event {
  raw: string;
  command: string;
  value: string;
  at: string;
  screenActive?: boolean;
}

export interface Esp32Status {
  connected: boolean;
  path: string;
  baudRate: number;
  lastError: string | null;
  lastEventAt: string | null;
  lastEventRaw: string | null;
  subscribers: number;
  screenActive: boolean;
}

type Listener = (event: Esp32Event) => void;

interface Hub {
  port: SerialPort | null;
  opening: boolean;
  screenActive: boolean;
  listeners: Set<Listener>;
  status: Esp32Status;
  reconnectTimer: NodeJS.Timeout | null;
}

const PORT_PATH = process.env.ESP32_PORT ?? "COM3";
const BAUD_RATE = Number(process.env.ESP32_BAUD ?? 115200);
const RECONNECT_DELAY_MS = 3000;
const STRUCTURED_FRAME = /^(BUTTON|CLICK|ROTARY)\[(.+)\]$/i;
const SIMPLE_BUTTON_LINES = new Set(["1", "BUTTON", "PRESS", "PRESSED", "CLICK", "START", "ON"]);

const globalForEsp32 = globalThis as unknown as {
  __esp32Hub?: Hub;
};

function getHub(): Hub {
  if (!globalForEsp32.__esp32Hub) {
    globalForEsp32.__esp32Hub = {
      port: null,
      opening: false,
      screenActive: false,
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
        screenActive: false,
      },
    };
  }
  return globalForEsp32.__esp32Hub;
}

function screenActiveForEvent(event: Esp32Event): boolean | null {
  const raw = event.raw.trim().toUpperCase();
  const value = event.value.trim().toUpperCase();
  if (raw === "11") return true;
  if (raw === "22") return false;
  if (event.command === "BUTTON" && ["1", "11", "PRESSED"].includes(value)) return true;
  if (event.command === "BUTTON" && ["0", "22", "RELEASED"].includes(value)) return false;
  if (event.command === "BUTTON_RELEASE") return false;
  if (event.command === "CLICK" && value === "1") return true;
  return null;
}

function scheduleReconnect(hub: Hub) {
  if (hub.reconnectTimer) return;
  hub.reconnectTimer = setTimeout(() => {
    hub.reconnectTimer = null;
    openPort(hub);
  }, RECONNECT_DELAY_MS);
  hub.reconnectTimer.unref?.();
}

function normalizeLine(line: string) {
  return line.replace(/^BLE SEND:\s*/i, "").trim();
}

function parseLine(line: string): Esp32Event | null {
  const raw = normalizeLine(line);
  if (!raw) return null;

  const match = STRUCTURED_FRAME.exec(raw);
  if (match) {
    return {
      raw,
      command: match[1].toUpperCase(),
      value: match[2].trim(),
      at: new Date().toISOString(),
    };
  }

  if (raw === "11") {
    return {
      raw,
      command: "BUTTON",
      value: "11",
      at: new Date().toISOString(),
    };
  }

  if (raw === "22") {
    return {
      raw,
      command: "BUTTON_RELEASE",
      value: "22",
      at: new Date().toISOString(),
    };
  }

  if (SIMPLE_BUTTON_LINES.has(raw.toUpperCase())) {
    return {
      raw,
      command: "BUTTON",
      value: raw,
      at: new Date().toISOString(),
    };
  }

  return {
    raw,
    command: "DATA",
    value: raw,
    at: new Date().toISOString(),
  };
}

function dispatchLine(hub: Hub, line: string): Esp32Event | null {
  const event = parseLine(line);
  if (!event) return null;

  const nextScreenActive = screenActiveForEvent(event);
  if (nextScreenActive !== null) {
    hub.screenActive = nextScreenActive;
    hub.status.screenActive = hub.screenActive;
    event.screenActive = hub.screenActive;
  }

  hub.status.lastEventAt = event.at;
  hub.status.lastEventRaw = event.raw;

  for (const listener of hub.listeners) {
    try {
      listener(event);
    } catch (listenerErr) {
      console.error("[esp32] listener threw:", listenerErr);
    }
  }

  return event;
}

function openPort(hub: Hub) {
  if (hub.opening || hub.port?.isOpen) return;
  hub.opening = true;

  const port = new SerialPort({
    path: PORT_PATH,
    baudRate: BAUD_RATE,
    autoOpen: false,
  });
  hub.port = port;

  port.open((err) => {
    hub.opening = false;
    if (err) {
      hub.status.connected = false;
      hub.status.lastError = err.message;
      hub.port = null;
      console.error(`[esp32] cannot open ${PORT_PATH}: ${err.message}`);
      scheduleReconnect(hub);
      return;
    }
    hub.status.connected = true;
    hub.status.lastError = null;
    console.log(`[esp32] listening on ${PORT_PATH} @ ${BAUD_RATE}`);
  });

  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
  parser.on("data", (line: string) => dispatchLine(hub, line));

  port.on("error", (err) => {
    hub.opening = false;
    hub.status.connected = false;
    hub.status.lastError = err.message;
    console.error(`[esp32] port error: ${err.message}`);
  });

  port.on("close", () => {
    hub.opening = false;
    hub.status.connected = false;
    hub.port = null;
    console.warn("[esp32] port closed, will retry");
    scheduleReconnect(hub);
  });
}

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

export function emitLine(raw: string): Esp32Event | null {
  return dispatchLine(getHub(), raw);
}

export function getStatus(): Esp32Status {
  const hub = getHub();
  return { ...hub.status, connected: hub.port?.isOpen ?? false, screenActive: hub.screenActive };
}
