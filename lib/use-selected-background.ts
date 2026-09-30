"use client";

import { useCallback, useEffect, useState } from "react";
import { GREEN_SCREEN_BACKGROUNDS } from "@/lib/green-screen";
import { fetchCurrentSession } from "@/lib/current-session";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";

const DEFAULT_BACKGROUND_ID = "newsroom-blue";
const BACKGROUND_POLL_MS = 3000;

function isBackgroundId(value: unknown): value is string {
  return typeof value === "string" && GREEN_SCREEN_BACKGROUNDS.some((background) => background.id === value);
}

export function useSelectedBackground() {
  const [backgroundId, setBackgroundId] = useState(DEFAULT_BACKGROUND_ID);

  const applyBackground = useCallback((value: string) => {
    if (isBackgroundId(value)) setBackgroundId(value);
  }, []);

  useRealtimeSelection("background", applyBackground);

  useEffect(() => {
    let cancelled = false;
    const fetchBackground = async () => {
      const session = await fetchCurrentSession();
      if (!cancelled && isBackgroundId(session?.selectedBackgroundId)) {
        setBackgroundId(session.selectedBackgroundId);
      }
    };

    fetchBackground();
    const interval = window.setInterval(fetchBackground, BACKGROUND_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return backgroundId;
}
