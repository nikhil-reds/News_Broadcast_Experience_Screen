"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNexmosphere } from "@/lib/use-nexmosphere";

/** Volume moved per detent of the Nexmosphere knob (5% per click). */
const VOLUME_STEP = 0.05;
const DEFAULT_VOLUME = 0.8;

const clampVolume = (v: number) => Math.min(1, Math.max(0, v));

interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface TranscriptData {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptSegment[];
  createdAt: string;
  sourceAudio: string;
}

interface AudioFileItem {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

export default function Screen4Page() {
  const [audioFiles, setAudioFiles] = useState<AudioFileItem[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string>("");
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);

  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  // Playback volume, driven by the physical rotary knob (and the slider below).
  // Playback volume, driven by the physical rotary knob (and the slider below).
  const [volume, setVolume] = useState<number>(DEFAULT_VOLUME);

  const [displayText, setDisplayText] = useState<string>("");
  const [fadeState, setFadeState] = useState<"in" | "out">("in");
  const lastTextRef = useRef<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const attemptedRef = useRef<Set<string>>(new Set());

  const filenameFromUrl = (url: string) => url.split("/").pop() || "";

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

  // ---- Data loading ---------------------------------------------------------
  const fetchAudioFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/save-audio");
      if (!res.ok) return [] as AudioFileItem[];
      const data = await res.json();
      const files: AudioFileItem[] = (data.audioFiles || []).filter(
        (a: AudioFileItem) => a.filename !== "master-audio-16k.wav"
      );
      setAudioFiles(files);
      return files;
    } catch {
      return [] as AudioFileItem[];
    }
  }, []);

  const fetchTranscript = useCallback(async () => {
    try {
      const res = await fetch("/api/transcript");
      if (!res.ok) return null;
      const data = await res.json();
      if (data.exists && data.transcript) {
        setTranscript(data.transcript);
        return data.transcript as TranscriptData;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  // ---- Transcription via Docker Whisper ------------------------------------
  const runTranscription = useCallback(
    async (url: string) => {
      const filename = filenameFromUrl(url);
      if (!filename) return;
      setIsTranscribing(true);
      setStatus("Transcribing with Whisper...");
      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setTranscript(data.transcript);
          setStatus("");
        } else {
          setStatus(`Error: ${data.error || "transcription failed"}`);
        }
      } catch (err: any) {
        setStatus(`Error: ${err.message}`);
      } finally {
        setIsTranscribing(false);
      }
    },
    []
  );

  // ---- Mount: always use the newest recording -----------------------------
  useEffect(() => {
    (async () => {
      const files = await fetchAudioFiles(); // newest first
      const existing = await fetchTranscript();
      if (files.length === 0) return;
      const newest = files[0].url;
      setSelectedUrl(newest);
      attemptedRef.current.add(newest);
      const cachedMatches = existing && existing.sourceAudio === newest && existing.segments?.length > 0;
      if (!cachedMatches) runTranscription(newest);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- When the user switches audio, transcribe if needed -------------------
  useEffect(() => {
    if (!selectedUrl) return;
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveSegmentId(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const matches = transcript && transcript.sourceAudio === selectedUrl;
    if (!matches && !attemptedRef.current.has(selectedUrl)) {
      attemptedRef.current.add(selectedUrl);
      runTranscription(selectedUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUrl]);

  // ---- Sync active segment with playback ------------------------------------
  useEffect(() => {
    if (!transcript?.segments?.length) return;
    const seg = transcript.segments.find(
      (s) => currentTime >= s.start && currentTime <= s.end
    );
    const id = seg ? seg.id : null;
    if (id !== activeSegmentId) setActiveSegmentId(id);
  }, [currentTime, transcript, activeSegmentId]);

  // ---- Manage animated text updates ---------------------------------------
  const segments = transcript?.segments || [];
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
        {isTranscribing ? (
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

