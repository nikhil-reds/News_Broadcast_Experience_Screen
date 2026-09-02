/**
 * Screen 07 — live green-screen background swap, composited against the
 * latest edited highlight reel. A new reel invalidates both the expensive
 * local video-matting cache and the cheap per-background composites.
 *
 * Client-safe: the list of selectable backgrounds and the URL/filename
 * convention for composited output. No node:* imports here on purpose — this
 * module is imported directly by the Screen 07 client component, and must not
 * pull in the `minio` package (server-only). Filesystem path helpers for the
 * static background images (server/worker only) live in
 * lib/green-screen-paths.ts.
 *
 * RVM output is cached once per edited reel, then final MP4s are cached per
 * (background id, edited reel) in the MinIO `videos` bucket. This keeps
 * background switching fast without rerunning AI inference.
 */

export interface GreenScreenBackground {
  id: string;
  label: string;
  /** Full-resolution background image, under /public. */
  image: string;
  /** Small thumbnail for the picker grid, under /public. */
  thumb: string;
}

/** Kept in sync with public/backgrounds/manifest.json (see that file for how
 *  these were generated). Hard-coded rather than read at import time so the
 *  client bundle doesn't need a fetch just to render the picker grid. */
export const GREEN_SCREEN_BACKGROUNDS: GreenScreenBackground[] = [
  {
    id: "newsroom-blue",
    label: "Newsroom Blue",
    image: "/backgrounds/newsroom-blue.jpg",
    thumb: "/backgrounds/thumbs/newsroom-blue.jpg",
  },
  {
    id: "city-skyline",
    label: "City Skyline",
    image: "/backgrounds/city-skyline.jpg",
    thumb: "/backgrounds/thumbs/city-skyline.jpg",
  },
  {
    id: "world-map",
    label: "World Map",
    image: "/backgrounds/world-map.jpg",
    thumb: "/backgrounds/thumbs/world-map.jpg",
  },
  {
    id: "sunrise-studio",
    label: "Sunrise Studio",
    image: "/backgrounds/sunrise-studio.jpg",
    thumb: "/backgrounds/thumbs/sunrise-studio.jpg",
  },
  {
    id: "corporate-grey",
    label: "Corporate Grey",
    image: "/backgrounds/corporate-grey.jpg",
    thumb: "/backgrounds/thumbs/corporate-grey.jpg",
  },
];

export function findBackground(id: string): GreenScreenBackground | undefined {
  return GREEN_SCREEN_BACKGROUNDS.find((b) => b.id === id);
}

export const GREEN_SCREEN_MATTING_VERSION = process.env.GREEN_SCREEN_MATTING_VERSION || "rvm-v1";

function sourceStamp(sourceFilename: string): string {
  return sourceFilename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function matteForegroundFilename(sourceFilename: string): string {
  return `rvm/${GREEN_SCREEN_MATTING_VERSION}/${sourceStamp(sourceFilename)}/foreground.mkv`;
}

export function matteAlphaFilename(sourceFilename: string): string {
  return `rvm/${GREEN_SCREEN_MATTING_VERSION}/${sourceStamp(sourceFilename)}/alpha.mkv`;
}

export function matteMetadataFilename(sourceFilename: string): string {
  return `rvm/${GREEN_SCREEN_MATTING_VERSION}/${sourceStamp(sourceFilename)}/metadata.json`;
}

/**
 * MinIO object key (and, via a matching prefix, the BullMQ job id / Redis
 * dedup key — see greenScreenJobId in lib/queue.ts) for one (background,
 * edited reel) combination. The matting version is part of the path so
 * changing RVM model/settings avoids stale composites automatically.
 */
export function composedFilename(backgroundId: string, sourceFilename: string): string {
  return `composites/${GREEN_SCREEN_MATTING_VERSION}/${sourceStamp(sourceFilename)}/${backgroundId}.mp4`;
}

export function composedMetadataFilename(backgroundId: string, sourceFilename: string): string {
  return `composites/${GREEN_SCREEN_MATTING_VERSION}/${sourceStamp(sourceFilename)}/${backgroundId}.json`;
}

/** Public URL for one composited (background, edited reel) combination. */
export function composedOutputUrl(backgroundId: string, sourceFilename: string): string {
  return `/api/asset/videos/${encodeURIComponent(composedFilename(backgroundId, sourceFilename))}`;
}
