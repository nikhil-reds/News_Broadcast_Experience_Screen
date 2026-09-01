"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNexmosphere } from "@/lib/use-nexmosphere";

/** Volume moved per detent of the Nexmosphere knob (5% per click). */
const VOLUME_STEP = 0.05;
const DEFAULT_VOLUME = 0.8;

const clampVolume = (v: number) => Math.min(1, Math.max(0, v));

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface AudioFileItem {
  filename: string;
  url: string;
}

const POLL_MS = 3000;
const WORDS_PER_CHUNK = 11;
const MIN_READ_MS = 2300;
const MAX_READ_MS = 5200;
const WORD_READ_MS = 230;
const EXIT_ANIMATION_MS = 320;

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

function chunkText(text: string, wordsPerChunk = WORDS_PER_CHUNK) {
  const words = normalizeSpaces(text).split(" ").filter(Boolean);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }

  return chunks;
}

function getReadingDuration(text: string) {
  const wordCount = normalizeSpaces(text).split(" ").filter(Boolean).length;
  return Math.min(MAX_READ_MS, Math.max(MIN_READ_MS, wordCount * WORD_READ_MS));
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

  const [displayChunkIndex, setDisplayChunkIndex] = useState(0);
  const [textPhase, setTextPhase] = useState<"enter" | "exit">("enter");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const displayChunks = useMemo(
    () => segments.flatMap((segment) => chunkText(segment.text)),
    [segments]
  );
  const safeDisplayChunkIndex = displayChunks.length
    ? displayChunkIndex % displayChunks.length
    : 0;
  const displayText = displayChunks[safeDisplayChunkIndex] ?? "";

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
      setDisplayChunkIndex(0);
      setTextPhase("enter");
    }, 0);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    return () => window.clearTimeout(resetTimer);
  }, [selectedUrl]);

  // ---- Manage animated text updates ----------------------------------------
  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setDisplayChunkIndex(0);
      setTextPhase("enter");
    }, 0);

    if (!displayChunks.length) {
      return () => window.clearTimeout(resetTimer);
    }

    return () => {
      window.clearTimeout(resetTimer);
    };
  }, [displayChunks.length]);

  useEffect(() => {
    if (!displayChunks.length || !displayText) {
      return;
    }

    const readDuration = getReadingDuration(displayText);

    const readTimer = window.setTimeout(() => {
      setTextPhase("exit");
    }, readDuration);

    const nextTimer = window.setTimeout(() => {
      setDisplayChunkIndex((prev) => (prev + 1) % displayChunks.length);
      setTextPhase("enter");
    }, readDuration + EXIT_ANIMATION_MS);

    return () => {
      window.clearTimeout(readTimer);
      window.clearTimeout(nextTimer);
    };
  }, [displayChunkIndex, displayChunks.length, displayText]);

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
        ) : displayText ? (
          <div
            className="relative mx-auto flex min-h-[42vh] w-full items-center justify-center overflow-hidden px-2 sm:px-6"
            aria-live="polite"
          >
            <p
              key={displayChunkIndex}
              className={`max-w-5xl text-balance font-extrabold leading-[1.08] text-white [overflow-wrap:break-word] text-4xl sm:text-6xl md:text-7xl lg:text-8xl motion-reduce:transition-opacity motion-reduce:transform-none transition-all duration-500 ease-out ${
                textPhase === "enter"
                  ? "translate-y-0 scale-100 opacity-100 blur-0"
                  : "-translate-y-8 scale-[0.98] opacity-0 blur-sm"
              }`}
            >
              {displayText}
            </p>
          </div>
        ) : (
          <p className="text-2xl text-slate-600 animate-pulse font-medium">
            Listening...
          </p>
        )}
      </div>

      <audio
        ref={audioRef}
        src={selectedUrl || undefined}
        loop
        autoPlay
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
        }}
      />
    </div>
  );
}
