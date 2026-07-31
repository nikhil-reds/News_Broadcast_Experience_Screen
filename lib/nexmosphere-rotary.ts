/**
 * Rotary-knob decoding for Nexmosphere X-talk frames.
 *
 * The controller pushes one ASCII frame per event (see lib/nexmosphere.ts).
 * A rotary element reports its movement in one of two ways, and which one you
 * get depends on the element wired to the port:
 *
 *   X002A[3]    command "A" → *relative* movement: signed detents since the
 *   X002A[-2]                 last frame. Positive = clockwise.
 *   X002B[42]   command "B"/"D" → *absolute* position. Direction is the
 *                             difference against the previous position.
 *
 * Both are handled below, so the knob works without knowing up front which
 * kind of element is on the port — the first absolute frame only establishes
 * the baseline (delta 0) and every frame after it moves the value.
 *
 * The dashboard's start/stop buttons sit on address 001 and share the "A"
 * command, so those two exact frames are never read as rotation. If the rotary
 * is on its own port, pin it down with NEXT_PUBLIC_NEXMOSPHERE_ROTARY_ADDRESS
 * (e.g. "002") and nothing else on the bus can move the knob value at all.
 */

export interface RotaryFrame {
  raw: string;
  address: string;
  command: string;
  value: string;
}

/** Frames the studio dashboard already owns — never rotation. See app/page.tsx. */
const RESERVED_BUTTON_FRAMES = new Set(["X001A[17]", "X001A[3]"]);

/** Optional: restrict rotation to one interface address, e.g. "002". */
export const ROTARY_ADDRESS = process.env.NEXT_PUBLIC_NEXMOSPHERE_ROTARY_ADDRESS?.trim() || null;

/** A single frame of movement, already reduced to signed detents. */
export interface RotaryReading {
  /** Signed detents: > 0 clockwise, < 0 counter-clockwise. */
  delta: number;
  /** Absolute position, when the element reports one. */
  position: number | null;
}

export interface RotaryDecoder {
  /** Returns the movement in this frame, or null when the frame isn't rotation. */
  read(frame: RotaryFrame): RotaryReading | null;
}

const SIGNED_INT = /^[+-]?\d+$/;

/**
 * One decoder per consumer (each screen keeps its own), because absolute-mode
 * decoding is stateful: it needs the previous position to derive a direction.
 */
export function createRotaryDecoder(address: string | null = ROTARY_ADDRESS): RotaryDecoder {
  let lastPosition: number | null = null;

  return {
    read(frame: RotaryFrame): RotaryReading | null {
      if (address && frame.address !== address) return null;
      if (RESERVED_BUTTON_FRAMES.has(frame.raw)) return null;

      const value = frame.value.trim();
      // A rotary with a push button also sends non-numeric frames on press.
      if (!SIGNED_INT.test(value)) return null;

      const n = Number(value);
      if (!Number.isFinite(n)) return null;

      if (frame.command === "A") {
        // Relative element: the payload *is* the movement.
        if (n === 0) return null;
        return { delta: n, position: null };
      }

      if (frame.command === "B" || frame.command === "D") {
        // Absolute element: the first frame only tells us where the knob sits.
        const previous = lastPosition;
        lastPosition = n;
        if (previous === null) return { delta: 0, position: n };
        return { delta: n - previous, position: n };
      }

      return null;
    },
  };
}
