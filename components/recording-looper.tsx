"use client";

import React, { useEffect, useRef, useState } from "react";
import { recordingSourceQuery, type RecordingSource } from "@/lib/camera-recordings";
import { composedOutputUrl } from "@/lib/green-screen";
import { useScreenPublication } from "@/lib/use-screen-publication";

interface RecordingItem {
  filename: string;
  url: string;
}

interface AudioFileItem {
  filename: string;
  url: string;
}

interface TimedCue {
  start: number;
  end: number;
  text: string;
}

/**
 * Loop of the newest video from one source. Each screen pins its own:
 * Screen 01 and 02 take a camera each, Screen 06 takes the Gemini reel.
 *
 * `muted` defaults to true (Screens 01-03 are silent camera monitors). Screen
 * 06 passes `muted={false}` because the rendered highlight MP4 contains its
 * own synchronized audio track.
 *
 * `frame` defaults to full-bleed (fills the browser viewport). Screen 11
 * passes a mobile-sized box instead — a portrait phone preview centered on
 * the page rather than a full-screen kiosk display.
 *
 * `screenId`: when passed (Screen 06 only, for the highlight reel — Screens
 * 01-03 loop raw camera takes with no derived pipeline to gate on and don't
 * pass this), the newest-reel lookup below is replaced entirely by
 * lib/use-screen-publication.ts, so this component only ever shows a fully-
 * rendered reel for a generation whose highlight-analysis + highlight-reel
 * tasks have both completed — never a mid-render one.
 */
