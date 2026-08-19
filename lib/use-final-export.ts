"use client";

import { useEffect, useRef, useState } from "react";
import { fetchCurrentSession } from "@/lib/current-session";
import type { ExportAspect } from "@/lib/video-export";

const POLL_MS = 3000;
/** save-audio's placeholder file — same filter Screens 04/05/08 already apply. */
const IGNORED_AUDIO_FILENAME = "master-audio-16k.wav";

export type FinalExportStatus =
  | "waiting-for-reel"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface FinalExportState {
  videoUrl: string | null;
  status: FinalExportStatus;
  error: string | null;
}

interface RecordingItem {
  filename: string;
  url: string;
}

/**
 * Drives Screen 11/12's final export: resolves the current session's reel +
 * source audio + selected background/subtitle-language, POSTs
 * /api/video-export, and polls the resulting job until it's ready — kicking
 * off a fresh export automatically whenever the operator changes the
 * background (Screen 07) or subtitle language (Screen 08), since those
 * change what /api/video-export is even asked to render.
 */
export function useFinalExport(aspect: ExportAspect): FinalExportState {
  const [state, setState] = useState<FinalExportState>({
    videoUrl: null,
    status: "waiting-for-reel",
    error: null,
  });

  const lastRequestKey = useRef<string | null>(null);
  const activeJobId = useRef<string | null>(null);

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
      // Session exists but nothing uploaded under it yet (still processing) —
      // fall back to the unscoped newest, same pattern as RecordingLooper.
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

      const reel = await resolveNewest<RecordingItem>(
        "/api/save-recording?kind=highlight",
        sessionId,
        "recordings"
      );
      if (!reel) {
        if (!cancelled) setState({ videoUrl: null, status: "waiting-for-reel", error: null });
        timer = setTimeout(tick, POLL_MS);
        return;
      }

      const audioList = await resolveNewest<RecordingItem>("/api/save-audio", sessionId, "audioFiles");
      const audio = audioList && audioList.filename !== IGNORED_AUDIO_FILENAME ? audioList : null;
      if (!audio) {
        if (!cancelled) setState({ videoUrl: null, status: "waiting-for-reel", error: null });
        timer = setTimeout(tick, POLL_MS);
        return;
      }

      const requestKey = `${reel.filename}::${audio.url}::${language}::${backgroundId}::${aspect}`;

      if (requestKey !== lastRequestKey.current) {
        lastRequestKey.current = requestKey;
        activeJobId.current = null;
        try {
          const res = await fetch("/api/video-export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reelFilename: reel.filename,
              sourceAudio: audio.url,
              language,
              aspect,
              backgroundId,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to start export");
          activeJobId.current = data.videoJob.id;
          if (!cancelled) {
            setState({
              videoUrl: data.videoJob.status === "completed" ? data.videoJob.outputUrl : null,
              status: data.videoJob.status,
              error: null,
            });
          }
        } catch (err) {
          if (!cancelled) {
            setState({
              videoUrl: null,
              status: "failed",
              error: err instanceof Error ? err.message : "Failed to start export",
            });
          }
        }
      } else if (activeJobId.current) {
        try {
          const res = await fetch(`/api/video-export/${activeJobId.current}`);
          const data = await res.json();
          if (res.ok && data.videoJob && !cancelled) {
            setState({
              videoUrl: data.videoJob.status === "completed" ? data.videoJob.outputUrl : null,
              status: data.videoJob.status,
              error: data.videoJob.status === "failed" ? data.videoJob.errorMessage : null,
            });
          }
        } catch {
          /* keep last known state until the next tick */
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

  return state;
}
