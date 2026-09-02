export const BROADCAST_TRIGGER_STORAGE_KEY = "news-broadcast-trigger-active";
export const BROADCAST_TRIGGER_CHANNEL = "news-broadcast-trigger";

const SIMPLE_BUTTON_LINES = new Set(["1", "11", "BUTTON", "PRESS", "PRESSED", "CLICK", "START", "ON"]);

const normalize = (value: string) => value.trim().toUpperCase();

export function isEsp32ButtonLine(line: string) {
  return SIMPLE_BUTTON_LINES.has(normalize(line));
}

export function isBroadcastTriggerFrame(frame: { raw: string; command: string; value: string }) {
  if (SIMPLE_BUTTON_LINES.has(normalize(frame.raw))) return true;
  if (frame.command === "BUTTON") return SIMPLE_BUTTON_LINES.has(normalize(frame.value));
  if (frame.command === "CLICK") return normalize(frame.value) === "1";
  return false;
}
