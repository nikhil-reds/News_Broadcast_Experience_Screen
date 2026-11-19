"use client";

import { useEffect, useState } from "react";
import { fetchCurrentSession } from "@/lib/current-session";

export type SelectedAudio = { language: string; voiceId: string };

/** The same per-session language/voice selection used by Screens 5 and 7. */
export function useSelectedAudio(): SelectedAudio {
  const [selection, setSelection] = useState<SelectedAudio>({ language: "en", voiceId: "original" });
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const session = await fetchCurrentSession();
      if (!session) return;
      const response = await fetch(`/api/audio-language/selection?sessionId=${encodeURIComponent(session.id)}`);
      if (!response.ok) return;
      const state = (await response.json()).state;
      if (cancelled) return;
      const language = typeof state?.audioLanguage === "string" ? state.audioLanguage : "en";
      const voiceId = language === "en" ? "original" : typeof state?.voiceId === "string" ? state.voiceId : "indian-male-01";
      setSelection({ language, voiceId });
    };
    void refresh().catch(() => {});
    const timer = window.setInterval(() => void refresh().catch(() => {}), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  return selection;
}
