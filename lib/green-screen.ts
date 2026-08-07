/**
 * Screen 07 — live green-screen background swap, composited against camera
 * 1's latest take (not a fixed stock clip — a new recording invalidates the
 * cache for every background, see `composedFilename`).
 *
 * Client-safe: the list of selectable backgrounds and the URL/filename
 * convention for composited output. No node:* imports here on purpose — this
 * module is imported directly by the Screen 07 client component, and must not
 * pull in the `minio` package (server-only). Filesystem path helpers for the
 * static background images (server/worker only) live in
 * lib/green-screen-paths.ts.
 *
 * Output is cached per (background id, source filename) in the MinIO
 * `videos` bucket — the same source recording composited against the same
 * background always resolves instantly from that cache; a *new* camera 1
 * take gets its own key and pays for one fresh ffmpeg pass per background.
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

/**
 * MinIO object key (and BullMQ job id, and Redis dedup key) for one
 * (background, source take) combination. Stripping the extension off
 * `sourceFilename` keeps this readable in worker logs; it doesn't need to be
 * reversible since callers always have both parts already.
 */
export function composedFilename(backgroundId: string, sourceFilename: string): string {
  const stamp = sourceFilename.replace(/\.[^.]+$/, "");
  return `greenscreen-${backgroundId}-${stamp}.mp4`;
}

/** Public URL for one composited (background, source take) combination. */
export function composedOutputUrl(backgroundId: string, sourceFilename: string): string {
  return `/api/asset/videos/${encodeURIComponent(composedFilename(backgroundId, sourceFilename))}`;
}
