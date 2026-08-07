/**
 * Filesystem-side helper for the Screen 07 green-screen pipeline.
 * Server/worker only (uses node:path + process.cwd()) — kept out of
 * lib/green-screen.ts so that client-safe module can be imported by the
 * Screen 07 component without pulling node:* into the browser bundle.
 *
 * The source take and the composited output both live in MinIO now (see
 * lib/green-screen.ts and app/worker/green-screen-compose.ts) — only the
 * background *images* are still static files checked into /public.
 */
import { join } from "node:path";

const PUBLIC_DIR = join(process.cwd(), "public");

export function backgroundImagePath(backgroundId: string): string {
  return join(PUBLIC_DIR, "backgrounds", `${backgroundId}.jpg`);
}
