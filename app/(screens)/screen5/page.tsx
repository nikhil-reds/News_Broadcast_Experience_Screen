"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNexmosphere } from "@/lib/use-nexmosphere";

/**
 * Screen 05 — Audio Language Change.
 *
 * The Nexmosphere rotary knob walks the language ring; the screen swaps the
 * <audio> source to that language's matched voice take (English plays the
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
  speakerGender?: string;
  voiceMode?: string;
  fallback?: boolean;
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
/** How often to re-check whether a queued translated TTS take has landed. */
const POLL_MS = 3000;
const TRANSCRIPT_CENTER_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function TranscriptSkeleton() {
  return (
    <div
      className="space-y-8 animate-pulse"
      role="status"
      aria-label="Loading audio transcript"
    >
      <div className="h-16 sm:h-24 md:h-28 w-full rounded-2xl bg-slate-800/80" />
      <div className="h-16 sm:h-24 md:h-28 w-11/12 rounded-2xl bg-slate-800/65" />
      <div className="h-16 sm:h-24 md:h-28 w-9/12 rounded-2xl bg-slate-800/45" />
    </div>
  );
}

export default function Screen5Page() {
  const [selectedUrl, setSelectedUrl] = useState<string>("");
  const [languages, setLanguages] = useState<AudioLanguageEntry[]>(FALLBACK_LANGUAGES);

  // `index` follows the knob immediately; `committedIndex` lags by COMMIT_DELAY_MS
  // and is what actually drives audio loading.
  const [index, setIndex] = useState<number>(0);
  const [committedIndex, setCommittedIndex] = useState<number>(0);

  const [segments, setSegments] = useState<Record<string, TranscriptSegment[]>>({});
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [trackOffset, setTrackOffset] = useState<number>(0);
  const [status, setStatus] = useState<string>("");
  const [isPreparing, setIsPreparing] = useState<boolean>(false);
  const [isLoadingCatalogue, setIsLoadingCatalogue] = useState<boolean>(true);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Playback should survive a language change: remember whether it was running
  // when the source was swapped and resume once the new take can play.
  const resumeRef = useRef<boolean>(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  const active = languages[committedIndex] ?? languages[0];
  const activeUrl = active?.original ? selectedUrl : active?.url || "";

  // ---- Physical rotary knob -> language ring --------------------------------
  useNexmosphere({
    onRotate: (delta) => {
      setIndex((prev) => {
        const n = languages.length;
        return ((prev + delta) % n + n) % n;
      });
    },
  });

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
        if (files.length === 0) {
          setStatus("No recordings found yet.");
          return;
        }
        setSelectedUrl(files[0].url); // newest first
      } catch (err: unknown) {
        setStatus(
          `Error loading recordings: ${
            err instanceof Error ? err.message : "unknown error"
          }`
        );
      } finally {
        setIsLoadingCatalogue(false);
      }
    })();
  }, []);

  // A different broadcast means a different set of translated takes.
  useEffect(() => {
    if (!selectedUrl) return;
    const resetTimer = window.setTimeout(() => {
      setIndex(0);
      setCommittedIndex(0);
      setSegments({});
      setCurrentTime(0);
      setTrackOffset(0);
      fetchCatalogue(selectedUrl);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [selectedUrl, fetchCatalogue]);

  // ---- Make the committed language playable ---------------------------------
  // English is the original file and always ready. Any other language needs its
  // translation (Qwen) and its speech (Gemini TTS); ask for both, then poll
  // until the take shows up.
  useEffect(() => {
    if (!selectedUrl || !active || active.original) {
      const resetTimer = window.setTimeout(() => setIsPreparing(false), 0);
      return () => window.clearTimeout(resetTimer);
    }
    if (active.ready) {
      const readyTimer = window.setTimeout(() => {
        setIsPreparing(false);
        const voice =
          active.original
            ? "original English voice"
            : active.voiceMode === "cloned"
            ? "matched cloned voice"
            : active.speakerGender && active.speakerGender !== "unknown"
            ? `${active.speakerGender} fallback voice`
            : "default fallback voice";
        setStatus(`Playing the ${active.language} audio track · ${voice}`);
      }, 0);
      return () => window.clearTimeout(readyTimer);
    }

    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    (async () => {
      setIsPreparing(true);
      setStatus(`Preparing ${active.language} audio — matching original speaker voice…`);
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
      } catch (err: unknown) {
        if (cancelled) return;
        setStatus(`Error: ${err instanceof Error ? err.message : "unknown error"}`);
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
          const voice =
            entry.voiceMode === "cloned"
              ? "matched cloned voice"
              : entry.speakerGender && entry.speakerGender !== "unknown"
              ? `${entry.speakerGender} fallback voice`
              : "default fallback voice";
          setStatus(`${active.language} audio ready · ${voice}`);
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
    if (!selectedUrl || !active) {
      const resetLoading = window.setTimeout(() => setIsLoadingTranscript(false), 0);
      return () => window.clearTimeout(resetLoading);
    }
    if (segments[active.language]) {
      const resetLoading = window.setTimeout(() => setIsLoadingTranscript(false), 0);
      return () => window.clearTimeout(resetLoading);
    }

    let cancelled = false;
    (async () => {
      setIsLoadingTranscript(true);
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
      } finally {
        if (!cancelled) setIsLoadingTranscript(false);
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
    const resetTimer = window.setTimeout(() => {
      setCurrentTime(0);
      setDuration(0);
      setTrackOffset(0);
    }, 0);
    return () => window.clearTimeout(resetTimer);
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

  const activeLanguage = active?.language ?? "";
  const displaySegments = useMemo(
    () => (activeLanguage ? segments[activeLanguage] ?? [] : []),
    [activeLanguage, segments]
  );
  const activeSegmentIndex = useMemo(() => {
    if (!displaySegments.length) return -1;

    const exactIndex = displaySegments.findIndex(
      (s) => currentTime >= s.start && currentTime < s.end
    );
    if (exactIndex !== -1) return exactIndex;

    const nextIndex = displaySegments.findIndex((s) => currentTime < s.start);
    if (nextIndex === -1) return displaySegments.length - 1;
    return Math.max(0, nextIndex - 1);
  }, [currentTime, displaySegments]);

  // ---- Center-lock the active transcript line without using browser scroll ---
  useEffect(() => {
    if (activeSegmentIndex < 0) return;

    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const activeLine = lineRefs.current[activeSegmentIndex];
      if (!viewport || !activeLine) return;

      const viewportCenter = viewport.clientHeight / 2;
      const lineCenter = activeLine.offsetTop + activeLine.offsetHeight / 2;
      setTrackOffset(viewportCenter - lineCenter);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeSegmentIndex, displaySegments.length]);

  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
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
              {l.ready && !l.original && l.voiceMode && (
                <span className="text-[10px] uppercase tracking-wide text-amber-100/80">
                  {l.voiceMode === "cloned" ? "matched" : l.speakerGender || "fallback"}
                </span>
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

      <main className="relative flex-1 overflow-hidden px-6 py-14 sm:py-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-36 bg-gradient-to-b from-slate-950 via-slate-950/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-36 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent" />

        <div className="mx-auto flex h-full max-w-6xl items-center">
          {/* Transcript in the selected language. */}
          {isLoadingCatalogue || (Boolean(selectedUrl) && isLoadingTranscript) ? (
            <TranscriptSkeleton />
          ) : displaySegments.length > 0 ? (
            <div
              ref={viewportRef}
              className="relative h-[56vh] min-h-[380px] w-full overflow-hidden"
              aria-live="polite"
            >
              <div
                className="absolute left-0 top-0 w-full py-[34vh] transition-transform duration-700 will-change-transform"
                style={{
                  transform: `translateY(${trackOffset}px)`,
                  transitionTimingFunction: TRANSCRIPT_CENTER_EASING,
                }}
              >
              {displaySegments.map((seg, segmentIndex) => {
                const indexDistance = activeSegmentIndex < 0 ? 0 : segmentIndex - activeSegmentIndex;
                const absoluteDistance = Math.abs(indexDistance);
                const isActive = indexDistance === 0;
                const isPast = indexDistance < 0;
                const isVisible = indexDistance >= -3 && indexDistance <= 4;
                const opacity = isActive
                  ? 1
                  : !isVisible
                  ? 0
                  : isPast
                  ? Math.max(0.14, 0.45 - absoluteDistance * 0.12)
                  : Math.max(0.24, 0.68 - absoluteDistance * 0.1);
                const scale = isActive
                  ? 1
                  : isPast
                  ? Math.max(0.9, 0.98 - absoluteDistance * 0.025)
                  : Math.max(0.92, 0.99 - absoluteDistance * 0.02);

                return (
                  <p
                    key={seg.id}
                    ref={(node) => {
                      lineRefs.current[segmentIndex] = node;
                    }}
                    className={`mx-auto max-w-5xl text-center leading-[1.12] transition-all duration-700 [overflow-wrap:break-word] ${
                      isActive
                        ? "py-4 text-2xl font-extrabold text-white sm:text-3xl md:text-4xl"
                        : "py-2 text-xl font-semibold text-slate-400 sm:text-2xl md:text-3xl"
                    }`}
                    style={{
                      opacity,
                      transform: `translateY(${
                        isActive ? 0 : isPast ? -absoluteDistance * 8 : absoluteDistance * 10
                      }px) scale(${scale})`,
                      transitionTimingFunction: TRANSCRIPT_CENTER_EASING,
                    }}
                    aria-current={isActive ? "true" : undefined}
                  >
                    {seg.text}
                  </p>
                );
              })}
              </div>
            </div>
          ) : (
            <p className="text-center text-2xl text-slate-600 animate-pulse font-medium py-24">
              {isPreparing ? "Preparing translation..." : "No transcript segments available."}
            </p>
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
          loop
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onSeeked={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
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
            setCurrentTime(0);
          }}
        />
      </footer>
    </div>
  );
}
