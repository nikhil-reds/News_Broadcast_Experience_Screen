import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

const groups = [
  ["media", "app/worker/video.ts"],
  ["audio", "app/worker/audio-transcription.ts"],
  ["analysis", "app/worker/highlight-analysis.ts"],
  ["translations", "app/worker/translations.ts"],
  ["tts", "app/worker/tts.ts"],
  ["watchdog", "app/worker/watchdog.ts"],
];

const children = groups.map(([name, entry]) => {
  const child = spawn(process.execPath, [tsx, path.join(root, entry)], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[${name}] ${data}`));
  child.on("exit", (code, signal) => {
    if (code && !signal) process.exitCode = code;
  });
  return child;
});

function shutdown(signal) {
  for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
