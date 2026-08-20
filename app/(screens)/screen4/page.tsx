"use client";

import React, { useState, useEffect, useRef } from "react";
import { useNexmosphere } from "@/lib/use-nexmosphere";
import { useScreenPublication } from "@/lib/use-screen-publication";

/** Volume moved per detent of the Nexmosphere knob (5% per click). */
const VOLUME_STEP = 0.05;
const DEFAULT_VOLUME = 0.8;

const clampVolume = (v: number) => Math.min(1, Math.max(0, v));

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface Screen4Assets {
  audioUrl: string | null;
  text: string;
  segments: TranscriptSegment[];
}

export default function Screen4Page() {
  const publication = useScreenPublication<Screen4Assets>(4);
  const selectedUrl = publication.assets?.audioUrl ?? null;
  const segments = publication.assets?.segments ?? [];

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);

  // Playback volume, driven by the physical rotary knob (and the slider below).
  const [volume, setVolume] = useState<number>(DEFAULT_VOLUME);

  const [displayText, setDisplayText] = useState<string>("");
  const [fadeState, setFadeState] = useState<"in" | "out">("in");
  const lastTextRef = useRef<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ---- Physical rotary knob -> volume ---------------------------------------
  const { status: nexStatus } = useNexmosphere({
    onRotate: (delta) => {
      setVolume((prev) => clampVolume(prev + delta * VOLUME_STEP));
    },
  });

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

  // ---- When the generation-gated audio actually changes, reset playback -----
  useEffect(() => {
    if (!selectedUrl) return;
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveSegmentIndex(null);
    lastTextRef.current = "";
    setDisplayText("");
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [selectedUrl]);

  // ---- Sync active segment with playback ------------------------------------
  useEffect(() => {
    if (!segments.length) return;
    const idx = segments.findIndex((s) => currentTime >= s.start && currentTime <= s.end);
    if (idx !== activeSegmentIndex) setActiveSegmentIndex(idx);
  }, [currentTime, segments, activeSegmentIndex]);

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

  // Keep the React duration state in sync, accepting only finite values.
  const syncDuration = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
    } else if (el.duration === Infinity) {
      const onSeeked = () => {
        el.removeEventListener("seeked", onSeeked);
        if (isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
        el.currentTime = 0;
      };
      el.addEventListener("seeked", onSeeked);
      try {
        el.currentTime = 1e7;
      } catch {
        el.removeEventListener("seeked", onSeeked);
      }
    }
  };

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
      <div className="max-w-5xl text-center">
        {!selectedUrl && publication.status === "preparing" ? (
          <p className="text-2xl text-slate-500 animate-pulse font-medium">
            Transcribing audio...
          </p>
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
            {selectedUrl ? "Listening..." : "No audio recorded yet."}
          </p>
        )}
      </div>

      <audio
        ref={audioRef}
        src={selectedUrl || undefined}
        loop
        autoPlay
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={syncDuration}
        onDurationChange={syncDuration}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          const d = audioRef.current?.duration;
          if (d && isFinite(d)) setCurrentTime(d);
        }}
      />
    </div>
  );
}

