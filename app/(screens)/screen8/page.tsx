"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

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
  const [audioFiles, setAudioFiles] = useState<AudioFileItem[]>([]);
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
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
      setAudioFiles(files);
      return files;
    } catch {
      return [] as AudioFileItem[];
    }
  }, []);

  // ---- Data loading: latest highlight reel (same source as Screens 06/09-12) -
  useEffect(() => {
    let cancelled = false;
    const fetchLatestReel = async () => {
      try {
        const res = await fetch("/api/save-recording?kind=highlight");
        if (!res.ok) return;
        const data = await res.json();
        const list: RecordingItem[] = data.recordings || [];
        if (list.length > 0 && !cancelled) {
          setReelUrl(list[0].url);
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

  // ---- Subtitle cues: that language's transcript re-timed onto the reel's --
  // own cut timeline (see lib/video-export.ts) — fetched whenever the audio,
  // reel, or language selection is ready.
  useEffect(() => {
    if (!selectedUrl || !reelFilename || !hasTranscript) return;
    let cancelled = false;
    (async () => {
      setIsLoadingCues(true);
      setCuesError(null);
      try {
        const res = await fetch(
          `/api/subtitle-cues?reelFilename=${encodeURIComponent(reelFilename)}` +
            `&sourceAudio=${encodeURIComponent(selectedUrl)}&language=${encodeURIComponent(language)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && Array.isArray(data.cues)) {
          setCues(data.cues);
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

  const activeCue = cues.find((c) => videoTime >= c.start && videoTime <= c.end) ?? null;

  // ---- Auto-scroll the active reference line into view -----------------------
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeCue]);

  const seekTo = (start: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = start;
    el.play().catch(() => {});
  };

  const isTranslating = isLoadingCues && language !== "English";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Minimal top bar: source + whisper action */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-mono text-[10px] uppercase font-bold border border-indigo-500/30">
            Screen 08
          </span>
          <span className="text-sm text-slate-400">Highlight Reel + Subtitle Preview</span>
        </div>

        <div className="flex items-center gap-2">
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
      <main className="flex-1 flex flex-col items-center gap-6 px-6 py-8 overflow-y-auto">
        <div className="relative w-full max-w-4xl aspect-video rounded-2xl bg-black border border-slate-800/80 overflow-hidden shadow-2xl">
          {reelUrl ? (
            <video
              key={reelUrl}
              ref={videoRef}
              src={reelUrl}
              autoPlay
              loop
              controls
              playsInline
              onTimeUpdate={() => videoRef.current && setVideoTime(videoRef.current.currentTime)}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm font-mono">
              No highlight reel yet — record all 3 cameras to generate one.
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

        {/* Reference list of every cue, in reel order — click to seek */}
        <div className="w-full max-w-4xl space-y-2">
          {isLoadingCues ? (
            <p className="text-center text-sm text-slate-500 animate-pulse py-6">
              {language === "English" ? "Loading subtitles…" : `Translating to ${language}…`}
            </p>
          ) : cues.length > 0 ? (
            cues.map((cue, i) => {
              const isActive = activeCue === cue;
              return (
                <p
                  key={i}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => seekTo(cue.start)}
                  className={`cursor-pointer text-sm rounded-lg px-3 py-2 transition ${
                    isActive
                      ? "bg-indigo-600/20 border border-indigo-500/40 text-white font-bold"
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  {cue.text}
                </p>
              );
            })
          ) : (
            <p className="text-center text-sm text-slate-600 py-6">
              {!reelFilename
                ? "Waiting on a highlight reel."
                : !hasTranscript
                  ? 'No transcript yet — press "Transcribe" above.'
                  : "No subtitle cues overlap this reel's cut."}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
