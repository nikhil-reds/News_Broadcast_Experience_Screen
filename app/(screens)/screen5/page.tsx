"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
}

type WheelItem = {
  id: string;
  label: string;
  isReady: boolean;
  isOriginal: boolean;
};

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
const SCREEN_BACKGROUND =
  "radial-gradient(circle at 50% 30%, rgba(15, 43, 157, 0.52), #020617 68%)";
const FACE_BACKGROUND =
  "linear-gradient(135deg, #2717b6 0%, #6d1aa8 46%, #c01875 100%)";

function wrapIndex(index: number, length: number) {
  return ((index % length) + length) % length;
}

function getNextRotation(currentRotation: number, targetIndex: number, total: number) {
  const step = 360 / total;
  const target = -targetIndex * step;
  const normalized = currentRotation % 360;
  const delta = ((((target - normalized) % 360) + 540) % 360) - 180;
  return currentRotation + delta;
}

function WheelStopButton({
  item,
  index,
  rotation,
  isActive,
  isHighlighted,
  total,
  onSelect,
}: {
  item: WheelItem;
  index: number;
  rotation: number;
  isActive: boolean;
  isHighlighted: boolean;
  total: number;
  onSelect: () => void;
}) {
  const angle = (360 / total) * index - 90 + rotation;
  const itemStyle: React.CSSProperties = {
    display: "grid",
    placeItems: "center",
  };
  const buttonStyle: React.CSSProperties = {
    transform: `rotate(${angle}deg) translate(var(--radius)) rotate(${-angle}deg)`,
    minWidth: "clamp(5.25rem, 11vmin, 6.25rem)",
    padding: "clamp(0.5rem, 1.15vmin, 0.625rem) clamp(0.875rem, 2vmin, 1.25rem)",
    fontSize: "clamp(0.75rem, 1.55vmin, 0.875rem)",
    ...(isActive || isHighlighted ? { background: FACE_BACKGROUND } : {}),
  };

  return (
    <li
      className="pointer-events-none absolute inset-0"
      style={itemStyle}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isActive}
        className={`pointer-events-auto whitespace-nowrap rounded-full border font-semibold leading-none text-white transition duration-300 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 ${
          isActive
            ? "scale-110 border-white/75 text-white shadow-[0_0_34px_-5px_rgba(192,24,117,0.88)]"
            : isHighlighted
              ? "border-white/70 text-white shadow-[0_0_28px_-6px_rgba(192,24,117,0.78)]"
              : "border-slate-700 bg-slate-950/80 text-slate-300 hover:border-indigo-400 hover:text-white"
        } ${item.isReady ? "" : "opacity-70"}`}
        style={buttonStyle}
      >
        {item.label}
      </button>
    </li>
  );
}

function WheelFace({
  currentLabel,
}: {
  currentLabel: string;
}) {
  const faceStyle: React.CSSProperties = {
    display: "grid",
    placeContent: "center",
    justifyItems: "center",
  };

  return (
    <div
      className={`relative z-20 rounded-full border border-indigo-500/35 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_22px_54px_-22px_rgba(0,0,0,0.9),0_0_42px_-24px_rgba(34,211,238,0.9)] ${styles.wheelFace}`}
      style={{
        ...faceStyle,
        gap: "0.5rem",
        background: FACE_BACKGROUND,
      }}
    >
      <em className="text-[10px] not-italic uppercase tracking-[0.22em] text-cyan-200/80">
        Now browsing
      </em>
      <strong className="max-w-32 text-2xl font-extrabold leading-tight text-white sm:max-w-36 sm:text-3xl">
        {currentLabel}
      </strong>
    </div>
  );
}

