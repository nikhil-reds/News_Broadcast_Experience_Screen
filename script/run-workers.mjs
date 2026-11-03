import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const logDirectory = path.join(root, "logs");
const logFile = path.join(logDirectory, "worker-all.log");
const rotatedLogFile = path.join(logDirectory, "worker-all.previous.log");
const maxLogBytes = 25 * 1024 * 1024;

mkdirSync(logDirectory, { recursive: true });
if (existsSync(logFile) && statSync(logFile).size > maxLogBytes) {
  if (existsSync(rotatedLogFile)) renameSync(rotatedLogFile, `${rotatedLogFile}.${Date.now()}`);
  renameSync(logFile, rotatedLogFile);
}

const logStream = createWriteStream(logFile, { flags: "a", encoding: "utf8" });

function writeLog(level, source, message) {
  const cleanMessage = String(message).replace(/\r/g, "").trimEnd();
  if (!cleanMessage) return;
  logStream.write(`${new Date().toISOString()} ${level} [${source}] ${cleanMessage}\n`);
}

function relay(stream, source, level, target) {
  stream.setEncoding("utf8");
  let remainder = "";
  stream.on("data", (chunk) => {
    const lines = `${remainder}${chunk}`.split(/\r?\n/);
    remainder = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      target.write(`[${source}] ${line}\n`);
      writeLog(level, source, line);
    }
  });
  stream.on("end", () => {
    if (!remainder) return;
    target.write(`[${source}] ${remainder}\n`);
    writeLog(level, source, remainder);
  });
}

const groups = [
  ["realtime", "services/audio-language-websocket.ts"],
  ["media", "app/worker/video.ts"],
  ["audio", "app/worker/audio-transcription.ts"],
  ["analysis", "app/worker/highlight-analysis.ts"],
  ["translations", "app/worker/translations.ts"],
  ["tts", "app/worker/tts.ts"],
  ["watchdog", "app/worker/watchdog.ts"],
];

writeLog("INFO", "runner", `npm run worker:all started pid=${process.pid}`);

const children = groups.map(([name, entry]) => {
  const child = spawn(process.execPath, [tsx, path.join(root, entry)], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  writeLog("INFO", "runner", `started ${name} pid=${child.pid} entry=${entry}`);
  relay(child.stdout, name, "INFO", process.stdout);
  relay(child.stderr, name, "ERROR", process.stderr);
  child.on("exit", (code, signal) => {
    const level = code === 0 || signal ? "INFO" : "ERROR";
    writeLog(level, "runner", `${name} exited code=${code ?? "none"} signal=${signal ?? "none"}`);
    if (code && !signal) process.exitCode = code;
  });
  return child;
});

function shutdown(signal) {
  writeLog("WARN", "runner", `received ${signal}; stopping ${children.length} worker groups`);
  for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", (code) => {
  writeLog(code === 0 ? "INFO" : "ERROR", "runner", `worker:all exited code=${code}`);
  logStream.end();
});
