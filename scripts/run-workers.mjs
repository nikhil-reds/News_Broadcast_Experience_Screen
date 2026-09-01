/**
 * Worker Process Manager
 * -----------------------
 * Entry point for `npm run worker:all`. Spawns every BullMQ worker as a
 * separate OS process and supervises them from one terminal.
 *
 *     npm run worker:all                    # all groups
 *     node scripts/run-workers.mjs video    # just the ffmpeg group
 *     node scripts/run-workers.mjs --except watchdog
 *     node scripts/run-workers.mjs --list
 *
 * WHY separate processes instead of app/worker/all.ts (which imports every
 * worker into one process): a stuck/slow ffmpeg export starves the other
 * workers' Redis connections of event-loop time, so BullMQ locks lapse and
 * healthy jobs get reclaimed as stalled. The three ffmpeg-heavy workers are
 * grouped together in app/worker/video.ts and isolated from the lighter
 * Gemini/Whisper workers, which each get their own process.
 *
 * Each group runs standalone too (see the npm scripts in package.json) - this
 * file is a convenience supervisor for local dev and single-box deployments,
 * not a replacement for a real process manager in production.
 *
 * Supervision: a group that exits non-zero is restarted with backoff, up to
 * MAX_RESTARTS inside RESTART_WINDOW_MS; past that the group is left dead and
 * the rest keep running. Ctrl+C forwards shutdown to every child and waits
 * SHUTDOWN_GRACE_MS for each to drain before force-killing.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 60_000;
const RESTART_DELAY_MS = 2_000;
const SHUTDOWN_GRACE_MS = 20_000;

/** name -> entry file (relative to repo root) + label colour. */
const GROUPS = [
  { name: "video", entry: "app/worker/video.ts", color: 35 },
  { name: "audio", entry: "app/worker/audio-transcription.ts", color: 36 },
  { name: "analysis", entry: "app/worker/highlight-analysis.ts", color: 33 },
  { name: "translations", entry: "app/worker/translations.ts", color: 32 },
  { name: "tts", entry: "app/worker/tts.ts", color: 34 },
  { name: "watchdog", entry: "app/worker/watchdog.ts", color: 90 },
];

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);

const LABEL_WIDTH = Math.max(...GROUPS.map((g) => g.name.length));
const stamp = (group, text) =>
  `${paint(group.color, `[${group.name.padEnd(LABEL_WIDTH)}]`)} ${text}`;

function say(group, text) {
  for (const line of String(text).split("\n")) {
    if (line.trim() !== "") console.log(stamp(group, line));
  }
}

const MANAGER = { name: "workers", color: 1 };

function parseArgs(argv) {
  const names = [];
  const except = [];
  let list = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") {
      list = true;
    } else if (arg === "--except" || arg === "--without") {
      const next = argv[i + 1];
      if (!next) throw new Error(`${arg} needs a group name`);
      except.push(...next.split(","));
      i += 1;
    } else if (arg === "--only") {
      const next = argv[i + 1];
      if (!next) throw new Error("--only needs a group name");
      names.push(...next.split(","));
      i += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      names.push(...arg.split(","));
    }
  }
  return { names, except, list };
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(stamp(MANAGER, `bad arguments: ${error.message}`));
  console.error(stamp(MANAGER, `groups: ${GROUPS.map((g) => g.name).join(", ")}`));
  process.exit(1);
}

if (options.list) {
  for (const group of GROUPS) {
    console.log(`${group.name.padEnd(LABEL_WIDTH)}  ${group.entry}`);
  }
  process.exit(0);
}

const unknown = [...options.names, ...options.except].filter(
  (name) => !GROUPS.some((g) => g.name === name),
);
if (unknown.length > 0) {
  console.error(stamp(MANAGER, `unknown group(s): ${unknown.join(", ")}`));
  console.error(stamp(MANAGER, `groups: ${GROUPS.map((g) => g.name).join(", ")}`));
  process.exit(1);
}