function CircularWheelNavigation({
  items,
  highlightedIndex,
  activeIndex,
  rotation,
  onSelect,
}: {
  items: WheelItem[];
  highlightedIndex: number;
  activeIndex: number;
  rotation: number;
  onSelect: (index: number) => void;
}) {
  const current = items[activeIndex] ?? items[0];
  const screenStyle: React.CSSProperties = {
    display: "grid",
    placeItems: "center",
    background: SCREEN_BACKGROUND,
  };
  const pointerStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    // Keep the selection marker above the language pill instead of overlapping its label.
    zIndex: 30,
    width: 0,
    height: 0,
    transform: "translateX(-50%)",
    borderLeft: "9px solid transparent",
    borderRight: "9px solid transparent",
    borderTop: "13px solid #22d3ee",
    filter: "drop-shadow(0 2px 8px rgba(34, 211, 238, 0.72))",
  };
  const liveStyle: React.CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    clipPath: "inset(50%)",
    overflow: "hidden",
    whiteSpace: "nowrap",
  };

  return (
    <section
      className="h-screen w-screen overflow-hidden text-slate-100"
      style={screenStyle}
      aria-label="360 degree wheel navigation"
    >
      <div className="relative h-full w-full overflow-hidden" style={screenStyle}>
        <div className={styles.wheelPointer} style={pointerStyle} aria-hidden="true" />
        <nav
          className={`relative ${styles.wheelMachine}`}
          style={{ display: "grid", placeItems: "center" }}
          aria-label="Language sections"
        >
          <ul
            className={`absolute inset-0 list-none rounded-full border border-indigo-500/35 shadow-[0_0_48px_-30px_rgba(34,211,238,0.9)] ${styles.wheelList}`}
          >
            {items.map((item, itemIndex) => (
              <WheelStopButton
                key={item.id}
                item={item}
                index={itemIndex}
                total={items.length}
                rotation={rotation}
                isActive={itemIndex === activeIndex}
                isHighlighted={itemIndex === highlightedIndex}
                onSelect={() => onSelect(itemIndex)}
              />
            ))}
          </ul>
          <WheelFace currentLabel={current?.label ?? ""} />
          <p style={liveStyle} aria-live="polite">
            {current?.label ? `${current.label} selected` : ""}
          </p>
        </nav>
      </div>
    </section>
  );
}

