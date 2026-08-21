"use client";

import { useEffect, useState } from "react";

const POLL_MS = 3000;
const REQUEST_TIMEOUT_MS = 8000;

export type PublicationStatus = "current" | "preparing" | "failed" | "waiting-for-reel";

export interface ScreenPublicationState<TAssets = Record<string, unknown>> {
  /** True only until the first publication request finishes. */
  isLoading: boolean;
  status: PublicationStatus;
  generationId: string | null;
  seq: number | null;
  progress: { completed: number; total: number } | null;
  failureReason: string | null;
  /** The last known-good content — never a partially-ready one. Only meaningful when status is "current" or "preparing" (still shows the PREVIOUS current while a newer one preps) or "failed" (still shows the last-good one, if any). */
  assets: TAssets | null;
}

const IDLE_STATE: ScreenPublicationState<never> = {
  isLoading: true,
  status: "waiting-for-reel",
  generationId: null,
  seq: null,
  progress: null,
  failureReason: null,
  assets: null,
};

/**
 * The one hook every screen should use instead of hand-rolled "poll the
 * newest X" logic. Polls GET /api/screens/[screenId]/publication every 3s.
 * `assets` is only ever the fully-ready content for `status` — a "preparing"
 * or "failed" status still carries the PREVIOUS current asset (never a
 * partial one), so screens can keep rendering unconditionally and only need
 * to layer a small non-blocking status indicator on top.
 */
/** Pass `null` to disable polling entirely (e.g. a component that only sometimes needs generation-gating). */
export function useScreenPublication<TAssets = Record<string, unknown>>(
  screenId: number | null
): ScreenPublicationState<TAssets> {
  const [state, setState] = useState<ScreenPublicationState<TAssets>>(IDLE_STATE as ScreenPublicationState<TAssets>);

  useEffect(() => {
    if (screenId == null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`/api/screens/${screenId}/publication`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setState({ ...data, isLoading: false });
        } else if (!cancelled) {
          setState((previous) => ({ ...previous, isLoading: false }));
        }
      } catch {
        // Stop the initial skeleton even if the service is temporarily down;
        // future polls continue trying in the background.
        if (!cancelled) setState((previous) => ({ ...previous, isLoading: false }));
      } finally {
        clearTimeout(timeout);
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [screenId]);

  return state;
}