export default function RecordingLooper({
  source,
  muted = true,
  originalAudio = false,
  frame,
  screenId,
  containerClassName,
  englishSubtitles = false,
  compositeBackgroundId,
}: {
  source: RecordingSource;
  muted?: boolean;
  /** Use Screen 5's newest original recording instead of the video's audio track. */
  originalAudio?: boolean;
  frame?: { width: number; height: number };
  screenId?: number;
  /** Optional outer layout for embedding the player inside another screen grid. */
  containerClassName?: string;
  /** Show the English transcript, re-timed to the highlight reel's edit. */
  englishSubtitles?: boolean;
  /** Use a fixed green-screen composite instead of the raw recording. */
  compositeBackgroundId?: string;
}) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFilename, setVideoFilename] = useState<string | null>(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);
  const [cues, setCues] = useState<TimedCue[]>([]);
  const [videoTime, setVideoTime] = useState(0);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // The composite is rendered from the same edited highlight filename as the
  // source video; do not fall back to camera 01 when a background is enabled.
  const query = recordingSourceQuery(source);

  const publication = useScreenPublication<{ videoUrl: string; filename: string }>(screenId ?? null);
  useEffect(() => {
    if (screenId == null) return;
    if (publication.assets?.videoUrl) {
      const syncTimer = window.setTimeout(() => {
        setVideoUrl(publication.assets?.videoUrl ?? null);
        setVideoFilename(publication.assets?.filename ?? null);
      }, 0);
      return () => window.clearTimeout(syncTimer);
    }
  }, [screenId, publication.assets]);

  useEffect(() => {
    if (screenId != null) return; // generation-gated above instead
    let cancelled = false;

    const fetchLatestRecording = async () => {
      try {
        // Scope to the current BroadcastSession so this screen shows footage
        // from the same take Screens 4/5 are showing a transcript for,
        // instead of each screen independently taking "whatever's newest"
        // and risking a mismatch if a new take started recording in between.
        // Falls back to unscoped (old behavior) if there's no session yet —
        // e.g. recordings uploaded before this concept existed.
        let sessionId: string | null = null;
        try {
          const sessionRes = await fetch("/api/sessions/current");
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            sessionId = sessionData.session?.id ?? null;
          }
        } catch {
          /* fall through to unscoped lookup */
        }

        const params = sessionId ? `${query}&sessionId=${sessionId}` : query;
        const res = await fetch(`/api/save-recording?${params}`);
        if (res.ok) {
          const data = await res.json();
          let list: RecordingItem[] = data.recordings || [];
          // A brand-new session has no recordings yet (still uploading) —
          // fall back to the unscoped newest take rather than showing blank.
          if (list.length === 0 && sessionId) {
            const fallbackRes = await fetch(`/api/save-recording?${query}`);
            if (fallbackRes.ok) {
              const fallbackData = await fallbackRes.json();
              list = fallbackData.recordings || [];
            }
          }
          if (list.length > 0 && !cancelled) {
            setVideoUrl(
              compositeBackgroundId
                ? composedOutputUrl(compositeBackgroundId, list[0].filename)
                : list[0].url
            );
            setVideoFilename(list[0].filename);
          }
        }
      } catch (err) {
        console.error("Error fetching recording:", err);
      }
    };

    fetchLatestRecording();
    const interval = setInterval(fetchLatestRecording, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [compositeBackgroundId, query, screenId]);

  // Match Screen 5's English source: the latest saved original recording,
  // excluding the 16 kHz derivative made for transcription.
  useEffect(() => {
    if (!originalAudio && !englishSubtitles) return;
    let cancelled = false;

    const fetchOriginalAudio = async () => {
      try {
        const res = await fetch("/api/save-audio");
        if (!res.ok) return;
        const data = await res.json();
        const latest = (data.audioFiles as AudioFileItem[] | undefined)?.find(
          (file) => file.filename !== "master-audio-16k.wav"
        );
        if (!cancelled) setOriginalAudioUrl(latest?.url ?? null);
      } catch {
        /* retain the last successful source */
      }
    };

    fetchOriginalAudio();
    const interval = setInterval(fetchOriginalAudio, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [englishSubtitles, originalAudio]);

  // Screen 8's subtitle endpoint maps English transcript cues to the edited
  // reel timeline, so captions follow the video cuts instead of the source
  // recording's unedited timestamps.
  useEffect(() => {
    if (!englishSubtitles || !videoFilename || !originalAudioUrl) {
      const resetTimer = window.setTimeout(() => setCues([]), 0);
      return () => window.clearTimeout(resetTimer);
    }
    let cancelled = false;
    const fetchCues = async () => {
      try {
        const res = await fetch(
          compositeBackgroundId
            ? `/api/transcript/english?sourceAudio=${encodeURIComponent(originalAudioUrl)}`
            : `/api/subtitle-cues?reelFilename=${encodeURIComponent(videoFilename)}` +
              `&sourceAudio=${encodeURIComponent(originalAudioUrl)}&language=English`
        );
        const data = await res.json();
        const nextCues = compositeBackgroundId ? data.transcript?.segments : data.cues;
        if (!cancelled) setCues(res.ok && Array.isArray(nextCues) ? nextCues : []);
      } catch {
        if (!cancelled) setCues([]);
      }
    };
    fetchCues();
    return () => {
      cancelled = true;
    };
  }, [compositeBackgroundId, englishSubtitles, originalAudioUrl, videoFilename]);

  // Start the video first. Some composed/export previews still opt into a
  // separate original audio track; Screen 6 now uses embedded highlight audio.
  useEffect(() => {
    if (!videoUrl || !videoRef.current) return;
    videoRef.current.play().catch(() => {
      if (!muted) setSoundBlocked(true);
    });

    if (!originalAudio || !originalAudioUrl || !audioRef.current) return;
    audioRef.current
      .play()
      .then(() => setSoundBlocked(false))
      .catch(() => setSoundBlocked(true));
  }, [videoUrl, originalAudioUrl, muted, originalAudio]);

  const outerClass =
    containerClassName ??
    (frame ? "min-h-screen w-full flex items-center justify-center bg-slate-950" : "w-screen h-screen bg-black");

  if (!videoUrl) {
    return <div className={outerClass} />;
  }

  const retrySoundOnClick = () => {
    if (!soundBlocked) return;
    videoRef.current?.play().catch(() => {});
    if (originalAudio) {
      audioRef.current
        ?.play()
        .then(() => setSoundBlocked(false))
        .catch(() => {});
    } else {
      videoRef.current
        ?.play()
        .then(() => setSoundBlocked(false))
        .catch(() => {});
    }
  };

  const boxClass = frame
    ? "overflow-hidden m-0 p-0 relative rounded-3xl"
    : containerClassName
      ? "w-full h-full overflow-hidden m-0 p-0 relative"
      : "w-screen h-screen overflow-hidden m-0 p-0 relative";
  const boxStyle = frame ? { width: frame.width, height: frame.height } : undefined;
  const activeCue = cues.find((cue) => videoTime >= cue.start && videoTime <= cue.end) ?? null;

  return (
    <div className={outerClass}>
      <div className={`${boxClass} bg-black`} style={boxStyle} onClick={retrySoundOnClick}>
        <video
          key={videoUrl}
          ref={videoRef}
          src={videoUrl}
          loop
          muted={muted}
          playsInline
          onTimeUpdate={() => setVideoTime(videoRef.current?.currentTime ?? 0)}
          className="w-full h-full object-cover"
        />
        {originalAudio && <audio ref={audioRef} src={originalAudioUrl || undefined} autoPlay loop />}
        {activeCue && (
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex justify-center">
            <p className="max-w-[90%] rounded-lg bg-black/70 px-4 py-2 text-center text-xl font-extrabold leading-snug text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.8)]">
              {activeCue.text}
            </p>
          </div>
        )}
        {soundBlocked && (
          <div className="absolute bottom-6 right-6 px-3 py-2 rounded-lg bg-slate-950/85 border border-slate-700 text-xs font-mono text-slate-200">
            🔊 Click to enable original audio
          </div>
        )}
        {screenId != null && publication.status === "preparing" && (
          <div className="absolute bottom-6 left-6 px-3 py-2 rounded-lg bg-slate-950/85 border border-slate-700 text-xs font-mono text-slate-400">
            Preparing next reel…
            {publication.progress ? ` ${publication.progress.completed}/${publication.progress.total}` : ""}
          </div>
        )}
        {screenId != null && publication.status === "failed" && (
          <div className="absolute bottom-6 left-6 px-3 py-2 rounded-lg bg-red-950/85 border border-red-800 text-xs font-mono text-red-200">
            Next reel failed — showing last good one
          </div>
        )}
      </div>
    </div>
  );
}
