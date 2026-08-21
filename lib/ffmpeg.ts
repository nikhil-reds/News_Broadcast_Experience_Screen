/**
 * Thin ffmpeg/ffprobe wrapper for the highlight-reel worker.
 *
 * ffmpeg is not bundled with this repo. Install it and put it on PATH, or point
 * FFMPEG_PATH / FFPROBE_PATH at the binaries in .env.
 */
import { spawn } from "node:child_process";

export const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE_BIN = process.env.FFPROBE_PATH || "ffprobe";

/**
 * Caps libx264's own internal thread pool per ffmpeg process. Without this,
 * every encode defaults to using every core the machine has — harmless when
 * exactly one ffmpeg process runs at a time, but the "video" worker group
 * can have up to 7 running concurrently (video-export ×1 + highlight-reel
 * ×1 + green-screen-compose × BG_QUEUE_CONCURRENCY, default 5), and 7
 * processes each trying to claim all 8 cores thrash rather than share —
 * observed live as one process pegged at 500-600%+ CPU for many minutes
 * while its siblings sat at 0% making no progress at all, which looks
 * exactly like a hang from the outside (and eventually trips the ffmpeg
 * timeout) but is actually oversubscription, not a stuck process.
 */
const FFMPEG_THREADS = parseInt(process.env.FFMPEG_THREADS || "2", 10);

/** Every clip is normalized to this so the final concat can stream-copy. */
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 30;
const TARGET_SAMPLE_RATE = 48000;

/**
 * `timeoutMs`, when given, kills the child with SIGKILL if it hasn't exited
 * by then and rejects instead of hanging forever — added after a live
 * incident where a video-export ffmpeg pass sat stuck for 30+ minutes at
 * near-zero CPU, tying up a worker concurrency slot. A killed run rejects
 * like any other ffmpeg failure, so BullMQ's existing attempts/backoff
 * handles the retry with no extra plumbing. While a timeout is armed, a
 * heartbeat log every 30s gives visibility into a slow/hung run without
 * needing to parse ffmpeg's own `-progress` output.
 *
 * `onHeartbeat`, when given, fires on that same 30s tick with the child's
 * pid — the caller (lib/generation-heartbeat.ts) uses this to write
 * GenerationTask.lastHeartbeatAt/processId instead of running a second,
 * independent timer alongside this one.
 */
function run(
  bin: string,
  args: string[],
  cwd?: string,
  timeoutMs?: number,
  onHeartbeat?: (pid: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true });
    const startedAt = Date.now();
    if (onHeartbeat && child.pid) onHeartbeat(child.pid); // record the pid right away, don't wait for the first 30s tick

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    let heartbeat: NodeJS.Timeout | undefined;

    if (timeoutMs || onHeartbeat) {
      heartbeat = setInterval(() => {
        console.log(`[ffmpeg] "${bin}" still running after ${Math.round((Date.now() - startedAt) / 1000)}s`);
        if (onHeartbeat && child.pid) onHeartbeat(child.pid);
      }, 30_000);
    }
    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
    }

    const clearTimers = () => {
      if (timer) clearTimeout(timer);
      if (heartbeat) clearInterval(heartbeat);
    };

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimers();
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
      clearTimers();
      if (timedOut) {
        reject(new Error(`${bin} timed out after ${Math.round(timeoutMs! / 60000)} minutes and was killed`));
        return;
      }
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
  timeoutMs?: number;
  onHeartbeat?: (pid: number) => void;
}): Promise<void> {
  const { input, start, end, output, withSilentAudio, cwd, timeoutMs, onHeartbeat } = opts;
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
    "-threads", String(FFMPEG_THREADS),
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", String(TARGET_SAMPLE_RATE),
    "-ac", "2",
    "-shortest",
    output
  );

  await run(FFMPEG_BIN, args, cwd, timeoutMs, onHeartbeat);
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
  timeoutMs?: number;
  onHeartbeat?: (pid: number) => void;
}): Promise<void> {
  // 960x540 + ultrafast trims the render meaningfully versus 720p/veryfast
  // (~30-40% faster in testing) at a quality cost that doesn't matter for a
  // studio-monitor-sized card. Screen 07 also pre-warms every background in
  // the background on load, so this preset is only ever felt on a cold start.
  const { input, backgroundImage, output, width = 960, height = 540, timeoutMs, onHeartbeat } = opts;

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
    // `input` (camera 1's take) usually carries real audio — captureAudio is
    // on for camera 1 (see lib/use-camera-recorder.ts) — but the `?` keeps
    // this from failing on an older/video-only take that predates that, or
    // one where mic capture fell back to video-only. Previously no audio
    // stream was mapped at all, so every composited background came out
    // silent regardless of what the source had.
    "-map", "1:a?",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-threads", String(FFMPEG_THREADS),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    output,
  ], undefined, timeoutMs, onHeartbeat);
}

