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
 * Chroma-key `input` (a green-screen take) onto `backgroundImage` and write
 * the composited result to `output`. Used by the Screen 07 background picker.
 *
 * The key color was sampled from the studio take's actual green (~#46C832,
 * not the pure #00FF00 the filter defaults assume). similarity/blend are
 * intentionally tight (0.12/0.04) — at the first-pass values (0.18/0.08) the
 * key range was wide enough to catch her light-grey shirt and skin tone too,
 * making them ~40-65% transparent and letting the background ghost through
 * (visible as background detail bleeding across her face/shoulders). Verified
 * by inspecting the foreground layer's alpha channel directly: at 0.12/0.04
 * face/shirt are fully opaque (alpha 255) and only ~0.4% of pixels fall in
 * the partial-alpha band, which is just the antialiased cutout edge.
 * `despill` pulls the residual green tint out of hair/skin along that edge
 * afterward.
 */
export async function composeGreenScreenBackground(opts: {
  input: string;
  backgroundImage: string;
  output: string;
  width?: number;
  height?: number;
}): Promise<void> {
  // 960x540 + ultrafast trims the render meaningfully versus 720p/veryfast
  // (~30-40% faster in testing) at a quality cost that doesn't matter for a
  // studio-monitor-sized card. Screen 07 also pre-warms every background in
  // the background on load, so this preset is only ever felt on a cold start.
  const { input, backgroundImage, output, width = 960, height = 540 } = opts;

  const filter =
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
    `crop=${width}:${height},setsar=1,format=yuv420p[bg];` +
    `[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
    `chromakey=0x46C832:0.12:0.04,despill=type=green:mix=0.5:expand=0[fg];` +
    `[bg][fg]overlay=shortest=1:format=auto[outv]`;

  await run(FFMPEG_BIN, [
    "-y",
    // Screen 07 surfaces `failedReason` verbatim in its error banner, and on
    // failure `run()` keeps only the tail of stderr — which the version +
    // configure-flags banner is long enough to fill on its own, burying the one
    // line that says what actually went wrong. Drop the banner and the
    // per-frame progress chatter so what's left is the error itself.
    "-hide_banner",
    "-loglevel", "error",
    "-loop", "1",
    "-i", backgroundImage,
    "-i", input,
    "-filter_complex", filter,
    "-map", "[outv]",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-shortest",
    "-movflags", "+faststart",
    output,
  ]);
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
