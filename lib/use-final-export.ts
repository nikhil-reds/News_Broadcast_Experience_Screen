"use client";

import { useEffect, useRef } from "react";
import { fetchCurrentSession } from "@/lib/current-session";
import { useScreenPublication, type PublicationStatus } from "@/lib/use-screen-publication";
import type { ExportAspect } from "@/lib/video-export";

const POLL_MS = 3000;
/** save-audio's placeholder file — same filter Screens 04/05/08 already apply. */
const IGNORED_AUDIO_FILENAME = "master-audio-16k.wav";

export type FinalExportStatus = PublicationStatus;

export interface FinalExportState {
  /** Last known-good export URL — populated for "current", "preparing" (the previous one), and "failed" (ditto). Only null before anything has ever published. */
  videoUrl: string | null;
  status: FinalExportStatus;
  error: string | null;
  progress: { completed: number; total: number } | null;
}

interface RecordingItem {
  filename: string;
  url: string;
}

interface VideoExportAssets {
  outputUrl?: string;
}

/**
 * Drives Screen 11/12's final export. Two independent halves:
 *  - a POST to /api/video-export whenever the (reel, audio, language,
 *    background, aspect) combo changes, to kick off a new render. The server
 *    now owns generationId derivation, debouncing rapid background/language
 *    changes, and recording this as Screen 11/12's pending variant — this
 *    hook doesn't need to poll that job directly at all.
 *  - lib/use-screen-publication.ts, which is the ONLY source of what's
 *    actually displayed: the last successfully published export, never a
 *    partially-rendered one.
 */
export function useFinalExport(aspect: ExportAspect): FinalExportState {
  const screenId = aspect === "portrait" ? 11 : 12;
  const publication = useScreenPublication<VideoExportAssets>(screenId);
  const lastRequestKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const resolveNewest = async <T,>(
      path: string,
      sessionId: string | null,
      listKey: string
    ): Promise<T | null> => {
      const scoped = sessionId ? `${path}${path.includes("?") ? "&" : "?"}sessionId=${sessionId}` : path;
      const res = await fetch(scoped);
      const data = res.ok ? await res.json() : {};
      let list: T[] = data[listKey] || [];
      if (list.length === 0 && sessionId) {
        const fallbackRes = await fetch(path);
        const fallbackData = fallbackRes.ok ? await fallbackRes.json() : {};
        list = fallbackData[listKey] || [];
      }
      return list[0] ?? null;
    };

    const tick = async () => {
      if (cancelled) return;

      const session = await fetchCurrentSession();
      const sessionId = session?.id ?? null;
      const backgroundId = session?.selectedBackgroundId || "none";
      const language = session?.selectedSubtitleLanguage || "English";

      const reel = await resolveNewest<RecordingItem>("/api/save-recording?kind=highlight", sessionId, "recordings");
      const audioList = reel ? await resolveNewest<RecordingItem>("/api/save-audio", sessionId, "audioFiles") : null;
      const audio = audioList && audioList.filename !== IGNORED_AUDIO_FILENAME ? audioList : null;

      if (reel && audio) {
        const requestKey = `${reel.filename}::${audio.url}::${language}::${backgroundId}::${aspect}`;
        if (requestKey !== lastRequestKey.current) {
          lastRequestKey.current = requestKey;
          // Fire-and-forget: the response is just an ack, not the source of
          // truth for what's displayed — useScreenPublication above is.
          fetch("/api/video-export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reelFilename: reel.filename, sourceAudio: audio.url, language, aspect, backgroundId }),
          }).catch(() => {});
        }
      }

      timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [aspect]);

  return {
    videoUrl: publication.assets?.outputUrl ?? null,
    status: publication.status,
    error: publication.status === "failed" ? publication.failureReason : null,
    progress: publication.progress,
  };
}
