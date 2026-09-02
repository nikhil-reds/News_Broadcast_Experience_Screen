"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

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
const CHUNK_DISPLAY_SECONDS = 1;
const WORDS_PER_CHUNK = 10;
const CHUNK_TRANSITION_MS = 260;
const TRANSCRIPT_CHUNK_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const getSegmentStart = (segment: TranscriptSegment) =>
  segment.startTime ?? segment.start;

function createTeleprompterChunks(transcript: TranscriptSegment[]) {
  const chunks: TranscriptSegment[] = [];

  transcript.forEach((segment) => {
    const words = segment.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;

    if (words.length <= WORDS_PER_CHUNK) {
      chunks.push(segment);
      return;
    }

    for (let wordIndex = 0; wordIndex < words.length; wordIndex += WORDS_PER_CHUNK) {
      const chunkIndex = chunks.length;
      const text = words.slice(wordIndex, wordIndex + WORDS_PER_CHUNK).join(" ");
      chunks.push({
        start: chunkIndex * CHUNK_DISPLAY_SECONDS,
        end: (chunkIndex + 1) * CHUNK_DISPLAY_SECONDS,
        text,
      });
    }
  });

  return chunks;
}

function TeleprompterSkeleton() {
  return (
    <div
      className="w-full max-w-5xl space-y-7 animate-pulse"
      role="status"
      aria-label="Loading teleprompter text"
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
        The teleprompter will begin automatically when the script is ready.
      </p>
    </div>
  );
}

