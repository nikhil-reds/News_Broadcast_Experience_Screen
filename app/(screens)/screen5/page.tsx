"use client";
import { useWorkflowDirty, useWorkflowReady } from "@/lib/workflow-ready";
import { selectionFetch } from "@/lib/screen-selection-writes";
import { DEFAULT_VOICE_ID, isVoiceId, type VoiceId } from "@/lib/voice-profiles";
import { abroSans } from "@/lib/abro-sans";
import SoundToggle from "@/components/sound-toggle";
import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./screen5.module.css";
import { fetchCurrentSession } from "@/lib/current-session";

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
  voiceId?: VoiceId;
  status?: string;
  error?: string | null;
}

const FALLBACK_LANGUAGES: AudioLanguageEntry[] = [
  ["English", "en"],
  ["German", "de"],
  ["Hindi", "hi"],
  ["French", "fr"],
  ["Spanish", "es"],
].map(([language, langCode]) => ({
  language,
  langCode,
  url: null,
  ready: language === "English",
  translated: language === "English",
  original: language === "English",
}));

const COMMIT_DELAY_MS = 400;
const POLL_MS = 3000;
const WS_RECONNECT_MS = 2000;
function wrapIndex(index: number, length: number) { return ((index % length) + length) % length; }
export default function Screen5Page() {
  const [selectedUrl, setSelectedUrl] = useState("");
  const [languages, setLanguages] = useState<AudioLanguageEntry[]>(FALLBACK_LANGUAGES);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [programmePlaying, setProgrammePlaying] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const skipClick = useRef(false);
  const dragStart = useRef<{ x: number; index: number; step: number } | null>(null);
  const wheelDelta = useRef(0);
  const wheelReset = useRef<number | undefined>(undefined);
  const soundEnabledRef = useRef(true);
  const selectionDirtyRef = useRef(false);
  const [voiceId, setVoiceId] = useState<VoiceId>(DEFAULT_VOICE_ID);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Choose a language");
  const [retry, setRetry] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const versionRef = useRef(0);
  const changedRef = useRef(false);
  const [saved, setSaved] = useState({ langCode: "en", voiceId: DEFAULT_VOICE_ID as VoiceId });
  useWorkflowDirty(FALLBACK_LANGUAGES[highlightedIndex].langCode !== saved.langCode);
  const active = languages[activeIndex] ?? languages[0];
  const activeUrl = active?.original ? selectedUrl : active?.voiceId === voiceId ? active.url ?? "" : "";
  useWorkflowReady(Boolean(sessionId && activeUrl) && highlightedIndex === activeIndex && (active?.original || (active?.voiceId === voiceId && active?.ready)));

  const persist = useCallback(async (langCode: string, selectedVoice: VoiceId) => {
    if (!sessionId) return;
    try {
      const response = await selectionFetch("/api/audio-language/selection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, audioLanguage: langCode, voiceId: selectedVoice }),
      });
      if (!response.ok) throw new Error("Unable to save voice selection");
      const result = await response.json().catch(() => null) as { state?: { version?: number } } | null;
      if (typeof result?.state?.version === "number") {
        versionRef.current = Math.max(versionRef.current, result.state.version);
      }
      selectionDirtyRef.current = false;
      setSaved({ langCode, voiceId: selectedVoice });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save voice selection"); }
  }, [sessionId]);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let timer: number | undefined;
    const apply = (state: { audioLanguage?: string; voiceId?: unknown; version?: number } | null) => {
      if (disposed || !state || typeof state.version !== "number" || state.version < versionRef.current) return;
      // A reconnect may return the last saved language while the operator is
      // still tuning a new local choice. Keep that local choice until Apply.
      if (selectionDirtyRef.current) return;
      const index = FALLBACK_LANGUAGES.findIndex(l => l.langCode === state.audioLanguage);
      if (index < 0) return;
      versionRef.current = state.version;
      const selectedVoice = isVoiceId(state.voiceId) ? state.voiceId : DEFAULT_VOICE_ID;
      setSaved({ langCode: state.audioLanguage!, voiceId: selectedVoice });
      setVoiceId(selectedVoice);
      changedRef.current = false;
      setHighlightedIndex(index); setActiveIndex(index);
    };
    const connect = async () => {
      const session = await fetchCurrentSession();
      if (disposed || !session) return;
      setSessionId(session.id);
      const response = await selectionFetch(`/api/audio-language/selection?sessionId=${encodeURIComponent(session.id)}`);
      if (response.ok) {
        const saved = (await response.json()).state;
        if (saved) apply(saved);
        else {
          const index = FALLBACK_LANGUAGES.findIndex(l => l.language === session.selectedAudioLanguage);
          if (index >= 0 && !selectionDirtyRef.current) {
            setSaved({ langCode: FALLBACK_LANGUAGES[index].langCode, voiceId: DEFAULT_VOICE_ID });
            setHighlightedIndex(index); setActiveIndex(index);
          }
        }
      }
      if (disposed) return;
      const url = process.env.NEXT_PUBLIC_AUDIO_LANGUAGE_WS_URL ||
        `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;
      socket = new WebSocket(url);
      socket.onopen = () => socket?.send(JSON.stringify({ type: "audio-language:get", sessionId: session.id }));
      socket.onmessage = event => {
        try { const message = JSON.parse(String(event.data)); if (message.type?.startsWith("audio-language:")) apply(message.state); } catch {}
      };
      socket.onclose = () => { if (!disposed) timer = window.setTimeout(() => void connect().catch(() => {}), WS_RECONNECT_MS); };
    };
    void connect().catch(() => setError("Unable to connect to session selection"));
    return () => { disposed = true; window.clearTimeout(timer); socket?.close(); };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    void selectionFetch(`/api/save-audio?sessionId=${encodeURIComponent(sessionId)}`).then(r => r.json()).then(data => {
      const files: AudioFileItem[] = (data.audioFiles || []).filter((a: AudioFileItem) => a.filename !== "master-audio-16k.wav");
      if (!disposed && files.length) setSelectedUrl(files[0].url);
    }).catch(() => setError("Unable to load source recording"));
    return () => { disposed = true; };
  }, [sessionId]);

  const moveTo = useCallback((index: number) => {
    selectionDirtyRef.current = true;
    changedRef.current = true;
    const next = wrapIndex(index, FALLBACK_LANGUAGES.length);
    setHighlightedIndex(next);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches("button,select,input")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); moveTo(highlightedIndex + (event.key === "ArrowLeft" ? -1 : 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [highlightedIndex, moveTo]);
  useEffect(() => () => window.clearTimeout(wheelReset.current), []);
  useEffect(() => {
    if (!changedRef.current) return;
    const timer = window.setTimeout(() => {
      changedRef.current = false; setActiveIndex(highlightedIndex);

    }, COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [highlightedIndex]);
  useEffect(() => {
    const commit = () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.muted = true;
      }
      void persist(FALLBACK_LANGUAGES[activeIndex].langCode, voiceId);
    };
    window.addEventListener("apply-screen-audio", commit);
    return () => window.removeEventListener("apply-screen-audio", commit);
  }, [activeIndex, activeUrl, voiceId, persist]);

  const languageCode = active?.langCode ?? "en";
  const languageName = active?.language ?? "English";
  useEffect(() => {
    if (!selectedUrl) return;
    let cancelled = false;
    let timer: number | undefined;
    const initialStatus = window.setTimeout(() => {
      setError(null);
      setStatus(languageCode === "en" ? "Original recording" : "Preparing voice…");
    }, 0);
    const get = async () => {
      const response = await selectionFetch(`/api/audio-language?sourceAudio=${encodeURIComponent(selectedUrl)}&voiceId=${voiceId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load voices");
      if (cancelled) return null;
      setLanguages(data.languages);
      return data.languages.find((l: AudioLanguageEntry) => l.langCode === languageCode) as AudioLanguageEntry;
    };
    const poll = async () => {
      try {
        const entry = await get();
        if (cancelled || !entry) return;
        if (entry.ready) { setStatus(languageCode === "en" ? "Original recording" : "Ready"); return; }
        if (entry.status === "failed") { setError(entry.error || "Speech generation failed. Retry to try again."); setStatus("Failed"); return; }
        setStatus(entry.status === "processing" ? "Generating voice…" : "Queued…");
        timer = window.setTimeout(() => void poll(), POLL_MS);
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : "Unable to load voice"); setStatus("Failed"); } }
    };
    void (async () => {
      try {
        const entry = await get();
        if (cancelled || !entry) return;
        if (entry.ready) { setStatus(languageCode === "en" ? "Original recording" : "Ready"); return; }
        const response = await selectionFetch("/api/audio-language", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceAudio: selectedUrl, language: languageName, voiceId, retry: retry > 0 }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to generate voice");
        if (!cancelled) { setLanguages(data.languages); await poll(); }
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : "Unable to prepare voice"); setStatus("Failed"); } }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(initialStatus);
      window.clearTimeout(timer);
    };
  }, [selectedUrl, languageCode, languageName, voiceId, retry]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.muted = !soundEnabledRef.current;
    if (activeUrl) {
      audio.load();
      void audio.play().catch(() => {
        audio.muted = true;
        soundEnabledRef.current = false;
        setSoundEnabled(false);
        void audio.play().catch(() => {});
      });
    }
  }, [activeUrl]);

  function toggleSound() {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    const audio = audioRef.current;
    if (!next) {
      if (audio) audio.muted = true;
      return;
    }
    if (!audio) return;
    audio.muted = false;
    void audio.play().catch(() => {
      audio.muted = true;
      soundEnabledRef.current = false;
      setSoundEnabled(false);
    });
  }
  function endDrag(element?: HTMLElement, pointerId?: number) {
    if (element && pointerId !== undefined && element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    dragStart.current = null;
    setDragOffset(0);
    setIsDragging(false);
  }
  const selectedLanguage = FALLBACK_LANGUAGES[highlightedIndex];
  const nativeNames: Record<string, string> = { en: "English", de: "Deutsch", hi: "हिन्दी", fr: "Français", es: "Español" };
  const lines: Record<string,string> = { en: "Hello, I’ll be your voice for this broadcast.", de: "Hallo, ich bin Ihre Stimme für diese Sendung.", hi: "नमस्ते, इस प्रसारण में मैं आपकी आवाज़ हूँ।", fr: "Bonjour, je serai votre voix pour cette émission.", es: "Hola, seré tu voz para esta emisión." };
  return <main className={styles.stage} data-playing={programmePlaying}>
    <div className={styles.aurora} aria-hidden="true"><i /><i /><i /></div>
    <header className={styles.header}>
      <div className={styles.badge}><span aria-hidden="true" />Multi language</div>
    </header>
    <section className={styles.hero} aria-label="Selected language">
      <h1 key={selectedLanguage.langCode} className={`${abroSans.className} ${styles.name}`}>{selectedLanguage.language}</h1>
      <p className={styles.native} lang={selectedLanguage.langCode}>{nativeNames[selectedLanguage.langCode]}</p>
      <p className={styles.description}>{lines[selectedLanguage.langCode]}</p>
      <div className={styles.status} role="status">
        {error ? <span className={styles.error}>{error} <button onClick={() => setRetry(n => n + 1)}>Retry</button></span> :
          status !== "Ready" && status !== "Original recording" ? status : ""}
      </div>
    </section>
    <nav className={styles.bezel} data-dragging={isDragging} aria-label="Choose broadcast language"
      onPointerDown={event => {
        if (event.button !== 0) return;
        skipClick.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStart.current = { x: event.clientX, index: highlightedIndex, step: 0 };
        setIsDragging(true);
      }}
      onPointerMove={event => {
        const drag = dragStart.current;
        if (!drag) return;
        const dx = event.clientX - drag.x;
        const step = Math.trunc(-dx / 56);
        if (step !== drag.step) {
          drag.step = step;
          moveTo(drag.index + step);
        }
        setDragOffset(dx + step * 56);
        if (Math.abs(dx) > 8) skipClick.current = true;
      }}
      onPointerUp={event => endDrag(event.currentTarget, event.pointerId)}
      onPointerCancel={event => endDrag(event.currentTarget, event.pointerId)}
      onWheel={event => {
        event.preventDefault();
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        wheelDelta.current += delta;
        const steps = Math.trunc(wheelDelta.current / 42);
        if (steps) {
          moveTo(highlightedIndex + steps);
          wheelDelta.current -= steps * 42;
        }
        window.clearTimeout(wheelReset.current);
        wheelReset.current = window.setTimeout(() => { wheelDelta.current = 0; }, 140);
      }}>
      <div className={styles.ticks} aria-hidden="true">{Array.from({length: 41}, (_, index) => {
        const x = (index - 20) / 20;
        return <i key={index} style={{left: `${index * 2.5}%`, top: `${x * x * 60}px`, transform: `rotate(${x * 22}deg)`}} />;
      })}</div>
      <div className={styles.needle} aria-hidden="true" />
      <div className={styles.languages}>{FALLBACK_LANGUAGES.map((language, index) => {
        const offset = wrapIndex(index - highlightedIndex + 2, FALLBACK_LANGUAGES.length) - 2;
        const visualOffset = offset + dragOffset / 56;
        return <button key={language.langCode} type="button" aria-pressed={index === highlightedIndex}
          className={styles.language} onClick={() => { if (!skipClick.current) moveTo(index); skipClick.current = false; }}
          style={{left: `${50 + visualOffset * 19}%`, top: `${32 + visualOffset * visualOffset * 11}px`, opacity: index === highlightedIndex ? 1 : 0.42}}>{language.language}</button>;
      })}</div>
      <span className={styles.hint}>Drag to tune · ← →</span>
    </nav>
    <audio ref={audioRef} src={activeUrl || undefined} loop onPlaying={() => setProgrammePlaying(true)} onPause={() => setProgrammePlaying(false)} preload="auto" className={styles.audio} aria-label="Selected language and voice" />
    <SoundToggle enabled={soundEnabled} onToggle={toggleSound} />
  </main>;
}
