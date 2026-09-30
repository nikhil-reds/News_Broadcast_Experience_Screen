"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCurrentSession } from "@/lib/current-session";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";

const SUBTITLE_LANGUAGES = [
  { label: "English", code: "en" },
  { label: "German", code: "de" },
  { label: "Hindi", code: "hi" },
  { label: "French", code: "fr" },
  { label: "Spanish", code: "es" },
];
const SUBTITLE_POLL_MS = 3000;

function labelFromCode(code: string) {
  return SUBTITLE_LANGUAGES.find((language) => language.code === code)?.label ?? null;
}

function isSubtitleLabel(value: unknown): value is string {
  return typeof value === "string" && SUBTITLE_LANGUAGES.some((language) => language.label === value);
}

export function useSelectedSubtitleLanguage() {
  const [language, setLanguage] = useState("English");

  const applySubtitleCode = useCallback((code: string) => {
    const label = labelFromCode(code);
    if (label) setLanguage(label);
  }, []);

  useRealtimeSelection("subtitle-language", applySubtitleCode);

  useEffect(() => {
    let cancelled = false;
    const fetchSubtitleLanguage = async () => {
      const session = await fetchCurrentSession();
      if (!cancelled && isSubtitleLabel(session?.selectedSubtitleLanguage)) {
        setLanguage(session.selectedSubtitleLanguage);
      }
    };

    fetchSubtitleLanguage();
    const interval = window.setInterval(fetchSubtitleLanguage, SUBTITLE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return language;
}
