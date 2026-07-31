/**
 * Thin ffmpeg/ffprobe wrapper for the highlight-reel worker.
 *
 * ffmpeg is not bundled with this repo. Install it and put it on PATH, or point
 * FFMPEG_PATH / FFPROBE_PATH at the binaries in .env.
 */
import { spawn } from "node:child_process";

export const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE_BIN = process.env.FFPROBE_PATH || "ffprobe";

/** Every clip is normalized to this so the final concat can stream-copy. */
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 30;
const TARGET_SAMPLE_RATE = 48000;

function run(bin: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `"${bin}" not found. Install ffmpeg (it ships ffprobe too) and put it on ` +
              `PATH, or set FFMPEG_PATH / FFPROBE_PATH in .env.`
          )
        );
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited ${code}: ${stderr.trim().slice(-800)}`));
    });
  });
}

export async function probeDurationSeconds(file: string): Promise<number> {
  const out = await run(FFPROBE_BIN, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const duration = Number(out.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read a duration from "${file}"`);
  }
  return duration;
}

export async function hasAudioStream(file: string): Promise<boolean> {
  const out = await run(FFPROBE_BIN, [
    "-v", "error",
    "-select_streams", "a",
    "-show_entries", "stream=index",
    "-of", "csv=p=0",
    file,
  ]);
  return out.trim().length > 0;
}

/**
 * Cut [start, end) out of `input` and re-encode it to the shared target format.
 * Camera 2 records video-only, so clips from it get a silent track grafted on —
 * without it the concat would drop audio from that point on.
 */
export async function extractNormalizedClip(opts: {
  input: string;
  start: number;
  end: number;
  output: string;
  withSilentAudio: boolean;
  cwd?: string;
}): Promise<void> {
  const { input, start, end, output, withSilentAudio, cwd } = opts;
  const duration = end - start;

  const args = [
    "-y",
    "-ss", start.toFixed(3),
    "-t", duration.toFixed(3),
    "-i", input,
  ];

  if (withSilentAudio) {
    args.push(
      "-f", "lavfi",
      "-t", duration.toFixed(3),
      "-i", `anullsrc=channel_layout=stereo:sample_rate=${TARGET_SAMPLE_RATE}`,
      "-map", "0:v:0",
      "-map", "1:a:0"
    );
  } else {
    args.push("-map", "0:v:0", "-map", "0:a:0");
  }

  args.push(
    "-vf",
    `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,` +
      `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,` +
      `fps=${TARGET_FPS},format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", String(TARGET_SAMPLE_RATE),
    "-ac", "2",
    "-shortest",
    output
  );

  await run(FFMPEG_BIN, args, cwd);
}

/**
 * Join the normalized clips. `clips` are filenames relative to `cwd` — keeping
 * them relative sidesteps quoting Windows paths inside the concat list file.
 */
export async function concatClips(
  clips: string[],
  output: string,
  cwd: string,
  listFilename = "concat-list.txt"
): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  await writeFile(
    join(cwd, listFilename),
    clips.map((c) => `file '${c}'`).join("\n") + "\n",
    "utf-8"
  );

  await run(
    FFMPEG_BIN,
    [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFilename,
      "-c", "copy",
      "-movflags", "+faststart",
      output,
    ],
    cwd
  );
}
