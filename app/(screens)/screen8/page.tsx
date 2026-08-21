"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchCurrentSession, patchSession } from "@/lib/current-session";
import { composedOutputUrl } from "@/lib/green-screen";

interface TimedCue {
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

interface RecordingItem {
  filename: string;
  url: string;
}

const LANGUAGES = [
  { label: "English", flag: "🇬🇧" },
  { label: "German", flag: "🇩🇪" },
  { label: "Hindi", flag: "🇮🇳" },
  { label: "French", flag: "🇫🇷" },
  { label: "Spanish", flag: "🇪🇸" },
];

const REEL_POLL_MS = 5000;

export default function Screen8Page() {
  const [selectedUrl, setSelectedUrl] = useState<string>("");
  const [hasTranscript, setHasTranscript] = useState<boolean>(false);

  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [reelFilename, setReelFilename] = useState<string | null>(null);

  const [language, setLanguage] = useState<string>("English");
  const [cues, setCues] = useState<TimedCue[]>([]);
  const [isLoadingCues, setIsLoadingCues] = useState<boolean>(false);
  const [cuesError, setCuesError] = useState<string | null>(null);

  const [videoTime, setVideoTime] = useState<number>(0);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const attemptedRef = useRef<Set<string>>(new Set());

  const filenameFromUrl = (url: string) => url.split("/").pop() || "";

  // ---- Data loading: audio files ---------------------------------------------
  const fetchAudioFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/save-audio");
      if (!res.ok) return [] as AudioFileItem[];
      const data = await res.json();
      const files: AudioFileItem[] = (data.audioFiles || []).filter(
        (a: AudioFileItem) => a.filename !== "master-audio-16k.wav"
      );
      return files;
    } catch {
      return [] as AudioFileItem[];
    }
  }, []);

  // ---- Data loading: fixed green-screen composite from camera 1 ------------
  useEffect(() => {
    let cancelled = false;
    const fetchLatestReel = async () => {
      try {
        const res = await fetch("/api/save-recording?camera=1");
        if (!res.ok) return;
        const data = await res.json();
        const list: RecordingItem[] = data.recordings || [];
        if (list.length > 0 && !cancelled) {
          setReelUrl(composedOutputUrl("newsroom-blue", list[0].filename));
          setReelFilename(list[0].filename);
        }
      } catch {
        /* keep whatever reel is already on screen */
      }
    };
    fetchLatestReel();
    const interval = setInterval(fetchLatestReel, REEL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ---- Transcription via Docker Whisper ------------------------------------
  const runTranscription = useCallback(async (url: string) => {
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
        const words = (data.transcript?.text || "").trim();
        setHasTranscript(!!words);
        setStatus(words ? `Live transcript ready · ${data.sttEngine}` : "No speech detected in this audio.");
      } else {
        setStatus(`Error: ${data.error || "transcription failed"}`);
      }
    } catch (err: unknown) {
      setStatus(`Error: ${err instanceof Error ? err.message : "transcription failed"}`);
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const checkTranscriptExists = useCallback(async (url: string) => {
    try {
      const res = await fetch(`/api/transcript/english?sourceAudio=${encodeURIComponent(url)}`);
      if (!res.ok) return false;
      const data = await res.json();
      return !!(data.exists && data.transcript?.segments?.length > 0);
    } catch {
      return false;
    }
  }, []);

  // ---- Mount: always use the newest recording -----------------------------
  useEffect(() => {
    (async () => {
      const files = await fetchAudioFiles(); // newest first
      if (files.length === 0) return;
      const newest = files[0].url;
      setSelectedUrl(newest);
      attemptedRef.current.add(newest);
      const exists = await checkTranscriptExists(newest);
      setHasTranscript(exists);
      if (!exists) runTranscription(newest);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- When the user switches audio, transcribe if needed -------------------
  useEffect(() => {
    if (!selectedUrl) return;
    setCues([]);
    setVideoTime(0);
    (async () => {
      const exists = await checkTranscriptExists(selectedUrl);
      setHasTranscript(exists);
      if (!exists && !attemptedRef.current.has(selectedUrl)) {
        attemptedRef.current.add(selectedUrl);
        await runTranscription(selectedUrl);
      }
    })();
  }, [selectedUrl, checkTranscriptExists, runTranscription]);

  // Screen 5's English source is this selected original audio. Keep the
  // highlight reel muted and use the original track as the audible source.
  useEffect(() => {
    if (!selectedUrl || !audioRef.current) return;
    audioRef.current
      .play()
      .then(() => setSoundBlocked(false))
      .catch(() => setSoundBlocked(true));
  }, [selectedUrl]);

  // ---- Subtitle cues: composite footage uses the original camera timeline. --
  useEffect(() => {
    if (!selectedUrl || !reelFilename || !hasTranscript) return;
    let cancelled = false;
    (async () => {
      setIsLoadingCues(true);
      setCuesError(null);
      try {
        const res = await fetch(
          `/api/transcript/${language.toLowerCase()}?sourceAudio=${encodeURIComponent(selectedUrl)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && Array.isArray(data.transcript?.segments)) {
          setCues(data.transcript.segments);
        } else {
          setCues([]);
          setCuesError(data.error || "Failed to load subtitle cues");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setCues([]);
          setCuesError(err instanceof Error ? err.message : "Failed to load subtitle cues");
        }
      } finally {
        if (!cancelled) setIsLoadingCues(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUrl, reelFilename, hasTranscript, language]);

  // Persist the operator's subtitle-language pick onto the current session so
  // Screens 11/12's export burns in the same language chosen here.
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    fetchCurrentSession().then((session) => {
      sessionIdRef.current = session?.id ?? null;
    });
  }, []);
  useEffect(() => {
    if (sessionIdRef.current) {
      patchSession(sessionIdRef.current, { selectedSubtitleLanguage: language });
    }
  }, [language]);

  const activeCue = cues.find((c) => videoTime >= c.start && videoTime <= c.end) ?? null;

  const enableAudio = () => {
    audioRef.current
      ?.play()
      .then(() => setSoundBlocked(false))
      .catch(() => setSoundBlocked(true));
  };

  const isTranslating = isLoadingCues && language !== "English";

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Language selector buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-6 py-4 border-b border-slate-900">
        {LANGUAGES.map((l) => {
          const active = language === l.label;
          const loading = isTranslating && active;
          return (
            <button
              key={l.label}
              onClick={() => setLanguage(l.label)}
              disabled={isLoadingCues && !active}
              className={`text-sm px-4 py-2 rounded-full font-bold border transition flex items-center gap-2 ${
                active
                  ? "bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-950"
                  : "bg-slate-900 text-slate-300 border-slate-700 hover:border-indigo-500 hover:text-white"
              } ${isLoadingCues && !active ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <span>{l.flag}</span>
              {l.label}
              {loading && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
            </button>
          );
        })}
      </div>

      {/* Status line */}
      {(status || cuesError) && (
        <div className="px-6 py-2 text-center text-xs font-mono text-slate-400 border-b border-slate-900">
          {(isTranscribing || isLoadingCues) && (
            <span className="inline-block w-2 h-2 mr-2 rounded-full bg-amber-400 animate-ping align-middle" />
          )}
          {cuesError ? `Subtitle error: ${cuesError}` : status}
        </div>
      )}

      {/* Highlight reel with subtitle overlay */}
      <main className="min-h-0 flex-1 overflow-hidden">
        <div
          className="relative h-full w-full bg-black overflow-hidden"
          onClick={enableAudio}
        >
          {reelUrl ? (
            <video
              key={reelUrl}
              ref={videoRef}
              src={reelUrl}
              autoPlay
              loop
              muted
              controls
              playsInline
              onTimeUpdate={() => videoRef.current && setVideoTime(videoRef.current.currentTime)}
              onPlay={enableAudio}
              onPause={() => audioRef.current?.pause()}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm font-mono">
              No highlight reel yet — record all 3 cameras to generate one.
            </div>
          )}
          <audio ref={audioRef} src={selectedUrl || undefined} autoPlay loop />

          {soundBlocked && (
            <div className="absolute right-4 top-4 rounded-lg border border-slate-700 bg-slate-950/85 px-3 py-2 text-xs font-mono text-slate-200">
              🔊 Click video to enable original audio
            </div>
          )}

          {/* Subtitle band, burned-in style but live CSS overlay */}
          {activeCue && (
            <div className="absolute bottom-16 left-4 right-4 flex justify-center pointer-events-none">
              <p className="max-w-[90%] text-center text-white font-extrabold text-xl sm:text-2xl leading-snug px-4 py-2 rounded-lg bg-black/70 [text-shadow:0_2px_4px_rgba(0,0,0,0.8)]">
                {activeCue.text}
              </p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