export interface SubtitleOverlay {
  /** PNG path, relative to `cwd` — same rationale as `concatClips`'s `clips`. */
  pngPath: string;
  start: number;
  end: number;
}

/**
 * Scale/crop the highlight reel to `width`x`height` — or, if `backgroundImage`
 * is given, chromakey the reel onto that background at `width`x`height`
 * directly instead of a plain scale/crop (same chromakey/despill recipe as
 * composeGreenScreenBackground above, just targeting the export's own
 * dimensions rather than Screen 07's fixed 960x540 preview size) — then burn
 * each subtitle PNG in over its time window, and optionally stamp a logo in
 * the corner for the whole duration. Used by the Screen 11/12 portrait/
 * landscape export pipeline.
 *
 * The ad banner (Screens 9/10/11/12) is deliberately NOT composited here —
 * it stays an HTML/CSS overlay on top of the exported <video>, same as
 * Screens 9/10 already do, rather than a permanent pixel burn-in.
 *
 * Subtitles are pre-rendered PNGs (see lib/subtitle-image.ts) rather than the
 * `subtitles`/`drawtext` filters — this ffmpeg build has no libass/freetype.
 */
export async function composeFinalExport(opts: {
  input: string;
  output: string;
  width: number;
  height: number;
  /** true: scale to fill then center-crop (portrait from a 16:9 source). false: exact scale (landscape). */
  crop: boolean;
  subtitles: SubtitleOverlay[];
  logoPath?: string;
  /** Chromakey the reel onto this background image instead of a plain scale/crop. */
  backgroundImage?: string;
  cwd: string;
  /** Bound the ffmpeg pass and kill+reject if it runs longer than this. */
  timeoutMs?: number;
  onHeartbeat?: (pid: number) => void;
}): Promise<void> {
  const { input, output, width, height, crop, subtitles, logoPath, backgroundImage, cwd, timeoutMs, onHeartbeat } =
    opts;

  const scaleFilter = crop
    ? `scale=-2:${height},crop=${width}:${height}:(iw-${width})/2:0`
    : `scale=${width}:${height}`;

  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  if (backgroundImage) {
    args.push("-loop", "1", "-i", backgroundImage);
  }
  args.push("-i", input);

  // Input index of the main reel video/audio — shifts by one when a
  // background image occupies index 0.
  const mainIndex = backgroundImage ? 1 : 0;
  const subtitleStartIndex = mainIndex + 1;

  for (const sub of subtitles) {
    args.push("-loop", "1", "-i", sub.pngPath);
  }
  if (logoPath) args.push("-i", logoPath);

  const filterParts: string[] = [];
  let lastLabel: string;

  if (backgroundImage) {
    filterParts.push(
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,format=yuv420p[bg]`
    );
    filterParts.push(
      `[${mainIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
        `chromakey=0x46C832:0.12:0.04,despill=type=green:mix=0.5:expand=0[fg]`
    );
    filterParts.push(`[bg][fg]overlay=shortest=1:format=auto[base]`);
    lastLabel = "base";
  } else {
    filterParts.push(`[${mainIndex}:v]${scaleFilter},format=yuv420p[base]`);
    lastLabel = "base";
  }

  subtitles.forEach((sub, i) => {
    const inputIndex = subtitleStartIndex + i;
    const outLabel = `sub${i}`;
    filterParts.push(
      `[${lastLabel}][${inputIndex}:v]overlay=0:main_h-overlay_h:enable='between(t,${sub.start.toFixed(
        3
      )},${sub.end.toFixed(3)})'[${outLabel}]`
    );
    lastLabel = outLabel;
  });

  if (logoPath) {
    const logoInputIndex = subtitleStartIndex + subtitles.length;
    filterParts.push(`[${lastLabel}][${logoInputIndex}:v]overlay=24:24[withlogo]`);
    lastLabel = "withlogo";
  }

  args.push(
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    `[${lastLabel}]`,
    "-map",
    `${mainIndex}:a?`,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-threads",
    String(FFMPEG_THREADS),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    output
  );

  await run(FFMPEG_BIN, args, cwd, timeoutMs, onHeartbeat);
}

/**
 * Join the normalized clips. `clips` are filenames relative to `cwd` — keeping
 * them relative sidesteps quoting Windows paths inside the concat list file.
 */
export async function concatClips(
  clips: string[],
  output: string,
  cwd: string,
  listFilename = "concat-list.txt",
  timeoutMs?: number,
  onHeartbeat?: (pid: number) => void
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
    cwd,
    timeoutMs,
    onHeartbeat
  );
}
