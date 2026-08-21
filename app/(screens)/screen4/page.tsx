"use client";

import React, { useState, useEffect, useRef } from "react";
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
  const [currentTime, setCurrentTime] = useState<number>(0);
  // Playback volume, driven by the physical rotary knob (and the slider below).
  const [volume, setVolume] = useState<number>(DEFAULT_VOLUME);

  const [displayText, setDisplayText] = useState<string>("");
  const [fadeState, setFadeState] = useState<"in" | "out">("in");
  const lastTextRef = useRef<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      setSegments([]);
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

    setSegments([]);
    fetchTranscript();
    const timer = setInterval(fetchTranscript, POLL_MS);
    return () => {
      cancelled = true;
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
    setIsPlaying(false);
    setCurrentTime(0);
    lastTextRef.current = "";
    setDisplayText("");
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [selectedUrl]);

  // ---- Manage animated text updates ---------------------------------------
  useEffect(() => {
    const activeSeg = segments.find(
      (s) => currentTime >= s.start && currentTime <= s.end
    );

    if (activeSeg) {
      if (activeSeg.text !== lastTextRef.current) {
        setFadeState("out");
        const t = setTimeout(() => {
          setDisplayText(activeSeg.text);
          setFadeState("in");
          lastTextRef.current = activeSeg.text;
        }, 150);
        return () => clearTimeout(t);
      }
    } else if (!lastTextRef.current && segments.length > 0) {
      // Show first segment immediately on load
      setDisplayText(segments[0].text);
      lastTextRef.current = segments[0].text;
    }
  }, [currentTime, segments]);

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
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans p-8 select-none cursor-pointer"
    >
      <div className="w-full max-w-5xl text-center">
        {!selectedUrl && isLoadingAudio ? (
          <TeleprompterSkeleton />
        ) : !selectedUrl ? (
          <WaitingForBroadcast />
        ) : !segments.length ? (
          <TeleprompterSkeleton />
        ) : displayText ? (
          <p
            className={`font-extrabold leading-tight tracking-tight transition-all duration-300 ease-out transform ${
              fadeState === "in"
                ? "opacity-100 scale-100 text-white text-5xl sm:text-7xl md:text-8xl"
                : "opacity-0 scale-95 text-slate-600 text-5xl sm:text-7xl md:text-8xl"
            }`}
          >
            {displayText}
          </p>
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
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
        }}
      />
    </div>
  );
}
