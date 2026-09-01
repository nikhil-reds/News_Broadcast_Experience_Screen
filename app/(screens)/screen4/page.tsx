"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNexmosphere } from "@/lib/use-nexmosphere";

/** Volume moved per detent of the Nexmosphere knob (5% per click). */
const VOLUME_STEP = 0.05;
const DEFAULT_VOLUME = 0.8;

const clampVolume = (v: number) => Math.min(1, Math.max(0, v));

interface TranscriptSegment {
  start: number;
  end: number;
  startTime?: number;
  endTime?: number;
  text: string;
}

interface AudioFileItem {
  filename: string;
  url: string;
}

const POLL_MS = 3000;
const TRANSCRIPT_CENTER_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const DEBUG_TRANSCRIPT_SYNC = process.env.NODE_ENV === "development";

const getSegmentStart = (segment: TranscriptSegment) =>
  segment.startTime ?? segment.start;

const getSegmentEnd = (segment: TranscriptSegment) =>
  segment.endTime ?? segment.end;

function findActiveTranscriptIndex(
  transcript: TranscriptSegment[],
  currentTime: number,
  previousIndex: number
) {
  const activeIndex = transcript.findIndex(
    (item) => currentTime >= getSegmentStart(item) && currentTime < getSegmentEnd(item)
  );
  if (activeIndex !== -1) return activeIndex;

  if (previousIndex >= 0) {
    const previous = transcript[previousIndex];
    const next = transcript[previousIndex + 1];
    if (
      previous &&
      currentTime >= getSegmentEnd(previous) &&
      (!next || currentTime < getSegmentStart(next))
    ) {
      return previousIndex;
    }
  }

  const nextIndex = transcript.findIndex((item) => currentTime < getSegmentStart(item));
  if (nextIndex === 0) return -1;
  if (nextIndex === -1) return transcript.length ? transcript.length - 1 : -1;
  return Math.max(0, nextIndex - 1);
}

function TeleprompterSkeleton() {
  return (
    <div
      className="w-full max-w-5xl space-y-7 animate-pulse"
      role="status"
      aria-label="Loading teleprompter audio"
    >
      <div className="h-7 w-32 mx-auto rounded-full bg-slate-800/90" />
      <div className="h-16 sm:h-24 md:h-28 w-full rounded-2xl bg-slate-800/80" />
      <div className="h-16 sm:h-24 md:h-28 w-11/12 mx-auto rounded-2xl bg-slate-800/65" />
      <div className="h-16 sm:h-24 md:h-28 w-8/12 mx-auto rounded-2xl bg-slate-800/45" />
    </div>
  );
}

function WaitingForBroadcast() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center justify-center gap-2 text-slate-400">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <p className="text-xl font-medium">Waiting for the next broadcast</p>
      </div>
      <p className="text-sm text-slate-600">
        The teleprompter will begin automatically when the audio is ready.
      </p>
    </div>
  );
}

