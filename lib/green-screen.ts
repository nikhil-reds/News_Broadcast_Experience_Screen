/**
 * Screen 07 — live green-screen background swap.
 *
 * Client-safe: the list of selectable backgrounds and the URL convention for
 * composited output. No node:* imports here on purpose — this module is
 * imported directly by the Screen 07 client component. Filesystem path
 * helpers (server/worker only) live in lib/green-screen-paths.ts.
 *
 * Output is cached per background id (`public/generated/green-screen/<id>.mp4`)
 * since the source footage never changes — the first click for a given
 * background pays for the ffmpeg pass, every click after that (including a
 * second visit) is served instantly from disk.
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

/** The one green-screen take Screen 07 composites against. */
export const GREEN_SCREEN_SOURCE_VIDEO =
  "vecteezy_young-businesswoman-thinking-while-working-on-the-computer_31759070.mp4";

/** Public URL of the original, uncomposited green-screen take. */
export const GREEN_SCREEN_SOURCE_URL = `/${GREEN_SCREEN_SOURCE_VIDEO}`;

export function composedOutputUrl(backgroundId: string): string {
  return `/generated/green-screen/${backgroundId}.mp4`;
}