export default function Screen5Page() {
  const [selectedUrl, setSelectedUrl] = useState<string>("");
  const [languages, setLanguages] = useState<AudioLanguageEntry[]>(FALLBACK_LANGUAGES);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldPlayOnReadyRef = useRef<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastVersionRef = useRef<number>(0);
  const persistOnCommitRef = useRef(false);
  const pendingLanguageRef = useRef<string | null>(null);

  const items = useMemo<WheelItem[]>(
    () =>
      languages.map((language) => ({
        id: language.language,
        label: language.language,
        isReady: language.ready || language.original,
        isOriginal: language.original,
      })),
    [languages]
  );

  const active = languages[activeIndex] ?? languages[0];
  const activeUrl = active?.original ? selectedUrl : active?.url || "";

  const applyRemoteState = useCallback((state: unknown) => {
    if (!state || typeof state !== "object") return;
    const candidate = state as { audioLanguage?: string; version?: number };
    if (typeof candidate.version !== "number" || candidate.version < lastVersionRef.current) return;
    const index = languages.findIndex((language) => language.langCode === candidate.audioLanguage);
    if (index < 0) return;
    lastVersionRef.current = candidate.version;
    persistOnCommitRef.current = false;
    pendingLanguageRef.current = null;
    setHighlightedIndex(index);
    setActiveIndex(index);
    setRotation((currentRotation) => getNextRotation(currentRotation, index, languages.length));
  }, [languages]);

  const moveTo = useCallback(
    (nextIndex: number) => {
      const total = items.length || 1;
      const wrappedIndex = wrapIndex(nextIndex, total);
      shouldPlayOnReadyRef.current = true;
      setHighlightedIndex(wrappedIndex);
      setRotation((currentRotation) => getNextRotation(currentRotation, wrappedIndex, total));
    },
    [items.length]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveTo(highlightedIndex - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveTo(highlightedIndex + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [highlightedIndex, moveTo]);

  useEffect(() => {
    if (highlightedIndex === activeIndex) return;
    const timer = window.setTimeout(() => {
      persistOnCommitRef.current = true;
      setActiveIndex(highlightedIndex);
    }, COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [highlightedIndex, activeIndex]);

  useEffect(() => {
    let disposed = false;
    const websocketUrl = process.env.NEXT_PUBLIC_AUDIO_LANGUAGE_WS_URL ||
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;

    const connect = async () => {
      const session = await fetchCurrentSession();
      if (disposed || !session) return;
      sessionIdRef.current = session.id;
      const socket = new WebSocket(websocketUrl);
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "audio-language:get", sessionId: session.id }));
        if (pendingLanguageRef.current) {
          socket.send(JSON.stringify({
            type: "audio-language:set",
            sessionId: session.id,
            audioLanguage: pendingLanguageRef.current,
          }));
          pendingLanguageRef.current = null;
          persistOnCommitRef.current = false;
        }
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; state?: unknown };
          if (message.type === "audio-language:state" || message.type === "audio-language:changed" || message.type === "audio-language:saved") {
            applyRemoteState(message.state);
          }
        } catch {
          // Ignore malformed gateway messages; the next reconnect resynchronizes state.
        }
      };
      socket.onclose = () => {
        if (!disposed) reconnectTimerRef.current = window.setTimeout(connect, WS_RECONNECT_MS);
      };
    };

    void connect();
    return () => {
      disposed = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [applyRemoteState]);

  useEffect(() => {
    if (!persistOnCommitRef.current || !active || !sessionIdRef.current) return;
    pendingLanguageRef.current = active.langCode;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    persistOnCommitRef.current = false;
    socket.send(JSON.stringify({ type: "audio-language:set", sessionId: sessionIdRef.current, audioLanguage: pendingLanguageRef.current }));
    pendingLanguageRef.current = null;
  }, [active]);

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
      /* keep the wheel usable with fallback languages */
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
          (audio: AudioFileItem) => audio.filename !== "master-audio-16k.wav"
        );
        if (files.length > 0) setSelectedUrl(files[0].url);
      } catch {
        /* the visual wheel should stay available even without recordings */
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedUrl) return;
    const resetTimer = window.setTimeout(() => {
      setHighlightedIndex(0);
      setActiveIndex(0);
      setRotation(0);
      fetchCatalogue(selectedUrl);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [selectedUrl, fetchCatalogue]);

  useEffect(() => {
    if (!selectedUrl || !active || active.original || active.ready) return;

    let cancelled = false;
    let timer: number | null = null;

    (async () => {
      try {
        const res = await fetch("/api/audio-language", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceAudio: selectedUrl, language: active.language }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && Array.isArray(data.languages)) {
          setLanguages(data.languages as AudioLanguageEntry[]);
        }
      } catch {
        return;
      }

      const poll = async () => {
        if (cancelled) return;
        const list = await fetchCatalogue(selectedUrl);
        const entry = list?.find((language) => language.language === active.language);
        if (entry?.ready) return;
        timer = window.setTimeout(poll, POLL_MS);
      };

      timer = window.setTimeout(poll, POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [selectedUrl, active, fetchCatalogue]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeUrl || !shouldPlayOnReadyRef.current) return;

    audio.currentTime = 0;
    audio.load();
    audio.play().catch(() => {
      /* Browser autoplay policy can still require a fresh user gesture. */
    });
  }, [activeUrl]);

  return (
    <>
      <CircularWheelNavigation
        items={items}
        highlightedIndex={highlightedIndex}
        activeIndex={activeIndex}
        rotation={rotation}
        onSelect={moveTo}
      />
      <audio
        ref={audioRef}
        src={activeUrl || undefined}
        loop
        preload="auto"
        className="hidden"
        aria-hidden="true"
      />
    </>
  );
}