export default function Screen4Page() {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isLoadingScript, setIsLoadingScript] = useState(true);

  const [displayedIndex, setDisplayedIndex] = useState(-1);
  const [leavingSegment, setLeavingSegment] = useState<TranscriptSegment | null>(null);

  const chunkTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const displayedIndexRef = useRef(-1);
  const teleprompterChunks = useMemo(() => createTeleprompterChunks(segments), [segments]);

  // Use the latest recording only as the source key for its transcript.
  useEffect(() => {
    let cancelled = false;

    const fetchLatestScriptSource = async () => {
      try {
        const res = await fetch("/api/save-audio");
        if (!res.ok) return;
        const data = await res.json();
        const latest = (data.audioFiles as AudioFileItem[] | undefined)?.find(
          (file) => file.filename !== "master-audio-16k.wav"
        );
        if (!cancelled) {
          setSelectedUrl((currentUrl) => (currentUrl === latest?.url ? currentUrl : latest?.url ?? null));
        }
      } catch {
        // Keep the last successful script source while the next poll retries.
      } finally {
        if (!cancelled) setIsLoadingScript(false);
      }
    };

    fetchLatestScriptSource();
    const timer = setInterval(fetchLatestScriptSource, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // The transcription worker can finish after the source upload, so retry this
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
          setSegments((currentSegments) => {
            const nextSegments = data.transcript.segments as TranscriptSegment[];
            return JSON.stringify(currentSegments) === JSON.stringify(nextSegments)
              ? currentSegments
              : nextSegments;
          });
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

  const stopChunkTimer = useCallback(() => {
    if (chunkTimerRef.current !== null) {
      window.clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  // ---- When the newest source changes, reset the displayed script ------------
  useEffect(() => {
    if (!selectedUrl) return;
    stopChunkTimer();
    const resetTimer = window.setTimeout(() => {
      setDisplayedIndex(-1);
      setLeavingSegment(null);
      displayedIndexRef.current = -1;
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [selectedUrl, stopChunkTimer]);

  // ---- Rotate the script chunks automatically -------------------------------
  useEffect(() => {
    stopChunkTimer();

    if (!teleprompterChunks.length) {
      displayedIndexRef.current = -1;
      const emptyTimer = window.setTimeout(() => {
        setDisplayedIndex(-1);
        setLeavingSegment(null);
      }, 0);
      return () => window.clearTimeout(emptyTimer);
    }

    const resetTimer = window.setTimeout(() => {
      displayedIndexRef.current = 0;
      setDisplayedIndex(0);
      setLeavingSegment(null);

      chunkTimerRef.current = window.setInterval(() => {
        const currentIndex = displayedIndexRef.current < 0 ? 0 : displayedIndexRef.current;
        const nextIndex = (currentIndex + 1) % teleprompterChunks.length;
        setLeavingSegment(teleprompterChunks[currentIndex] ?? null);
        displayedIndexRef.current = nextIndex;
        setDisplayedIndex(nextIndex);

        if (transitionTimerRef.current !== null) {
          window.clearTimeout(transitionTimerRef.current);
        }
        transitionTimerRef.current = window.setTimeout(() => {
          setLeavingSegment(null);
          transitionTimerRef.current = null;
        }, CHUNK_TRANSITION_MS);
      }, CHUNK_DISPLAY_SECONDS * 1000);
    }, 0);

    return () => {
      window.clearTimeout(resetTimer);
      stopChunkTimer();
    };
  }, [stopChunkTimer, teleprompterChunks]);

  useEffect(() => () => stopChunkTimer(), [stopChunkTimer]);

  const displayedSegment = displayedIndex >= 0 ? teleprompterChunks[displayedIndex] : null;

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center overflow-hidden font-sans p-8 select-none"
    >
      <div className="relative w-full max-w-6xl text-center">
        <div className="pointer-events-none absolute inset-x-0 -top-40 h-52 bg-gradient-to-b from-cyan-500/10 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 -bottom-40 h-52 bg-gradient-to-t from-amber-400/10 to-transparent blur-3xl" />

        {!selectedUrl && isLoadingScript ? (
          <TeleprompterSkeleton />
        ) : !selectedUrl ? (
          <WaitingForBroadcast />
        ) : !teleprompterChunks.length ? (
          <TeleprompterSkeleton />
        ) : (
          <div
            className="relative mx-auto flex h-[68vh] min-h-[420px] w-full items-center justify-center overflow-hidden px-2 py-16 sm:px-6 sm:py-20"
            aria-live="polite"
          >
            {displayedSegment ? (
              <p
                key={`${getSegmentStart(displayedSegment)}-${displayedIndex}-in`}
                aria-current="true"
                className="screen4-chunk screen4-chunk-in mx-auto max-w-5xl text-center font-extrabold leading-[1.08] text-white [overflow-wrap:anywhere] motion-reduce:animate-none"
                style={{
                  animationTimingFunction: TRANSCRIPT_CHUNK_EASING,
                  fontSize: "clamp(2.25rem, 5.4vw, 5.75rem)",
                }}
              >
                {displayedSegment.text}
              </p>
            ) : null}
            {leavingSegment ? (
              <p
                key={`${getSegmentStart(leavingSegment)}-${displayedIndex}-out`}
                aria-hidden="true"
                className="screen4-chunk screen4-chunk-out mx-auto max-w-5xl text-center font-extrabold leading-[1.08] text-white [overflow-wrap:anywhere] motion-reduce:animate-none"
                style={{
                  animationTimingFunction: TRANSCRIPT_CHUNK_EASING,
                  fontSize: "clamp(2.25rem, 5.4vw, 5.75rem)",
                }}
              >
                {leavingSegment.text}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <style>{`
        @keyframes screen4ChunkIn {
          from {
            opacity: 0;
            transform: translateY(28px) scale(0.97);
            filter: blur(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes screen4ChunkOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
          to {
            opacity: 0;
            transform: translateY(-26px) scale(0.98);
            filter: blur(6px);
          }
        }

        .screen4-chunk-in {
          animation: screen4ChunkIn 420ms both;
        }

        .screen4-chunk {
          position: absolute;
          inset-inline: 0;
          padding-inline: 1.5rem;
        }

        .screen4-chunk-out {
          animation: screen4ChunkOut ${CHUNK_TRANSITION_MS}ms both;
        }
      `}</style>

    </div>
  );
}
