"use client";
import { useWorkflowDirty, useWorkflowReady } from "@/lib/workflow-ready";
import { selectionFetch } from "@/lib/screen-selection-writes";
import { DEFAULT_VOICE_ID, VOICE_PROFILES, isVoiceId, voiceProfile, type VoiceId } from "@/lib/voice-profiles";


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
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [programmePlaying, setProgrammePlaying] = useState(false);
  const skipClick = useRef(false);
  const dragStart = useRef<number | null>(null);
  const wheelTime = useRef(0);
  const [voiceId, setVoiceId] = useState<VoiceId>(DEFAULT_VOICE_ID);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Choose a language");
  const [retry, setRetry] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const versionRef = useRef(0);
  const changedRef = useRef(false);
  const [saved, setSaved] = useState({ langCode: "en", voiceId: DEFAULT_VOICE_ID as VoiceId });
  useWorkflowDirty(FALLBACK_LANGUAGES[highlightedIndex].langCode !== saved.langCode || voiceId !== saved.voiceId);
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
      setSaved({ langCode, voiceId: selectedVoice });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save voice selection"); }
  }, [sessionId]);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let timer: number | undefined;
    const apply = (state: { audioLanguage?: string; voiceId?: unknown; version?: number } | null) => {
      if (disposed || !state || typeof state.version !== "number" || state.version < versionRef.current) return;
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
          if (index >= 0) {
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
    return () => { disposed = true; window.clearTimeout(timer); socket?.close(); previewRef.current?.pause(); };
  }, []);

  useEffect(() => {
    let disposed = false;
    void selectionFetch("/api/save-audio").then(r => r.json()).then(data => {
      const files: AudioFileItem[] = (data.audioFiles || []).filter((a: AudioFileItem) => a.filename !== "master-audio-16k.wav");
      if (!disposed && files.length) setSelectedUrl(files[0].url);
    }).catch(() => setError("Unable to load source recording"));
    return () => { disposed = true; };
  }, []);

  const moveTo = useCallback((index: number) => {
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
  useEffect(() => {
    if (!changedRef.current) return;
    const timer = window.setTimeout(() => {
      changedRef.current = false; setActiveIndex(highlightedIndex);

    }, COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [highlightedIndex]);
  useEffect(() => {
    const commit = () => { void persist(FALLBACK_LANGUAGES[activeIndex].langCode, voiceId); };
    window.addEventListener("apply-screen-audio", commit);
    return () => window.removeEventListener("apply-screen-audio", commit);
  }, [activeIndex, voiceId, persist]);

  const languageCode = active?.langCode ?? "en";
  const languageName = active?.language ?? "English";
  useEffect(() => {
    if (!selectedUrl) return;
    let cancelled = false;
    let timer: number | undefined;
    setError(null);
    setStatus(languageCode === "en" ? "Original recording" : "Preparing voice…");
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
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [selectedUrl, languageCode, languageName, voiceId, retry]);

  useEffect(() => {
    previewRef.current?.pause(); setPreviewPlaying(false);
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    if (activeUrl) { audio.load(); void audio.play().catch(() => {}); }
  }, [activeUrl]);

  function chooseVoice(id: VoiceId) {
    previewRef.current?.pause(); audioRef.current?.pause(); setPreviewPlaying(false);
    setVoiceId(id); setError(null);

  }
  function previewVoice() {
    audioRef.current?.pause();
    if (previewPlaying) { previewRef.current?.pause(); setPreviewPlaying(false); return; }
    previewRef.current?.pause();
    const sample = new Audio(languageCode !== "en" && activeUrl ? activeUrl : `/chatterbox-service/voices/${voiceId}.wav`);
    previewRef.current = sample;
    sample.onended = () => setPreviewPlaying(false);
    sample.onpause = () => setPreviewPlaying(false);
    void sample.play().then(() => setPreviewPlaying(true)).catch(() => { setPreviewPlaying(false); setError("Unable to play voice preview"); });
  }
  const selectedLanguage = FALLBACK_LANGUAGES[highlightedIndex];
  const nativeNames: Record<string, string> = { en: "English", de: "Deutsch", hi: "हिन्दी", fr: "Français", es: "Español" };
  const gender = voiceProfile(voiceId).gender;
  const lines: Record<string,string> = { en: "Hello, I’ll be your voice for this broadcast.", de: "Hallo, ich bin Ihre Stimme für diese Sendung.", hi: "नमस्ते, इस प्रसारण में मैं आपकी आवाज़ हूँ।", fr: "Bonjour, je serai votre voix pour cette émission.", es: "Hola, seré tu voz para esta emisión." };
  return <main className={styles.stage} data-playing={previewPlaying || programmePlaying}>
    <div className={styles.aurora} aria-hidden="true"><i /><i /><i /></div>
    <header className={styles.header}>
      <div className={styles.badge}><span aria-hidden="true" />Multi language</div>
      <div className={styles.voice} role="group" aria-label="Voice">
        {VOICE_PROFILES.map(voice => <button key={voice.id} type="button" aria-pressed={voiceId === voice.id}
          onClick={() => chooseVoice(voice.id)}>{voice.gender === "male" ? "Male" : "Female"}</button>)}
      </div>
    </header>
    <section className={styles.hero} aria-label="Selected language">
      <h1 key={selectedLanguage.langCode} className={styles.name}>{selectedLanguage.language}</h1>
      <p className={styles.native} lang={selectedLanguage.langCode}>{nativeNames[selectedLanguage.langCode]}</p>
      <p className={styles.description}>{lines[selectedLanguage.langCode]}</p>
      <button className={styles.listen} type="button" onClick={previewVoice} disabled={highlightedIndex !== activeIndex || (languageCode !== "en" && !activeUrl)}>
        <span className={styles.disc} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          {previewPlaying ? <rect x="4" y="4" width="8" height="8" rx="1" /> : <path d="M5 2v12l9-6z" />}
        </svg></span>
        {previewPlaying ? "Stop preview" : `Hear ${gender} voice`}
      </button>
      <div className={styles.status} role="status">
        {error ? <span className={styles.error}>{error} <button onClick={() => setRetry(n => n + 1)}>Retry</button></span> :
          status !== "Ready" && status !== "Original recording" ? status : languageCode === "en" && activeUrl ? <button type="button" onClick={() => { previewRef.current?.pause(); const audio = audioRef.current; if (!audio) return; if (audio.paused) void audio.play().catch(() => setError("Unable to play original recording")); else audio.pause(); }}>{programmePlaying ? "Pause" : "Play"} original recording</button> : ""}
      </div>
    </section>
    <nav className={styles.bezel} aria-label="Choose broadcast language"
      onPointerDown={event => { skipClick.current = false; dragStart.current = event.clientX; }}
      onPointerUp={event => {
        if (dragStart.current !== null && Math.abs(event.clientX - dragStart.current) > 40) { skipClick.current = true; moveTo(highlightedIndex + (event.clientX < dragStart.current ? 1 : -1)); }
        dragStart.current = null;
      }} onPointerCancel={() => { dragStart.current = null; }}
      onWheel={event => { if (Date.now() - wheelTime.current > 350 && Math.abs(event.deltaY) > 15) { wheelTime.current = Date.now(); moveTo(highlightedIndex + Math.sign(event.deltaY)); } }}>
      <div className={styles.ticks} aria-hidden="true">{Array.from({length: 41}, (_, index) => {
        const x = (index - 20) / 20;
        return <i key={index} style={{left: `${index * 2.5}%`, top: `${x * x * 60}px`, transform: `rotate(${x * 22}deg)`}} />;
      })}</div>
      <div className={styles.needle} aria-hidden="true" />
      <div className={styles.languages}>{FALLBACK_LANGUAGES.map((language, index) => {
        const offset = wrapIndex(index - highlightedIndex + 2, FALLBACK_LANGUAGES.length) - 2;
        return <button key={language.langCode} type="button" aria-pressed={index === highlightedIndex}
          className={styles.language} onClick={() => { if (!skipClick.current) moveTo(index); skipClick.current = false; }}
          style={{left: `${50 + offset * 19}%`, top: `${42 + offset * offset * 15}px`, opacity: index === highlightedIndex ? 1 : 0.5}}>{language.language}</button>;
      })}</div>
      <span className={styles.hint}>Drag to tune · ← →</span>
    </nav>
    <audio ref={audioRef} src={activeUrl || undefined} loop onPlaying={() => setProgrammePlaying(true)} onPause={() => setProgrammePlaying(false)} preload="auto" className={styles.audio} aria-label="Selected language and voice" />
  </main>;
}
