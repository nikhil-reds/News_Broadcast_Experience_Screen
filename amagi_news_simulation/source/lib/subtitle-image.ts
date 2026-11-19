/**
 * Rasterizes one subtitle cue to a transparent PNG.
 *
 * The local ffmpeg build has no libass/freetype, so neither the `subtitles`
 * nor `drawtext` filter is available to burn text in directly. sharp (which
 * bundles its own SVG renderer) draws the text instead, and the result is
 * composited onto video with ffmpeg's `overlay` filter — the same primitive
 * Screen 07's green-screen pipeline already uses.
 */
import sharp from "sharp";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Rough character-width heuristic — good enough for broadcast-style captions. */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface SubtitleImageOptions {
  /** Full frame width — the band is rendered at this width so it can overlay at x=0. */
  width: number;
  /** Band height, not the full frame height. */
  height: number;
  fontSize?: number;
  maxCharsPerLine?: number;
  maxLines?: number;
}

/** Renders one subtitle cue to a transparent PNG sized `width`x`height`, centered. */
export async function renderSubtitlePng(
  text: string,
  opts: SubtitleImageOptions
): Promise<Buffer> {
  const { width, height, fontSize = 42, maxCharsPerLine = 38, maxLines = 3 } = opts;
  const lines = wrapText(text.trim(), maxCharsPerLine).slice(0, maxLines);
  const lineHeight = fontSize * 1.25;
  const totalTextHeight = lines.length * lineHeight;
  const firstBaselineY = height / 2 - totalTextHeight / 2 + fontSize * 0.85;

  const textNodes = lines
    .map((line, i) => {
      const y = firstBaselineY + i * lineHeight;
      return (
        `<text x="50%" y="${y}" font-size="${fontSize}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-weight="700" fill="white" stroke="black" stroke-width="6" stroke-linejoin="round" ` +
        `paint-order="stroke fill" text-anchor="middle">${escapeXml(line)}</text>`
      );
    })
    .join("");

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${textNodes}</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