export default function Screen4Page() {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isLoadingAudio, setIsLoadingAudio] = useState(true);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  // Playback volume, driven by the physical rotary knob (and the slider below).
  const [volume, setVolume] = useState<number>(DEFAULT_VOLUME);

  const [activeIndex, setActiveIndex] = useState(-1);
  const [trackOffset, setTrackOffset] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const activeIndexRef = useRef(-1);

  // ---- Physical rotary knob -> volume ---------------------------------------
  useNexmosphere({
    onRotate: (delta) => {
      setVolume((prev) => clampVolume(prev + delta * VOLUME_STEP));
    },
  });

  // Use the same newest original-audio source as Screen 5 rather than waiting
  // for a separately published generation to become current.
  useEffect(() => {
    let cancelled = false;

    const fetchLatestAudio = async () => {
      try {
        const res = await fetch("/api/save-audio");
        if (!res.ok) return;
        const data = await res.json();
        const latest = (data.audioFiles as AudioFileItem[] | undefined)?.find(
          (file) => file.filename !== "master-audio-16k.wav"
        );
        if (!cancelled) setSelectedUrl(latest?.url ?? null);
      } catch {
        // Keep the last successful audio while the next poll retries.
      } finally {
        if (!cancelled) setIsLoadingAudio(false);
      }
    };

    fetchLatestAudio();
    const timer = setInterval(fetchLatestAudio, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // The transcription worker can finish after the audio upload, so retry this
  // endpoint until the newest recording's English transcript is available.
  useEffect(() => {
    if (!selectedUrl) {
      return;
    }

    let cancelled = false;
    const fetchTranscript = async () => {
      try {
        const res = await fetch(
          `/api/transcript/english?sourceAudio=${encodeURIComponent(selectedUrl)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.exists && Array.isArray(data.transcript?.segments)) {
          setSegments(data.transcript.segments);
        }
      } catch {
        // The next poll will retry while transcription is in progress.
      }
    };

    const resetTimer = window.setTimeout(() => setSegments([]), 0);
    fetchTranscript();
    const timer = setInterval(fetchTranscript, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
      clearInterval(timer);
    };
  }, [selectedUrl]);

  // The <audio> element is the source of truth for volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, selectedUrl]);

  const syncTranscript = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !segments.length) return;

    const currentTime = audio.currentTime;
    const nextActiveIndex = findActiveTranscriptIndex(
      segments,
      currentTime,
      activeIndexRef.current
    );

    if (nextActiveIndex !== activeIndexRef.current) {
      activeIndexRef.current = nextActiveIndex;
      setActiveIndex(nextActiveIndex);

      if (DEBUG_TRANSCRIPT_SYNC && nextActiveIndex >= 0) {
        const activeSegment = segments[nextActiveIndex];
        console.log({
          audioTime: currentTime,
          activeIndex: nextActiveIndex,
          activeText: activeSegment.text,
          startTime: getSegmentStart(activeSegment),
          endTime: getSegmentEnd(activeSegment),
        });
      }
    }
  }, [segments]);

  const stopTranscriptFrame = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startTranscriptFrame = useCallback(() => {
    stopTranscriptFrame();

    const tick = () => {
      syncTranscript();
      if (!audioRef.current?.paused) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [stopTranscriptFrame, syncTranscript]);

  // Autoplay handler when audio changes
  useEffect(() => {
    if (audioRef.current && selectedUrl) {
      audioRef.current.play().catch((err) => console.log("Autoplay blocked:", err));
    }
  }, [selectedUrl]);

  // ---- When the newest audio changes, reset playback ------------------------
  useEffect(() => {
    if (!selectedUrl) return;
    const resetTimer = window.setTimeout(() => {
      setIsPlaying(false);
      setActiveIndex(-1);
      setTrackOffset(0);
      activeIndexRef.current = -1;
    }, 0);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    return () => window.clearTimeout(resetTimer);
  }, [selectedUrl]);

  // ---- Keep the active transcript line locked to the viewport center --------
  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      activeIndexRef.current = -1;
      setActiveIndex(-1);
      setTrackOffset(0);
      lineRefs.current = [];
      syncTranscript();
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [segments.length, syncTranscript]);

  useEffect(() => {
    if (activeIndex < 0) return;

    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const activeLine = lineRefs.current[activeIndex];
      if (!viewport || !activeLine) return;

      const viewportCenter = viewport.clientHeight / 2;
      const lineCenter = activeLine.offsetTop + activeLine.offsetHeight / 2;
      setTrackOffset(viewportCenter - lineCenter);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, segments.length]);

  useEffect(() => () => stopTranscriptFrame(), [stopTranscriptFrame]);

  // ---- Controls -------------------------------------------------------------
  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
  };

  return (
    <div
      onClick={togglePlay}
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center overflow-hidden font-sans p-8 select-none cursor-pointer"
    >
      <div className="relative w-full max-w-6xl text-center">
        <div className="pointer-events-none absolute inset-x-0 -top-40 h-52 bg-gradient-to-b from-cyan-500/10 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 -bottom-40 h-52 bg-gradient-to-t from-amber-400/10 to-transparent blur-3xl" />

        {!selectedUrl && isLoadingAudio ? (
          <TeleprompterSkeleton />
        ) : !selectedUrl ? (
          <WaitingForBroadcast />
        ) : !segments.length ? (
          <TeleprompterSkeleton />
        ) : (
          <div
            ref={viewportRef}
            className="relative mx-auto h-[68vh] min-h-[460px] w-full overflow-hidden px-2 py-20 sm:px-6 sm:py-24"
            aria-live="polite"
            style={{
              maskImage:
                "linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)",
            }}
          >
            <div
              className="absolute left-0 top-0 w-full py-[34vh] transition-transform duration-500 will-change-transform motion-reduce:transition-none"
              style={{
                transform: `translateY(${trackOffset}px)`,
                transitionTimingFunction: TRANSCRIPT_CENTER_EASING,
              }}
            >
              {segments.map((segment, segmentIndex) => {
                const indexDistance =
                  activeIndex < 0 ? segmentIndex : segmentIndex - activeIndex;
                const absoluteDistance = Math.abs(indexDistance);
                const isActive = indexDistance === 0;
                const isPast = indexDistance < 0;
                const isVisible = indexDistance >= -3 && indexDistance <= 4;
                const opacity = isActive
                  ? 1
                  : !isVisible
                  ? 0
                  : isPast
                  ? Math.max(0.12, 0.45 - absoluteDistance * 0.12)
                  : Math.max(0.22, 0.62 - absoluteDistance * 0.1);
                const scale = isActive
                  ? 1
                  : isPast
                  ? Math.max(0.9, 0.98 - absoluteDistance * 0.025)
                  : Math.max(0.92, 0.99 - absoluteDistance * 0.02);

                return (
                  <p
                    key={`${getSegmentStart(segment)}-${segmentIndex}`}
                    ref={(node) => {
                      lineRefs.current[segmentIndex] = node;
                    }}
                    aria-current={isActive ? "true" : undefined}
                    className={`mx-auto max-w-5xl text-center leading-[1.12] transition-all duration-500 [overflow-wrap:break-word] motion-reduce:transition-none ${
                      isActive
                        ? "py-5 text-4xl font-extrabold text-white sm:text-6xl md:text-7xl"
                        : "py-2 text-xl font-semibold text-slate-400 sm:text-2xl md:text-3xl"
                    }`}
                    style={{
                      opacity,
                      transform: `translateY(${
                        isActive ? 0 : isPast ? -absoluteDistance * 8 : absoluteDistance * 10
                      }px) scale(${scale})`,
                      transitionTimingFunction: TRANSCRIPT_CENTER_EASING,
                    }}
                  >
                    {segment.text}
                  </p>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={selectedUrl || undefined}
        loop
        autoPlay
        onTimeUpdate={syncTranscript}
        onSeeking={syncTranscript}
        onSeeked={syncTranscript}
        onLoadedMetadata={syncTranscript}
        onPlay={() => {
          setIsPlaying(true);
          syncTranscript();
          startTranscriptFrame();
        }}
        onPause={() => {
          setIsPlaying(false);
          syncTranscript();
          stopTranscriptFrame();
        }}
        onEnded={() => {
          activeIndexRef.current = -1;
          setActiveIndex(-1);
          setTrackOffset(0);
          syncTranscript();
        }}
      />
    </div>
  );
}
