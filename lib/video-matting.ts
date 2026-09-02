import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { probeStreamDurations } from "@/lib/ffmpeg";

export interface RvmMattingResult {
  foregroundPath: string;
  alphaPath: string;
  metadataPath: string;
}

const DEFAULT_RVM_TIMEOUT_MS = 60 * 1000;
const RVM_TIMEOUT_MS = parseInt(process.env.RVM_TIMEOUT_MS || String(DEFAULT_RVM_TIMEOUT_MS), 10);

function projectPath(path: string): string {
  return resolve(process.cwd(), path);
}

export async function runRvmMatting(opts: {
  input: string;
  foreground: string;
  alpha: string;
  metadata: string;
  timeoutMs?: number;
  onHeartbeat?: (pid: number) => void;
}): Promise<RvmMattingResult> {
  const python = process.env.RVM_PYTHON || "python";
  const script = projectPath(process.env.RVM_SCRIPT || "tools/rvm/matte_video.py");
  const model = process.env.RVM_MODEL || "mobilenetv3";
  const device = process.env.RVM_DEVICE || "auto";
  const downsampleRatio = process.env.RVM_DOWNSAMPLE_RATIO || "0.25";
  const modelPath = process.env.RVM_MODEL_PATH;

  const args = [
    script,
    "--input", opts.input,
    "--foreground", opts.foreground,
    "--alpha", opts.alpha,
    "--metadata", opts.metadata,
    "--model", model,
    "--device", device,
    "--downsample-ratio", downsampleRatio,
  ];
  if (modelPath) args.push("--model-path", projectPath(modelPath));

  await runProcess(python, args, opts.timeoutMs ?? RVM_TIMEOUT_MS, opts.onHeartbeat);

  return {
    foregroundPath: opts.foreground,
    alphaPath: opts.alpha,
    metadataPath: opts.metadata,
  };
}

export async function validateMatteFiles(opts: {
  source: string;
  foreground: string;
  alpha: string;
  metadata: string;
}): Promise<void> {
  const [sourceDurations, foregroundDurations, alphaDurations, foregroundStat, alphaStat, metadataStat] =
    await Promise.all([
      probeStreamDurations(opts.source),
      probeStreamDurations(opts.foreground),
      probeStreamDurations(opts.alpha),
      stat(opts.foreground),
      stat(opts.alpha),
      stat(opts.metadata),
    ]);

  if (foregroundStat.size <= 0) throw new Error("RVM foreground output is empty");
  if (alphaStat.size <= 0) throw new Error("RVM alpha output is empty");
  if (metadataStat.size <= 0) throw new Error("RVM metadata output is empty");

  const sourceDuration = sourceDurations.video ?? sourceDurations.format;
  const foregroundDuration = foregroundDurations.video ?? foregroundDurations.format;
  const alphaDuration = alphaDurations.video ?? alphaDurations.format;

  if (sourceDuration == null || foregroundDuration == null || alphaDuration == null) {
    throw new Error("Could not read source/foreground/alpha video durations");
  }

  const tolerance = 0.35;
  if (Math.abs(sourceDuration - foregroundDuration) > tolerance) {
    throw new Error(
      `RVM foreground duration mismatch: source=${sourceDuration.toFixed(3)}s foreground=${foregroundDuration.toFixed(3)}s`
    );
  }
  if (Math.abs(sourceDuration - alphaDuration) > tolerance) {
    throw new Error(
      `RVM alpha duration mismatch: source=${sourceDuration.toFixed(3)}s alpha=${alphaDuration.toFixed(3)}s`
    );
  }
}

function runProcess(
  bin: string,
  args: string[],
  timeoutMs: number,
  onHeartbeat?: (pid: number) => void
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const command = [bin, ...args].join(" ");
    const child = spawn(bin, args, { cwd: process.cwd(), windowsHide: true, windowsVerbatimArguments: false });
    const startedAt = Date.now();
    console.log(`[RVM] starting command=${command}`);
    if (onHeartbeat && child.pid) onHeartbeat(child.pid);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const heartbeat = setInterval(() => {
      console.log(`[rvm] "${bin}" still running after ${Math.round((Date.now() - startedAt) / 1000)}s`);
      if (onHeartbeat && child.pid) onHeartbeat(child.pid);
    }, 30_000);

    const clearTimers = () => {
      clearTimeout(timeout);
      clearInterval(heartbeat);
    };

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimers();
      console.error(`[RVM] process error elapsedMs=${Date.now() - startedAt} code=${err.code ?? "unknown"}: ${err.message}`);
      if (err.code === "ENOENT") {
        reject(new Error(`"${bin}" not found. Set RVM_PYTHON to a Python executable with RVM dependencies installed.`));
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimers();
      const elapsedMs = Date.now() - startedAt;
      console.log(`[RVM] process exited code=${code ?? "signal"} elapsedMs=${elapsedMs}`);
      if (stdout.trim()) console.log(`[RVM] stdout tail=${stdout.trim().slice(-1200)}`);
      if (stderr.trim()) console.error(`[RVM] stderr tail=${stderr.trim().slice(-1200)}`);
      if (timedOut) {
        reject(new Error(`RVM timed out after ${Math.round(timeoutMs / 1000)} seconds and was killed; command=${command}`));
        return;
      }
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`RVM exited ${code}: ${(stderr || stdout).trim().slice(-1200)}; command=${command}`));
    });
  });
}
