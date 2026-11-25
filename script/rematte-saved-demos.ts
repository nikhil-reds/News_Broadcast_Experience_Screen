import "dotenv/config";

import { copyFile, mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { GREEN_SCREEN_BACKGROUNDS } from "@/lib/green-screen";
import { backgroundImagePath } from "@/lib/green-screen-paths";
import { composeMattedForegroundBackground, probeStreamDurations } from "@/lib/ffmpeg";
import { runRvmMatting, validateMatteFiles } from "@/lib/video-matting";

const ALL_TARGETS = ["snapshot", "latest", "newest"] as const;
type DemoTarget = (typeof ALL_TARGETS)[number];

interface DemoRecording {
  filename: string;
  url: string;
}

interface DemoSnapshot {
  createdAt: string;
  recordings: DemoRecording[];
  composites: Record<string, {
    url: string;
    engine?: string;
    fallback: string | null;
    fallbackReason: string | null;
    mattingVersion?: string;
  }>;
  [key: string]: unknown;
}

function selectedTargets(): DemoTarget[] {
  const requested = process.argv.slice(2);
  if (!requested.length) return [...ALL_TARGETS];
  for (const target of requested) {
    if (!ALL_TARGETS.includes(target as DemoTarget)) {
      throw new Error(`Unknown demo target "${target}". Use snapshot, latest or newest.`);
    }
  }
  return requested as DemoTarget[];
}

function publicFileFromUrl(url: string, target: DemoTarget): string {
  const decoded = decodeURIComponent(url.split("?")[0]);
  const expectedPrefix = `/demo/${target}/`;
  if (!decoded.startsWith(expectedPrefix)) {
    throw new Error(`Saved reel URL is outside ${expectedPrefix}: ${url}`);
  }
  const file = resolve("public", decoded.replace(/^\/+/, ""));
  const targetRoot = resolve("public", "demo", target);
  if (!file.startsWith(targetRoot + "\\") && !file.startsWith(targetRoot + "/")) {
    throw new Error(`Saved reel resolved outside ${targetRoot}: ${file}`);
  }
  return file;
}

async function verifyComposite(source: string, output: string) {
  const [sourceDuration, outputDuration, outputStat] = await Promise.all([
    probeStreamDurations(source),
    probeStreamDurations(output),
    stat(output),
  ]);
  const sourceSeconds = sourceDuration.video ?? sourceDuration.format;
  const outputSeconds = outputDuration.video ?? outputDuration.format;
  if (outputStat.size <= 0 || sourceSeconds == null || outputSeconds == null) {
    throw new Error(`Composite verification failed for ${output}`);
  }
  if (Math.abs(sourceSeconds - outputSeconds) > 0.5) {
    throw new Error(
      `Composite duration mismatch for ${output}: source=${sourceSeconds.toFixed(3)} output=${outputSeconds.toFixed(3)}`
    );
  }
}

async function rematte(target: DemoTarget, mattingVersion: string) {
  const root = resolve("public", "demo", target);
  const snapshotPath = join(root, "snapshot.json");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as DemoSnapshot;
  const reel = snapshot.recordings.find((recording) => recording.filename.startsWith("highlight-"));
  if (!reel) throw new Error(`${target} has no saved highlight reel.`);

  const source = publicFileFromUrl(reel.url, target);
  const sourceStat = await stat(source);
  if (sourceStat.size <= 0) throw new Error(`${target} highlight reel is empty: ${source}`);

  const workDir = await mkdtemp(join(tmpdir(), `saved-demo-${target}-`));
  const foreground = join(workDir, "foreground.mkv");
  const alpha = join(workDir, "alpha.mkv");
  const matteMetadata = join(workDir, "matte.json");
  const release = `${mattingVersion}-${Date.now()}`;
  const releaseDir = join(root, "assets", release);

  try {
    console.log(`[saved-demo] ${target}: running RVM for ${basename(source)}`);
    await runRvmMatting({ input: source, foreground, alpha, metadata: matteMetadata });
    await validateMatteFiles({ source, foreground, alpha, metadata: matteMetadata });

    const staged = new Map<string, string>();
    for (const background of GREEN_SCREEN_BACKGROUNDS) {
      const output = join(workDir, `${background.id}.mp4`);
      console.log(`[saved-demo] ${target}: composing ${background.id}`);
      await composeMattedForegroundBackground({
        foregroundVideo: foreground,
        alphaVideo: alpha,
        backgroundImage: backgroundImagePath(background.id),
        sourceAudio: source,
        output,
      });
      await verifyComposite(source, output);
      staged.set(background.id, output);
    }

    // Publish only after every background has passed verification. Until the
    // snapshot rename below, the currently saved demo remains untouched.
    await mkdir(releaseDir, { recursive: true });
    for (const background of GREEN_SCREEN_BACKGROUNDS) {
      const sourceOutput = staged.get(background.id);
      if (!sourceOutput) throw new Error(`Missing staged composite for ${background.id}`);
      const destination = join(releaseDir, `${background.id}.mp4`);
      const partialDestination = `${destination}.partial`;
      await copyFile(sourceOutput, partialDestination);
      await rename(partialDestination, destination);
      const metadata = {
        engine: "rvm",
        fallback: null,
        fallbackReason: null,
        mattingVersion,
        sourceFilename: reel.filename,
        backgroundId: background.id,
        createdAt: new Date().toISOString(),
      };
      await writeFile(join(releaseDir, `${background.id}.json`), JSON.stringify(metadata, null, 2) + "\n");
      snapshot.composites[background.id] = {
        url: `/demo/${target}/assets/${release}/${background.id}.mp4`,
        engine: "rvm",
        fallback: null,
        fallbackReason: null,
        mattingVersion,
      };
    }

    snapshot.createdAt = new Date().toISOString();
    const partial = `${snapshotPath}.partial`;
    await writeFile(partial, JSON.stringify(snapshot, null, 2) + "\n");
    await rename(partial, snapshotPath);
    console.log(`[saved-demo] ${target}: published ${GREEN_SCREEN_BACKGROUNDS.length} verified RVM composites`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  if ((process.env.GREEN_SCREEN_ENGINE || "rvm") !== "rvm") {
    throw new Error("GREEN_SCREEN_ENGINE must be rvm for saved-demo rematting.");
  }
  if ((process.env.GREEN_SCREEN_FALLBACK_CHROMAKEY || "true") !== "false") {
    throw new Error("GREEN_SCREEN_FALLBACK_CHROMAKEY must be false before saved-demo rematting.");
  }
  const mattingVersion = process.env.GREEN_SCREEN_MATTING_VERSION;
  if (!mattingVersion) throw new Error("GREEN_SCREEN_MATTING_VERSION is required.");
  for (const target of selectedTargets()) await rematte(target, mattingVersion);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
