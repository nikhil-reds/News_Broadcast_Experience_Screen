/**
 * Filesystem-side helpers for the Screen 07 green-screen pipeline.
 * Server/worker only (uses node:path + process.cwd()) — kept out of
 * lib/green-screen.ts so that client-safe module can be imported by the
 * Screen 07 component without pulling node:* into the browser bundle.
 */
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { GREEN_SCREEN_SOURCE_VIDEO } from "@/lib/green-screen";

const PUBLIC_DIR = join(process.cwd(), "public");
const GENERATED_DIR = join(PUBLIC_DIR, "generated", "green-screen");

export function sourceVideoPath(): string {
  return join(PUBLIC_DIR, GREEN_SCREEN_SOURCE_VIDEO);
}

export function backgroundImagePath(backgroundId: string): string {
  return join(PUBLIC_DIR, "backgrounds", `${backgroundId}.jpg`);
}

export function composedOutputDir(): string {
  return GENERATED_DIR;
}

export function composedOutputPath(backgroundId: string): string {
  return join(GENERATED_DIR, `${backgroundId}.mp4`);
}

/**
 * True when this background's composite is on disk AND non-empty.
 *
 * Both the enqueue route ("is this a cache hit?") and the poll route ("is this
 * job's `completed` state still trustworthy?") gate on this. It has to be the
 * single source of truth because the cache and the BullMQ job record can drift
 * apart in both directions: `public/generated/` is gitignored and routinely
 * wiped, while completed job records linger under `removeOnComplete`.
 *
 * The size check matters separately — a killed ffmpeg can leave a 0-byte file
 * that `access()` reports as a perfectly good cache hit, which the browser
 * then refuses to play (black <video> + an onError with no explanation).
 */
export async function composedOutputExists(backgroundId: string): Promise<boolean> {
  try {
    const info = await stat(composedOutputPath(backgroundId));
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}
