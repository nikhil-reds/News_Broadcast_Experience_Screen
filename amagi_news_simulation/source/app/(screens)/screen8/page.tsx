"use client";
import styles from "./subtitles.module.css";
import { useWorkflowDirty, useWorkflowReady } from "@/lib/workflow-ready";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchCurrentSession, patchSession } from "@/lib/current-session";
import { composedOutputUrl } from "@/lib/green-screen";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";
import { useSelectedBackground } from "@/lib/use-selected-background";
import { useSelectedBrightness } from "@/lib/use-selected-brightness";
import { abroSans } from "@/lib/abro-sans";

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
  { label: "English", code: "en", native: "English" },
  { label: "German", code: "de", native: "Deutsch" },
  { label: "Hindi", code: "hi", native: "हिन्दी" },
  { label: "French", code: "fr", native: "Français" },
  { label: "Spanish", code: "es", native: "Español" },
  { label: "Off", code: "off", native: "No subtitles" },
];

const REEL_POLL_MS = 5000;

export default function Screen8Page() {
  const [selectedUrl, setSelectedUrl] = useState<string>("");
  const [hasTranscript, setHasTranscript] = useState<boolean>(false);

  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [reelFilename, setReelFilename] = useState<string | null>(null);
  const backgroundId = useSelectedBackground();
  const brightness = useSelectedBrightness();

  const [air, setAir] = useState("English");
  const [preview, setPreview] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const selected = preview ?? air;
  useWorkflowDirty(selected !== air);
  const language = comparing ? air : selected;
  const gesture = useRef<{x:number; timer:number} | null>(null);
  const onRemoteSubtitle = useCallback((code: string) => {
    const item = LANGUAGES.find(entry => entry.code === code);
    if (item) setAir(item.label);
  }, []);
  const saveSubtitle = useRealtimeSelection("subtitle-language", onRemoteSubtitle);
  const [loadedLanguage, setLoadedLanguage] = useState("");
  const [cues, setCues] = useState<TimedCue[]>([]);
  const [isLoadingCues, setIsLoadingCues] = useState<boolean>(false);
  const [cuesError, setCuesError] = useState<string | null>(null);

  useWorkflowReady(Boolean(reelUrl) && !comparing && (selected === "Off" || (hasTranscript && loadedLanguage === selected && !isLoadingCues && !cuesError)));
  const [videoTime, setVideoTime] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
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

  // ---- Data loading: use Screen 7's composite of the edited highlight reel -
  useEffect(() => {
    let cancelled = false;
    const fetchLatestReel = async () => {
      try {
        const res = await fetch("/api/save-recording?kind=highlight");
        if (!res.ok) return;
        const data = await res.json();
        const list: RecordingItem[] = data.recordings || [];
        if (list.length > 0 && !cancelled) {
          setReelUrl(composedOutputUrl(backgroundId, list[0].filename));
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
  }, [backgroundId]);

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
    const resetTimer = window.setTimeout(() => {
      setCues([]);
      setVideoTime(0);
    }, 0);
    (async () => {
      const exists = await checkTranscriptExists(selectedUrl);
      setHasTranscript(exists);
      if (!exists && !attemptedRef.current.has(selectedUrl)) {
        attemptedRef.current.add(selectedUrl);
        await runTranscription(selectedUrl);
      }
    })();
    return () => window.clearTimeout(resetTimer);
  }, [selectedUrl, checkTranscriptExists, runTranscription]);

  // ---- Subtitle cues: map the base English transcript to edited reel time. --
  useEffect(() => {
    if (language === "Off" || !selectedUrl || !reelFilename || !hasTranscript) return;
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
          setLoadedLanguage(language);
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

  // Persist the operator's subtitle-language pick onto the current session so
  // Screens 11/12's export burns in the same language chosen here.
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    fetchCurrentSession().then((session) => {
      sessionIdRef.current = session?.id ?? null;
      if (LANGUAGES.some(item => item.label === session?.selectedSubtitleLanguage)) setAir(session!.selectedSubtitleLanguage);
    });
  }, []);
  useEffect(() => {
    function commit() {
      const item = LANGUAGES.find(entry => entry.label === selected);
      if (!item || !sessionIdRef.current) return;
      void patchSession(sessionIdRef.current, { selectedSubtitleLanguage: item.label });
      saveSubtitle(item.code);
      setPreview(null);
    }
    window.addEventListener("apply-screen-subtitles", commit);
    return () => window.removeEventListener("apply-screen-subtitles", commit);
  }, [selected, saveSubtitle]);

  const activeCue = language === "Off" || loadedLanguage !== language ? null : cues.find(cue => videoTime >= cue.start && videoTime < cue.end);
  function cycle(direction: number) {
    const index = LANGUAGES.findIndex(item => item.label === selected);
    setPreview(LANGUAGES[(index + direction + LANGUAGES.length) % LANGUAGES.length].label);
  }
  function endGesture() {
    window.clearTimeout(gesture.current?.timer);
    gesture.current = null;
    setComparing(false);
  }
  useEffect(() => () => window.clearTimeout(gesture.current?.timer), []);

  return (
    <div className={styles.stage}>
      <div className={styles.badge}><i aria-hidden="true" /><strong className={`${abroSans.className} font-normal`}>Subtitles</strong><span>{air === "Off" ? "Off air" : air + " on air"}</span></div>
      <div className={styles.preview} role="status"><i aria-hidden="true" />{comparing ? "On air now" : selected === "Off" ? "Previewing no subtitles" : "Previewing " + selected}</div>
      <nav className={styles.rail} aria-label="Subtitle language">
        {LANGUAGES.map(item => <button key={item.code} type="button" aria-pressed={selected === item.label} onClick={() => setPreview(item.label)}>
          <span>{air === item.label && <i aria-label="On air" />}{item.label}</span><small lang={item.code === "off" ? "en" : item.code}>{item.native}</small>
        </button>)}
      </nav>
      {language !== "Off" && (cuesError || isTranscribing || isLoadingCues || status.startsWith("Error")) &&
        <p className={styles.notice} role="status">{cuesError || (isLoadingCues ? "Preparing subtitles…" : isTranscribing ? "Preparing transcript…" : status)}</p>}
      {/* Highlight reel with subtitle overlay */}
      <main className={styles.picture} tabIndex={0} aria-label="Subtitle preview. Use arrow keys to switch languages and hold Space to compare."
        onPointerDown={event => { endGesture(); event.currentTarget.setPointerCapture(event.pointerId); gesture.current = {x:event.clientX,timer:window.setTimeout(() => setComparing(true),250)}; }}
        onPointerMove={event => { if (gesture.current && Math.abs(event.clientX - gesture.current.x) > 12) { window.clearTimeout(gesture.current.timer); setComparing(false); } }}
        onPointerUp={event => { const dx = gesture.current ? event.clientX - gesture.current.x : 0; endGesture(); if (Math.abs(dx) > 45) cycle(dx < 0 ? 1 : -1); }}
        onPointerCancel={endGesture} onLostPointerCapture={endGesture} onBlur={endGesture}
        onKeyDown={event => { if (event.key === " ") { event.preventDefault(); setComparing(true); } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); cycle(event.key === "ArrowLeft" ? -1 : 1); } }}
        onKeyUp={event => { if (event.key === " ") setComparing(false); }}>
        <div className="relative h-full w-full overflow-hidden bg-black">
          {reelUrl ? (
            <video
              key={reelUrl}
              ref={videoRef}
              src={reelUrl}
              autoPlay
              loop
              muted
              playsInline
              onTimeUpdate={() => videoRef.current && setVideoTime(videoRef.current.currentTime)}
              className="w-full h-full object-cover"
              style={{ filter: `brightness(${brightness}%)` }}
            />
          ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm">
              No highlight reel yet — record all 3 cameras to generate one.
            </div>
          )}
          {/* Subtitle band, burned-in style but live CSS overlay */}
          {activeCue && (
            <div className={styles.caption}>
              <span>{activeCue.text}</span>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
