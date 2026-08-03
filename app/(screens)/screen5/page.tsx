"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNexmosphere } from "@/lib/use-nexmosphere";

/**
 * Screen 05 — Audio Language Change.
 *
 * The Nexmosphere rotary knob walks the language ring; the screen swaps the
 * <audio> source to that language's Gemini TTS take (English plays the
 * original recording). Turning the knob only moves the highlight — the source
 * switch is committed once the knob settles, so spinning past three languages
 * reloads the player once rather than three times.
 */

interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface AudioFileItem {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

interface AudioLanguageEntry {
  language: string;
  langCode: string;
  url: string | null;
  ready: boolean;
  translated: boolean;
  original: boolean;
}

const FLAGS: Record<string, string> = {
  English: "🇬🇧",
  German: "🇩🇪",
  Hindi: "🇮🇳",
  French: "🇫🇷",
  Spanish: "🇪🇸",
};

/** Order of the ring the knob turns through. Matches AUDIO_LANGUAGES server-side. */
const FALLBACK_LANGUAGES: AudioLanguageEntry[] = [
  "English",
  "German",
  "Hindi",
  "French",
  "Spanish",
].map((language) => ({
  language,
  langCode: "",
  url: null,
  ready: language === "English",
  translated: language === "English",
  original: language === "English",
}));

/** Knob settling time before the audio source is actually swapped. */
const COMMIT_DELAY_MS = 400;
/** How often to re-check whether a queued Gemini TTS take has landed. */
const POLL_MS = 3000;

export default function Screen5Page() {
  const [audioFiles, setAudioFiles] = useState<AudioFileItem[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string>("");
  const [languages, setLanguages] = useState<AudioLanguageEntry[]>(FALLBACK_LANGUAGES);

  // `index` follows the knob immediately; `committedIndex` lags by COMMIT_DELAY_MS
  // and is what actually drives audio loading.
  const [index, setIndex] = useState<number>(0);
  const [committedIndex, setCommittedIndex] = useState<number>(0);
  const [knobDirection, setKnobDirection] = useState<"cw" | "ccw" | null>(null);

  const [segments, setSegments] = useState<Record<string, TranscriptSegment[]>>({});
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [status, setStatus] = useState<string>("");
  const [isPreparing, setIsPreparing] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Playback should survive a language change: remember whether it was running
  // when the source was swapped and resume once the new take can play.
  const resumeRef = useRef<boolean>(false);
  const knobFlashRef = useRef<NodeJS.Timeout | null>(null);

  const active = languages[committedIndex] ?? languages[0];
  const highlighted = languages[index] ?? languages[0];
  const activeUrl = active?.original ? selectedUrl : active?.url || "";

  // ---- Physical rotary knob -> language ring --------------------------------
  const { status: nexStatus, lastFrame: lastNexFrame } = useNexmosphere({
    onRotate: (delta) => {
      setIndex((prev) => {
        const n = languages.length;
        return ((prev + delta) % n + n) % n;
      });
      setKnobDirection(delta > 0 ? "cw" : "ccw");
      if (knobFlashRef.current) clearTimeout(knobFlashRef.current);
      knobFlashRef.current = setTimeout(() => setKnobDirection(null), 900);
    },
  });

  useEffect(() => {
    return () => {
      if (knobFlashRef.current) clearTimeout(knobFlashRef.current);
    };
  }, []);

  // Commit the knob position once it stops moving.
  useEffect(() => {
    if (index === committedIndex) return;
    const t = setTimeout(() => setCommittedIndex(index), COMMIT_DELAY_MS);
    return () => clearTimeout(t);
  }, [index, committedIndex]);

  // ---- Data loading ---------------------------------------------------------
  const fetchCatalogue = useCallback(async (sourceAudio: string) => {
    try {
      const res = await fetch(
        `/api/audio-language?sourceAudio=${encodeURIComponent(sourceAudio)}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data.languages) && data.languages.length) {
        setLanguages(data.languages as AudioLanguageEntry[]);
        return data.languages as AudioLanguageEntry[];
      }
    } catch {
      /* keep whatever the ring already shows */
    }
    return null;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/save-audio");
        if (!res.ok) return;
        const data = await res.json();
        const files: AudioFileItem[] = (data.audioFiles || []).filter(
          (a: AudioFileItem) => a.filename !== "master-audio-16k.wav"
        );
        setAudioFiles(files);
        if (files.length === 0) {
          setStatus("No recordings found yet.");
          return;
        }
        setSelectedUrl(files[0].url); // newest first
      } catch (err: any) {
        setStatus(`Error loading recordings: ${err.message}`);
      }
    })();
  }, []);

  // A different broadcast means a different set of translated takes.
  useEffect(() => {
    if (!selectedUrl) return;
    setIndex(0);
    setCommittedIndex(0);
    setSegments({});
    setCurrentTime(0);
    fetchCatalogue(selectedUrl);
  }, [selectedUrl, fetchCatalogue]);

  // ---- Make the committed language playable ---------------------------------
  // English is the original file and always ready. Any other language needs its
  // translation (Qwen) and its speech (Gemini TTS); ask for both, then poll
  // until the take shows up.
  useEffect(() => {
    if (!selectedUrl || !active || active.original) {
      setIsPreparing(false);
      return;
    }
    if (active.ready) {
      setIsPreparing(false);
      setStatus(`Playing the ${active.language} audio track`);
      return;
    }

    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    (async () => {
      setIsPreparing(true);
      setStatus(`Preparing ${active.language} audio — translating and synthesizing…`);
      try {
        const res = await fetch("/api/audio-language", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceAudio: selectedUrl, language: active.language }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus(`Error: ${data.error || `could not prepare ${active.language} audio`}`);
          setIsPreparing(false);
          return;
        }
        if (Array.isArray(data.languages)) setLanguages(data.languages as AudioLanguageEntry[]);
      } catch (err: any) {
        if (cancelled) return;
        setStatus(`Error: ${err.message}`);
        setIsPreparing(false);
        return;
      }

      const poll = async () => {
        if (cancelled) return;
        const list = await fetchCatalogue(selectedUrl);
        const entry = list?.find((l) => l.language === active.language);
        if (cancelled) return;
        if (entry?.ready) {
          setIsPreparing(false);
          setStatus(`${active.language} audio ready`);
          return;
        }
        timer = setTimeout(poll, POLL_MS);
      };
      timer = setTimeout(poll, POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUrl, active?.language, active?.ready, active?.original, fetchCatalogue]);

  // ---- Transcript text for the committed language ---------------------------
  useEffect(() => {
    if (!selectedUrl || !active) return;
    if (segments[active.language]) return;

    let cancelled = false;
    (async () => {
      const path = active.original ? "english" : active.language.toLowerCase();
      try {
        const res = await fetch(
          `/api/transcript/${path}?sourceAudio=${encodeURIComponent(selectedUrl)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.exists && data.transcript?.segments) {
          setSegments((prev) => ({ ...prev, [active.language]: data.transcript.segments }));
        }
      } catch {
        /* the language card still works without the text */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedUrl, active, segments]);

  // ---- Playback -------------------------------------------------------------
  // Remember playback state across a source swap, then resume on the new take.
  useEffect(() => {
    resumeRef.current = isPlaying;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedIndex]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
  }, [activeUrl]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el || !activeUrl) return;
    if (isPlaying) {
      // A manual pause must not be undone by the next source swap.
      resumeRef.current = false;
      el.pause();
    } else {
      resumeRef.current = true;
      el.play().catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    if (!isFinite(secs)) secs = 0;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const syncDuration = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
  };

  const displaySegments = active ? segments[active.language] || [] : [];
  const activeSegmentId = active?.original
    ? displaySegments.find((s) => currentTime >= s.start && currentTime <= s.end)?.id ?? null
    : null;

  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-mono text-[10px] uppercase font-bold border border-amber-500/30">
            Screen 05
          </span>
          <span className="text-sm text-slate-400">Audio Language — Rotary Control</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Rotary panel telemetry — confirms the knob is reaching this screen. */}
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
                {lastNexFrame ? lastNexFrame.raw : "turn to change language"}
              </p>
            </div>
          </div>

          <select
            value={selectedUrl}
            onChange={(e) => setSelectedUrl(e.target.value)}
            className="bg-slate-900 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-amber-500 font-mono max-w-[260px]"
          >
            {audioFiles.length === 0 && <option value="">No audio files found</option>}
            {audioFiles.map((a) => (
              <option key={a.filename} value={a.url}>
                {a.filename}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Language ring — the knob moves the highlight, clicking works too. */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-6 py-4 border-b border-slate-900">
        {languages.map((l, i) => {
          const isHighlighted = i === index;
          const isActive = i === committedIndex;
          return (
            <button
              key={l.language}
              onClick={() => setIndex(i)}
              className={`text-sm px-4 py-2 rounded-full font-bold border transition flex items-center gap-2 ${
                isActive
                  ? "bg-amber-600 text-white border-amber-400 shadow-lg shadow-amber-950"
                  : isHighlighted
                  ? "bg-slate-800 text-white border-amber-500"
                  : "bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-500 hover:text-white"
              }`}
            >
              <span>{FLAGS[l.language] || "🌐"}</span>
              {l.language}
              {!l.ready && !l.original && (
                <span
                  className="w-2 h-2 rounded-full bg-slate-500"
                  title="Audio not synthesized yet"
                />
              )}
            </button>
          );
        })}
      </div>

      {status && (
        <div className="px-6 py-2 text-center text-xs font-mono text-slate-400 border-b border-slate-900">
          {isPreparing && (
            <span className="inline-block w-2 h-2 mr-2 rounded-full bg-amber-400 animate-ping align-middle" />
          )}
          {status}
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-6 py-12">
        <div className="max-w-4xl mx-auto space-y-10">
          {/* Selected language, shown large before and during playback. */}
          <div
            className={`rounded-3xl border px-8 py-10 text-center transition-colors ${
              knobDirection
                ? "border-amber-500/60 bg-amber-500/10"
                : "border-slate-800 bg-slate-900/40"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-mono">
              Audio Language
            </p>
            <p className="mt-4 text-7xl">{FLAGS[highlighted?.language] || "🌐"}</p>
            <p className="mt-3 text-5xl sm:text-6xl font-black text-white">
              {highlighted?.language}
            </p>
            <p className="mt-4 text-sm font-mono text-slate-400">
              {knobDirection
                ? knobDirection === "cw"
                  ? "↻ turning clockwise"
                  : "↺ turning counter-clockwise"
                : active?.original
                ? "Original recording"
                : isPreparing
                ? "Synthesizing this language…"
                : active?.ready
                ? "Gemini TTS translated take"
                : "Not available yet"}
            </p>
          </div>

          {/* Transcript in the selected language. Only the original recording's
              timings line up with playback, so highlighting is English-only. */}
          {displaySegments.length > 0 && (
            <div className="space-y-5">
              {displaySegments.map((seg) => (
                <p
                  key={seg.id}
                  className={`font-bold leading-tight transition-all duration-300 ${
                    activeSegmentId === seg.id
                      ? "text-white text-3xl sm:text-4xl"
                      : "text-slate-600 text-xl sm:text-2xl"
                  }`}
                >
                  {seg.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={togglePlay}
            disabled={!activeUrl}
            className={`w-16 h-16 shrink-0 rounded-full flex items-center justify-center text-2xl transition shadow-lg ${
              activeUrl
                ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950"
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
              disabled={!activeUrl}
              className="w-full accent-amber-500 h-2 rounded-lg cursor-pointer appearance-none"
              style={{
                background: `linear-gradient(to right, #f59e0b ${
                  duration ? (currentTime / duration) * 100 : 0
                }%, #1e293b ${duration ? (currentTime / duration) * 100 : 0}%)`,
              }}
            />
            <div className="flex justify-between text-xs font-mono text-slate-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        <audio
          ref={audioRef}
          src={activeUrl || undefined}
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onLoadedMetadata={syncDuration}
          onDurationChange={syncDuration}
          onCanPlay={() => {
            // Language switched mid-playback: pick the new take up from the top.
            if (resumeRef.current && audioRef.current?.paused) {
              audioRef.current.play().catch(() => {});
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            resumeRef.current = false;
          }}
        />
      </footer>
    </div>
  );
}