const selected = GROUPS.filter(
  (g) =>
    (options.names.length === 0 || options.names.includes(g.name)) &&
    !options.except.includes(g.name),
);

if (selected.length === 0) {
  console.error(stamp(MANAGER, "nothing to run after applying filters"));
  process.exit(1);
}

if (!existsSync(TSX_CLI)) {
  console.error(stamp(MANAGER, `cannot find tsx at ${TSX_CLI} - run \`npm install\` first`));
  process.exit(1);
}

for (const group of selected) {
  if (!existsSync(path.join(ROOT, group.entry))) {
    console.error(stamp(MANAGER, `missing worker entry: ${group.entry}`));
    process.exit(1);
  }
}

/** group.name -> { child, restarts: number[], dead: boolean } */
const state = new Map();
let shuttingDown = false;

function start(group) {
  const child = spawn(process.execPath, [TSX_CLI, path.join(ROOT, group.entry)], {
    cwd: ROOT,
    // stdin ignored: the workers are non-interactive, and inheriting it on
    // Windows makes Ctrl+C handling in the children unpredictable.
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WORKER_GROUP: group.name, FORCE_COLOR: useColor ? "1" : "0" },
    windowsHide: true,
  });

  const entry = state.get(group.name) ?? { restarts: [], dead: false };
  entry.child = child;
  state.set(group.name, entry);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => say(group, chunk));
  child.stderr.on("data", (chunk) => say(group, chunk));

  child.on("error", (error) => say(group, `failed to spawn: ${error.message}`));

  child.on("exit", (code, signal) => {
    entry.child = undefined;
    const how = signal ? `signal ${signal}` : `code ${code}`;

    if (shuttingDown) {
      say(group, `stopped (${how})`);
      maybeFinish();
      return;
    }

    if (code === 0) {
      say(group, "exited cleanly - not restarting");
      entry.dead = true;
      maybeFinish();
      return;
    }

    const now = Date.now();
    entry.restarts = entry.restarts.filter((t) => now - t < RESTART_WINDOW_MS);
    if (entry.restarts.length >= MAX_RESTARTS) {
      say(
        group,
        `crashed (${how}) - ${MAX_RESTARTS} restarts in ${RESTART_WINDOW_MS / 1000}s, giving up on this group`,
      );
      entry.dead = true;
      maybeFinish();
      return;
    }

    entry.restarts.push(now);
    say(
      group,
      `crashed (${how}) - restart ${entry.restarts.length}/${MAX_RESTARTS} in ${RESTART_DELAY_MS / 1000}s`,
    );
    setTimeout(() => {
      if (!shuttingDown) start(group);
    }, RESTART_DELAY_MS).unref();
  });

  say(group, `started (pid ${child.pid}) -> ${group.entry}`);
}

function running() {
  return [...state.values()].filter((entry) => entry.child).length;
}

function maybeFinish() {
  if (running() > 0) return;
  if (shuttingDown) {
    console.log(stamp(MANAGER, "all workers stopped"));
    process.exit(0);
  }
  console.log(stamp(MANAGER, "every worker group has exited - nothing left to supervise"));
  process.exit(1);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(stamp(MANAGER, `${signal} - stopping ${running()} worker process(es)`));

  for (const [name, entry] of state) {
    const child = entry.child;
    if (!child) continue;
    // On POSIX the workers' own SIGINT/SIGTERM handlers drain BullMQ first; on
    // Windows kill() maps to TerminateProcess, so there is nothing to drain.
    child.kill(process.platform === "win32" ? undefined : signal);
    setTimeout(() => {
      if (entry.child) {
        console.log(
          stamp(MANAGER, `${name} did not exit in ${SHUTDOWN_GRACE_MS / 1000}s - force killing`),
        );
        entry.child.kill("SIGKILL");
      }
    }, SHUTDOWN_GRACE_MS).unref();
  }

  maybeFinish();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log(
  stamp(
    MANAGER,
    `starting ${selected.length} process(es): ${selected.map((g) => g.name).join(", ")}`,
  ),
);
for (const group of selected) start(group);
