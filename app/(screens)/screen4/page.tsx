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
  const [volume, setVolume] = useState<number>(DEFAULT_VOLUME);
  const [knobDirection, setKnobDirection] = useState<"up" | "down" | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const attemptedRef = useRef<Set<string>>(new Set());
  const knobFlashRef = useRef<NodeJS.Timeout | null>(null);

  const filenameFromUrl = (url: string) => url.split("/").pop() || "";

  // ---- Physical rotary knob -> volume ---------------------------------------
  // Clockwise detents come in positive, counter-clockwise negative, so one
  // clamped accumulation covers both directions. The functional update keeps
  // fast spins (several frames inside one render) from dropping detents.
  const { status: nexStatus, lastFrame: lastNexFrame } = useNexmosphere({
    onRotate: (delta) => {
      setVolume((prev) => clampVolume(prev + delta * VOLUME_STEP));
      setKnobDirection(delta > 0 ? "up" : "down");
      if (knobFlashRef.current) clearTimeout(knobFlashRef.current);
      knobFlashRef.current = setTimeout(() => setKnobDirection(null), 900);
    },
  });

  useEffect(() => {
    return () => {
      if (knobFlashRef.current) clearTimeout(knobFlashRef.current);
    };
  }, []);

  // The <audio> element is the source of truth for output level; re-apply on
  // every change and whenever the element gets a new source.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, selectedUrl]);

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
      setStatus("Transcribing with Docker Whisper (port 8000)…");
      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setTranscript(data.transcript);
          const words = (data.transcript?.text || "").trim();
          setStatus(
            words
              ? `Live transcript ready · ${data.sttEngine}`
              : "No speech detected in this audio."
          );
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
      // Reuse the cached transcript only if it already matches the newest audio.
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

  // ---- Auto-scroll the active line into view --------------------------------
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeSegmentId]);

  // Keep the React duration state in sync, accepting only finite values.
  const syncDuration = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
    } else if (el.duration === Infinity) {
      // Force the browser to compute a real duration for WAVs that report Infinity.
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

  const seekToSegment = (start: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = start;
    setCurrentTime(start);
    el.play().catch(() => {});
  };

  const formatTime = (secs: number) => {
    if (!isFinite(secs)) secs = 0;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const segments = transcript?.segments || [];
  const hasText = segments.some((s) => s.text.trim().length > 0);
  const isForSelected = transcript?.sourceAudio === selectedUrl;

  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Minimal top bar: source + whisper action */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono text-[10px] uppercase font-bold border border-emerald-500/30">
            Screen 04
          </span>
          <span className="text-sm text-slate-400">Live Whisper Transcription</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Rotary panel telemetry — confirms the knob is actually reaching this
              screen, and shows the raw frame when a mapping needs checking. */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                nexStatus?.connected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
              }`}
            />
            <div className="leading-tight">
              <p className="text-[11px] font-semibold text-slate-200">
                Knob {nexStatus?.connected ? "Live" : "Offline"}
              </p>
              <p className="text-[10px] font-mono text-slate-500">
                {lastNexFrame ? lastNexFrame.raw : "turn to set volume"}
              </p>
            </div>
          </div>

          <select
            value={selectedUrl}
            onChange={(e) => setSelectedUrl(e.target.value)}
            className="bg-slate-900 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 font-mono max-w-[260px]"
          >
            {audioFiles.length === 0 && <option value="">No audio files found</option>}
            {audioFiles.map((a) => (
              <option key={a.filename} value={a.url}>
                {a.filename}
              </option>
            ))}
          </select>

          <button
            onClick={() => selectedUrl && runTranscription(selectedUrl)}
            disabled={isTranscribing || !selectedUrl}
            className={`text-xs px-3.5 py-2 rounded-lg font-bold transition ${
              isTranscribing || !selectedUrl
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {isTranscribing ? "Transcribing…" : "↻ Transcribe"}
          </button>
        </div>
      </header>

      {/* Status line */}
      {status && (
        <div className="px-6 py-2 text-center text-xs font-mono text-slate-400 border-b border-slate-900">
          {isTranscribing && (
            <span className="inline-block w-2 h-2 mr-2 rounded-full bg-amber-400 animate-ping align-middle" />
          )}
          {status}
        </div>
      )}

      {/* Big transcript text */}
      <main className="flex-1 overflow-y-auto px-6 py-12">
        <div className="max-w-5xl mx-auto space-y-8">
          {isTranscribing ? (
            <p className="text-center text-2xl text-slate-500 animate-pulse py-24">
              Listening to the audio…
            </p>
          ) : hasText && isForSelected ? (
            segments.map((seg) => {
              const isActive = activeSegmentId === seg.id;
              return (
                <p
                  key={seg.id}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => seekToSegment(seg.start)}
                  className={`cursor-pointer font-bold leading-tight transition-all duration-300 ${
                    isActive
                      ? "text-white text-4xl sm:text-6xl scale-[1.01]"
                      : "text-slate-600 hover:text-slate-400 text-2xl sm:text-4xl"
                  }`}
                >
                  {seg.text}
                </p>
              );
            })
          ) : (
            <p className="text-center text-xl text-slate-500 py-24">
              {selectedUrl
                ? 'No transcript yet — press "Transcribe" to run Docker Whisper.'
                : "Record or add an audio file to begin."}
            </p>
          )}
        </div>
      </main>

      {/* Play / pause bar */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button
            onClick={togglePlay}
            disabled={!selectedUrl}
            className={`w-16 h-16 shrink-0 rounded-full flex items-center justify-center text-2xl transition shadow-lg ${
              selectedUrl
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950"
                : "bg-slate-800 text-slate-600 cursor-not-allowed"
            }`}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <div className="flex-1 space-y-1">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.01}
              value={currentTime}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setCurrentTime(v);
                if (audioRef.current) audioRef.current.currentTime = v;
              }}
              className="w-full accent-emerald-500 h-2 rounded-lg cursor-pointer appearance-none"
              style={{
                background: `linear-gradient(to right, #10b981 ${
                  duration ? (currentTime / duration) * 100 : 0
                }%, #1e293b ${duration ? (currentTime / duration) * 100 : 0}%)`,
              }}
            />
            <div className="flex justify-between text-xs font-mono text-slate-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Volume — the rotary knob writes here, the slider is the manual
              fallback when the panel is offline. */}
          <div
            className={`w-52 shrink-0 space-y-1 rounded-xl border px-3 py-2 transition-colors ${
              knobDirection
                ? "border-emerald-500/60 bg-emerald-500/10"
                : "border-slate-800 bg-slate-950/60"
            }`}
          >
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="text-base leading-none">
                  {volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
                </span>
                Volume
                {knobDirection && (
                  <span className="text-emerald-400 font-bold">
                    {knobDirection === "up" ? "↻ +" : "↺ −"}
                  </span>
                )}
              </span>
              <span className="text-slate-200 font-bold">{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(clampVolume(parseFloat(e.target.value)))}
              aria-label="Volume"
              className="w-full accent-emerald-500 h-2 rounded-lg cursor-pointer appearance-none"
              style={{
                background: `linear-gradient(to right, #10b981 ${volume * 100}%, #1e293b ${
                  volume * 100
                }%)`,
              }}
            />
          </div>
        </div>

        <audio
          ref={audioRef}
          src={selectedUrl || undefined}
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onLoadedMetadata={() => syncDuration()}
          // Some WAVs report duration = Infinity at loadedmetadata and only
          // resolve the real length later, so keep it in sync here too.
          onDurationChange={() => syncDuration()}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            // Snap the progress bar to the very end when playback completes.
            const d = audioRef.current?.duration;
            if (d && isFinite(d)) setCurrentTime(d);
          }}
        />
      </footer>
    </div>
  );
}
