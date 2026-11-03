"use client";
import styles from "./background.module.css";
import { useWorkflowDirty, useWorkflowReady } from "@/lib/workflow-ready";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GREEN_SCREEN_BACKGROUNDS,
  composedOutputUrl,
} from "@/lib/green-screen";
import { recordingSourceQuery } from "@/lib/camera-recordings";
import { fetchCurrentSession, patchSession } from "@/lib/current-session";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";
import { DEFAULT_VOICE_ID, isVoiceId, type VoiceId } from "@/lib/voice-profiles";
import { useSelectedBrightness } from "@/lib/use-selected-brightness";

type ComposeStatus = "waiting" | "active" | "delayed" | "paused" | "completed" | "fallback-ready" | "failed";

interface ComposeResponse {
  status?: ComposeStatus;
  jobId?: string;
  url?: string;
  cached?: boolean;
  error?: string;
  fallback?: string | null;
  fallbackReason?: string | null;
}

interface RecordingItem {
  filename: string;
  url: string;
}

interface AudioFileItem {
  filename: string;
  url: string;
}

interface AudioLanguageEntry {
  language: string;
  langCode: string;
  url: string | null;
  ready: boolean;
  original: boolean;
  voiceId?: VoiceId;
}

interface BackgroundStatusResponse {
  backgroundsStatus?: Array<{
    backgroundId: string;
    status?: string;
    url?: string;
    fallback?: string | null;
    fallbackReason?: string | null;
  }>;
}

const POLL_INTERVAL_MS = 700;
/** Give up (and say so) rather than polling a dead worker forever. */
const COMPOSE_TIMEOUT_MS = 3 * 60 * 1000;
/** How often to check for a newer edited highlight reel. */
const SOURCE_POLL_MS = 3000;
const AUDIO_POLL_MS = 3000;
const WS_RECONNECT_MS = 2000;

const EDITED_REEL_QUERY = recordingSourceQuery({ highlight: true });
const FALLBACK_AUDIO_LANGUAGES: AudioLanguageEntry[] = [
  { language: "English", langCode: "en", url: null, ready: true, original: true },
  { language: "German", langCode: "de", url: null, ready: false, original: false },
  { language: "Hindi", langCode: "hi", url: null, ready: false, original: false },
  { language: "French", langCode: "fr", url: null, ready: false, original: false },
  { language: "Spanish", langCode: "es", url: null, ready: false, original: false },
];
const AUDIO_LANGUAGE_BY_LABEL = new Map(
  FALLBACK_AUDIO_LANGUAGES.map((language) => [language.language, language.langCode])
);

/**
 * One render in progress, keyed by `${backgroundId}::${sourceFilename}` — a
 * new edited reel is a different pair even for the same background, so it
 * never collides with (or gets mistaken for) a render of the previous reel.
 */
interface InFlightCompose {
  /** Set on unmount / settle so a late fetch resolution can't touch state. */
  cancelled: boolean;
  timer?: ReturnType<typeof setTimeout>;
  /** Suppresses the big blocking loader / error banner (pre-warm passes). */
  silent: boolean;
  /** Swap this into the video the moment it finishes, even if silent. */
  autoShow: boolean;
  startedAt: number;
  intent: "prewarm" | "select";
}

const keyFor = (backgroundId: string, sourceFilename: string) => `${backgroundId}::${sourceFilename}`;

export default function Screen7Page() {
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null); // background switch the operator is waiting on
  const [readyIds, setReadyIds] = useState<Set<string>>(new Set()); // composite keys, already rendered this session
  const [warmingIds, setWarmingIds] = useState<Set<string>>(new Set()); // composite keys, rendering quietly
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  useWorkflowReady(Boolean(videoSrc) && !pendingId && !errorMessage);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sourceAudioUrl, setSourceAudioUrl] = useState<string | null>(null);
  const [audioLanguages, setAudioLanguages] = useState<AudioLanguageEntry[]>(FALLBACK_AUDIO_LANGUAGES);
  const [selectedAudioLanguage, setSelectedAudioLanguage] = useState("en");
  const [voiceId, setVoiceId] = useState<VoiceId>(DEFAULT_VOICE_ID);
  const voiceRef = useRef<VoiceId>(DEFAULT_VOICE_ID);
  useEffect(() => { voiceRef.current = voiceId; }, [voiceId]);
  const brightness = useSelectedBrightness();
  // Screen 7 keeps audio separate from the visual composite so Screen 5's
  // selected language can drive playback. Autoplay can still need a gesture.
  const [soundBlocked, setSoundBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const inFlight = useRef<Map<string, InFlightCompose>>(new Map());
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);
  const selectedIdRef = useRef<string | null>(null);
  // Track user intent separately from the background currently playing.
  const requestedIdRef = useRef<string | null>(null);
  const chooseBackgroundRef = useRef<(backgroundId: string) => void>(() => {});
  const remoteBackgroundRef = useRef<string | null>(null);
  const remoteBackgroundVersionRef = useRef(-1);
  const audioSocketRef = useRef<WebSocket | null>(null);
  const audioReconnectTimerRef = useRef<number | null>(null);
  const lastAudioVersionRef = useRef<number>(0);
  const [airId, setAirId] = useState(GREEN_SCREEN_BACKGROUNDS[0].id);
  const [comparing, setComparing] = useState(false);
  const gesture = useRef<{x:number; timer:number} | null>(null);
  const onRemoteBackground = useCallback((backgroundId: string, version: number) => {
    if (!GREEN_SCREEN_BACKGROUNDS.some((background) => background.id === backgroundId)) return;
    if (version <= remoteBackgroundVersionRef.current) return;
    remoteBackgroundVersionRef.current = version;
    setAirId(backgroundId);
    if (requestedIdRef.current === backgroundId) return;
    remoteBackgroundRef.current = backgroundId;
    chooseBackgroundRef.current(backgroundId);
  }, []);
  const saveBackground = useRealtimeSelection("background", onRemoteBackground);
  // Caps handleVideoError's auto-retry per (background, edited reel) so a
  // persistently broken render fails loud instead of flickering forever.
  const videoRetryCount = useRef<Map<string, number>>(new Map());
  const MAX_VIDEO_RETRIES = 2;

  // The current BroadcastSession, so Screens 11/12's export knows which
  // background the operator picked here (see lib/current-session.ts).
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    fetchCurrentSession().then((session) => {
      sessionIdRef.current = session?.id ?? null;
      if (session?.selectedBackgroundId) setAirId(session.selectedBackgroundId);
      if (requestedIdRef.current === null && session?.selectedBackgroundId && GREEN_SCREEN_BACKGROUNDS.some((background) => background.id === session.selectedBackgroundId)) {
        setSelectedId(session.selectedBackgroundId);
        selectedIdRef.current = session.selectedBackgroundId;
        requestedIdRef.current = session.selectedBackgroundId;
      }
      if (session?.selectedAudioLanguage) {
        setSelectedAudioLanguage(AUDIO_LANGUAGE_BY_LABEL.get(session.selectedAudioLanguage) ?? "en");
      }
    });
  }, []);

  const selectedAudioEntry =
    audioLanguages.find((language) => language.langCode === selectedAudioLanguage) ??
    audioLanguages[0] ??
    FALLBACK_AUDIO_LANGUAGES[0];
  const english = selectedAudioLanguage === "en";
  const selectedAudioUrl = english
    ? null
    : selectedAudioEntry?.voiceId === voiceId ? selectedAudioEntry.url : null;
  const selectedAudioLabel = selectedAudioEntry?.original
    ? "Original audio"
    : selectedAudioEntry?.ready && selectedAudioEntry.voiceId === voiceId && selectedAudioEntry.url
      ? `${selectedAudioEntry.language} ${voiceId === "indian-male-01" ? "male" : "female"} audio`
      : `Preparing ${selectedAudioEntry?.language ?? "selected"} voice`

  const playSelectedAudio = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    video.muted = !english;
    const media = english ? video : audioRef.current;
    if (!media || (!english && (!selectedAudioUrl || video.paused))) return;
    const current = () => videoRef.current === video && (english ? !video.muted : audioRef.current === media);
    void media.play().then(() => {
      if (current()) setSoundBlocked(false);
    }).catch(error => {
      if (!current() || error.name !== "NotAllowedError") return;
      setSoundBlocked(true);
      if (english) {
        video.muted = true;
        void video.play().catch(() => {});
      }
    });
  }, [english, selectedAudioUrl]);
  const persistBackgroundSelection = (backgroundId: string) => {
    if (sessionIdRef.current) {
      patchSession(sessionIdRef.current, { selectedBackgroundId: backgroundId });
    }
    if (remoteBackgroundRef.current === backgroundId) remoteBackgroundRef.current = null;
    else saveBackground(backgroundId);
  };

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    const fetchLatestAudio = async () => {
      try {
        const res = await fetch("/api/save-audio");
        if (!res.ok) return;
        const data = await res.json();
        const files: AudioFileItem[] = (data.audioFiles || []).filter(
          (audio: AudioFileItem) => audio.filename !== "master-audio-16k.wav"
        );
        if (files.length > 0 && !cancelled) {
          setSourceAudioUrl((prev) => (prev === files[0].url ? prev : files[0].url));
        }
      } catch {
        /* keep the last usable original audio */
      }
    };
    fetchLatestAudio();
    const interval = setInterval(fetchLatestAudio, SOURCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const fetchAudioCatalogue = useCallback(async (sourceAudio: string) => {
    try {
      const requestedVoice = voiceId;
      const res = await fetch(`/api/audio-language?sourceAudio=${encodeURIComponent(sourceAudio)}&voiceId=${voiceId}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (voiceRef.current !== requestedVoice) return null;
      if (Array.isArray(data.languages) && data.languages.length) {
        const languages = data.languages as AudioLanguageEntry[];
        setAudioLanguages(languages);
        return languages;
      }
    } catch {
      /* original audio remains the fallback */
    }
    return null;
  }, [voiceId]);

  useEffect(() => {
    if (!sourceAudioUrl) return;
    const timer = window.setTimeout(() => {
      fetchAudioCatalogue(sourceAudioUrl);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sourceAudioUrl, fetchAudioCatalogue]);

  useEffect(() => {
    if (!sourceAudioUrl) return;
    const active = audioLanguages.find((language) => language.langCode === selectedAudioLanguage);
    if (!active || active.original || (active.voiceId === voiceId && active.ready)) return;

    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      const list = await fetchAudioCatalogue(sourceAudioUrl);
      if (cancelled) return;
      const refreshed = list?.find((language) => language.langCode === selectedAudioLanguage);
      if (!refreshed?.ready) timer = window.setTimeout(poll, AUDIO_POLL_MS);
    };

    timer = window.setTimeout(poll, AUDIO_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [audioLanguages, fetchAudioCatalogue, selectedAudioLanguage, sourceAudioUrl, voiceId]);

  useEffect(() => {
    if (!sourceAudioUrl || selectedAudioLanguage === "en") return;
    const active = audioLanguages.find((language) => language.langCode === selectedAudioLanguage);
    if (!active || (active.voiceId === voiceId && active.ready)) return;
    fetch("/api/audio-language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceAudio: sourceAudioUrl, language: active.language, voiceId }),
    }).catch(() => {});
  }, [audioLanguages, selectedAudioLanguage, sourceAudioUrl, voiceId]);

  useEffect(() => {
    let disposed = false;
    const websocketUrl = process.env.NEXT_PUBLIC_AUDIO_LANGUAGE_WS_URL ||
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;

    const applyAudioState = (state: unknown) => {
      if (!state || typeof state !== "object") return;
      const candidate = state as { audioLanguage?: string; voiceId?: unknown; version?: number };
      if (typeof candidate.version !== "number" || candidate.version < lastAudioVersionRef.current) return;
      const audioLanguage = candidate.audioLanguage;
      if (typeof audioLanguage !== "string") return;
      if (!FALLBACK_AUDIO_LANGUAGES.some((language) => language.langCode === audioLanguage)) return;
      lastAudioVersionRef.current = candidate.version;
      setSelectedAudioLanguage(audioLanguage);
      setVoiceId(isVoiceId(candidate.voiceId) ? candidate.voiceId : DEFAULT_VOICE_ID);
    };

    const connect = async () => {
      const session = sessionIdRef.current ?? await fetchCurrentSession().then((session) => session?.id ?? null);
      if (disposed || !session) return;
      sessionIdRef.current = session;
      const socket = new WebSocket(websocketUrl);
      audioSocketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "audio-language:get", sessionId: session }));
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; state?: unknown };
          if (message.type === "audio-language:state" || message.type === "audio-language:changed" || message.type === "audio-language:saved") {
            applyAudioState(message.state);
          }
        } catch {
          /* reconnects resync state */
        }
      };
      socket.onclose = () => {
        if (!disposed) audioReconnectTimerRef.current = window.setTimeout(connect, WS_RECONNECT_MS);
      };
    };

    void connect();
    return () => {
      disposed = true;
      if (audioReconnectTimerRef.current) window.clearTimeout(audioReconnectTimerRef.current);
      audioSocketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    if (english) {
      playSelectedAudio();
      return;
    }
    if (!audio || !selectedAudioUrl) return;
    const align = () => {
      if (audio.readyState < 1 || !Number.isFinite(audio.duration)) return;
      const target = Math.min(video.currentTime, audio.duration);
      if (Math.abs(audio.currentTime - target) > 0.12) audio.currentTime = target;
    };
    const start = () => {
      align();
      if (!video.paused && !video.seeking && video.readyState >= 2) playSelectedAudio();
    };
    const pause = () => audio.pause();
    video.addEventListener("playing", start);
    video.addEventListener("seeked", start);
    video.addEventListener("timeupdate", align);
    for (const event of ["pause", "waiting", "seeking"]) video.addEventListener(event, pause);
    audio.addEventListener("canplay", start);
    start();
    return () => {
      audio.pause();
      video.removeEventListener("playing", start);
      video.removeEventListener("seeked", start);
      video.removeEventListener("timeupdate", align);
      for (const event of ["pause", "waiting", "seeking"]) video.removeEventListener(event, pause);
      audio.removeEventListener("canplay", start);
    };
  }, [english, playSelectedAudio, selectedAudioUrl, videoSrc]);

  // Latest edited highlight reel — the base video this whole screen composites against.
  useEffect(() => {
    let cancelled = false;
    const fetchLatestSource = async () => {
      try {
        const res = await fetch(`/api/save-recording?${EDITED_REEL_QUERY}`);
        if (!res.ok) return;
        const data = await res.json();
        const list: RecordingItem[] = data.recordings || [];
        if (list.length > 0 && !cancelled) {
          setSourceFilename((prev) => (prev === list[0].filename ? prev : list[0].filename));
        }
      } catch {
        /* keep whatever source is already tracked */
      }
    };
    fetchLatestSource();
    const interval = setInterval(fetchLatestSource, SOURCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const pending = inFlight.current;
    return () => {
      pending.forEach((entry) => {
        entry.cancelled = true;
        if (entry.timer) clearTimeout(entry.timer);
      });
      pending.clear();
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    };
  }, []);

  const startElapsedClock = () => {
    startedAt.current = Date.now();
    setElapsedSeconds(0);
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    elapsedTimer.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
  };

  const stopElapsedClock = () => {
    if (elapsedTimer.current) {
      clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
    }
  };

  /**
   * True while `entry` is still the record registered for this key.
   *
   * Every async step re-checks this instead of just re-reading the map by
   * key. The difference matters because the map gets cleared wholesale
   * (unmount, and React's StrictMode double-invoked mount effect in dev): a
   * stale continuation that only looked up by key would find the
   * *replacement* entry, adopt it, and start a second poll loop against it —
   * two loops writing one `timer` field, one of them orphaned, and whichever
   * settled first cancelling a render that belonged to the other. That
   * silently lost completions (a swatch that had really rendered never lit
   * up).
   */
  const ownsCompose = (key: string, entry: InFlightCompose) =>
    !entry.cancelled && inFlight.current.get(key) === entry;

  /**
   * Finish one render: drop its in-flight record and release the loader if
   * the operator was waiting on it. Reads `silent` off the record rather
   * than a closure param, so a pre-warm that got promoted by a click settles
   * as the visible render it became.
   */
  // Stops waiting on the visible render and releases the loader. The server
  // render is not aborted; choosing the background again picks it back up.
  const cancelWaiting = () => {
    for (const [key, entry] of inFlight.current) {
      if (!entry.silent) settleCompose(key, entry);
    }
    requestedIdRef.current = selectedIdRef.current;
    setErrorMessage("Stopped waiting. Choose the background again to retry.");
  };

  const settleCompose = (key: string, entry: InFlightCompose, url?: string) => {
    if (entry.timer) clearTimeout(entry.timer);
    if (inFlight.current.get(key) === entry) {
      inFlight.current.delete(key);
    }

    setWarmingIds((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (url) {
      setReadyIds((prev) => new Set(prev).add(key));
    }
    if (!entry.silent) {
      stopElapsedClock();
      setPendingId(null);
    }
  };

  const showComposed = (backgroundId: string, url: string) => {
    // Cache-buster: the URL is stable per (background, edited reel) but this guards
    // against `key={videoSrc}` not remounting if a caller ever reuses one.
    setVideoSrc(`${url}?t=${Date.now()}`);
    setSelectedId(backgroundId);
    selectedIdRef.current = backgroundId;
    requestedIdRef.current = backgroundId;
    // A successful swap retires whatever went wrong before it — otherwise
    // handleVideoError's "re-rendering it now…" notice outlives the re-render
    // it was describing and sits there over a background that plays fine.
    setErrorMessage(null);
  };

  const pollCompose = (
    backgroundId: string,
    sourceTake: string,
    jobId: string,
    entry: InFlightCompose
  ) => {
    const key = keyFor(backgroundId, sourceTake);
    const tick = async () => {
      if (!ownsCompose(key, entry)) return;

      if (Date.now() - entry.startedAt > COMPOSE_TIMEOUT_MS) {
        if (!entry.silent) {
          setErrorMessage(
            "This background is taking too long to render. Check that the background service is running, then choose it again."
          );
        }
        settleCompose(key, entry, undefined);
        return;
      }

      try {
        const res = await fetch(
          `/api/green-screen/compose/${encodeURIComponent(jobId)}` +
            `?backgroundId=${encodeURIComponent(backgroundId)}&sourceFilename=${encodeURIComponent(sourceTake)}`
        );
        const data: ComposeResponse = await res.json().catch(() => ({}) as ComposeResponse);

        if (!ownsCompose(key, entry)) return;

        if ((data.status === "completed" || data.status === "fallback-ready") && data.url) {
          if (entry.autoShow && (requestedIdRef.current === null || requestedIdRef.current === backgroundId)) {
            setFallbackMessage(
              data.status === "fallback-ready"
                ? "Using a simpler background key for this one."
                : null
            );
            showComposed(backgroundId, data.url);
          }
          settleCompose(key, entry, data.url);
          return;
        }

        // Only an explicit failure (or an error response) is terminal. Anything
        // else — including a state this client doesn't know the name of — counts
        // as still working, because dropping a live render loses a swatch for
        // the whole session. Re-scheduling is safe now that COMPOSE_TIMEOUT_MS
        // bounds the loop; it's what turned a status-less 404 into an unkillable
        // 700ms request storm before that backstop existed.
        if (!res.ok || data.status === "failed") {
          if (!entry.silent) {
            setErrorMessage(data.error || "Compositing this background failed.");
          }
          settleCompose(key, entry, undefined);
          return;
        }

        entry.timer = setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        if (!ownsCompose(key, entry)) return;
        if (!entry.silent) setErrorMessage("Lost contact with the background service.");
        settleCompose(key, entry, undefined);
      }
    };
    tick();
  };

  /**
   * Renders (or reuses) one (background, edited reel) pair. `silent` suppresses the
   * big loader/error banner (used for pre-warming); `autoShow` swaps the
   * result into the video the moment it's ready even while silent — used
   * both for the very first background to finish (nobody's picked one yet)
   * and for a silent refresh of the *currently selected* background after a
   * new edited reel lands, so the screen updates on its own.
   */
  const ensureComposed = (
    backgroundId: string,
    sourceTake: string,
    opts: { silent: boolean; autoShow: boolean; intent: "prewarm" | "select" }
  ) => {
    const key = keyFor(backgroundId, sourceTake);
    const existing = inFlight.current.get(key);
    if (existing) {
      // Already rendering — attach instead of firing a second request: there
      // is exactly one compose pass per (background, edited reel) pair either way.
      if (!opts.silent) existing.silent = false;
      if (opts.autoShow) existing.autoShow = true;
      if (opts.intent === "select" && existing.intent !== "select") {
        existing.intent = "select";
        fetch("/api/green-screen/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backgroundId, sourceFilename: sourceTake, intent: "select" }),
        }).catch(() => setErrorMessage("Could not register Screen 7 background selection."));
      }
      return;
    }

    const entry: InFlightCompose = {
      cancelled: false,
      silent: opts.silent,
      autoShow: opts.autoShow,
      startedAt: Date.now(),
      intent: opts.intent,
    };
    inFlight.current.set(key, entry);
    setWarmingIds((prev) => new Set(prev).add(key));

    (async () => {
      try {
        const res = await fetch("/api/green-screen/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backgroundId, sourceFilename: sourceTake, intent: entry.intent }),
        });
        const data: ComposeResponse = await res.json().catch(() => ({}) as ComposeResponse);

        if (!ownsCompose(key, entry)) return;

        if (!res.ok) {
          if (!entry.silent) setErrorMessage(data.error || "Failed to start compositing.");
          settleCompose(key, entry, undefined);
          return;
        }

        if ((data.status === "completed" || data.status === "fallback-ready") && data.url) {
          if (entry.autoShow && (requestedIdRef.current === null || requestedIdRef.current === backgroundId)) {
            setFallbackMessage(
              data.status === "fallback-ready"
                ? "Using a simpler background key for this one."
                : null
            );
            showComposed(backgroundId, data.url);
          }
          settleCompose(key, entry, data.url);
          return;
        }

        if (data.jobId) {
          pollCompose(backgroundId, sourceTake, data.jobId, entry);
          return;
        }

        if (!entry.silent) setErrorMessage("The background service did not start a render.");
        settleCompose(key, entry, undefined);
      } catch (err) {
        if (!ownsCompose(key, entry)) return;
        const reason = err instanceof Error ? err.message : "";
        if (!entry.silent) setErrorMessage(reason || "Could not reach the background service.");
        settleCompose(key, entry, undefined);
      }
    })();
  };

  // Whenever the edited reel changes (including the first time it's known):
  // pre-warm every background against it, and if one is already selected,
  // auto-show it again the moment its refresh against the new reel is ready
  // — so the screen always keeps showing the latest edited feed, never a stale or
  // blank one, without the operator re-clicking anything.
  useEffect(() => {
    if (!sourceFilename) return;
    let cancelled = false;
    const restoreAndWarm = async () => {
      let status: BackgroundStatusResponse = {};
      try {
        const res = await fetch(`/api/green-screen/status?sourceFilename=${encodeURIComponent(sourceFilename)}`);
        if (res.ok) status = await res.json();
      } catch {
        // The individual compose request below remains the recovery path.
      }
      if (cancelled) return;

      const byId = new Map((status.backgroundsStatus ?? []).map((entry) => [entry.backgroundId, entry]));
      const ready = new Set<string>();
      const warming = new Set<string>();
      const selected = requestedIdRef.current;
      for (const bg of GREEN_SCREEN_BACKGROUNDS) {
        const entry = byId.get(bg.id);
        const key = keyFor(bg.id, sourceFilename);
        if (entry?.status === "completed" || entry?.status === "fallback-ready") {
          ready.add(key);
          continue;
        }
        // Reattach to existing jobs too, so completion always updates the preview.
        warming.add(key);
        const autoShow = selected === null || selected === bg.id;
        ensureComposed(bg.id, sourceFilename, { silent: true, autoShow, intent: "prewarm" });
      }
      setReadyIds(ready);
      setWarmingIds(warming);
      const restoredId = selected
        ? (ready.has(keyFor(selected, sourceFilename)) ? selected : null)
        : GREEN_SCREEN_BACKGROUNDS.find((bg) => ready.has(keyFor(bg.id, sourceFilename)))?.id ?? null;
      if (restoredId) {
        showComposed(restoredId, composedOutputUrl(restoredId, sourceFilename));
      }
    };
    const pending = inFlight.current;
    restoreAndWarm();
    return () => {
      cancelled = true;
      // A previous reel must never replace the preview after its source changes.
      for (const [key, entry] of pending) {
        entry.cancelled = true;
        if (entry.timer) clearTimeout(entry.timer);
        pending.delete(key);
      }
      stopElapsedClock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilename]);

  const chooseBackground = (backgroundId: string) => {
    if (!sourceFilename || !GREEN_SCREEN_BACKGROUNDS.some((bg) => bg.id === backgroundId)) return;
    if ((backgroundId === selectedId && videoSrc && !pendingId) || backgroundId === pendingId) return;
    requestedIdRef.current = backgroundId;
    // Superseded requests can finish caching, but cannot control the preview.
    for (const entry of inFlight.current.values()) entry.silent = true;
    setErrorMessage(null);
    setFallbackMessage(null);

    const key = keyFor(backgroundId, sourceFilename);
    if (readyIds.has(key)) {
      // Already rendered against the current edited reel — swap instantly.
      stopElapsedClock();
      setPendingId(null);
      showComposed(backgroundId, composedOutputUrl(backgroundId, sourceFilename));
      fetch("/api/green-screen/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backgroundId, sourceFilename, intent: "select" }),
      }).catch(() => setErrorMessage("Could not update Screen 7 publication state."));
      return;
    }

    setPendingId(backgroundId);
    startElapsedClock();
    ensureComposed(backgroundId, sourceFilename, { silent: false, autoShow: true, intent: "select" });
  };
  useEffect(() => {
    chooseBackgroundRef.current = chooseBackground;
  });

  /**
   * The "ready" dot means the client saw this (background, edited reel) render
   * successfully at some point in this session — it does NOT mean the
   * object is still in MinIO right now (e.g. it was cleared, or a worker
   * crash left a short/corrupt file). A missing or unplayable src otherwise
   * fails silently as a black rectangle with zero feedback, so: un-mark it
   * as ready and kick off a fresh render instead of leaving the operator
   * staring at black — never fall back to an uncomposited reel, there isn't
   * one to fall back to anymore.
   */
  const handleVideoError = () => {
    if (!selectedId || !sourceFilename) return;
    const backgroundId = selectedId;
    if (requestedIdRef.current !== backgroundId) return;
    const key = keyFor(backgroundId, sourceFilename);
    const label =
      GREEN_SCREEN_BACKGROUNDS.find((b) => b.id === backgroundId)?.label ?? backgroundId;
    const attempts = videoRetryCount.current.get(key) ?? 0;

    setReadyIds((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setVideoSrc(null);

    if (attempts >= MAX_VIDEO_RETRIES) {
      setErrorMessage(
        `"${label}" could not be prepared after several attempts. Check the background service logs, then choose it again.`
      );
      return;
    }

    videoRetryCount.current.set(key, attempts + 1);
    setErrorMessage(`"${label}" failed to load — re-rendering it now…`);
    setPendingId(backgroundId);
    startElapsedClock();
    ensureComposed(backgroundId, sourceFilename, { silent: false, autoShow: true, intent: "select" });
  };

  useWorkflowDirty(Boolean(selectedId) && (pendingId ?? selectedId) !== airId);
  const isProcessing = pendingId !== null;
  const preview = GREEN_SCREEN_BACKGROUNDS.find(bg => bg.id === (pendingId ?? selectedId));
  const onAir = GREEN_SCREEN_BACKGROUNDS.find(bg => bg.id === airId) ?? GREEN_SCREEN_BACKGROUNDS[0];
  useEffect(() => {
    const commit = () => { if (selectedId) persistBackgroundSelection(selectedId); };
    window.addEventListener("apply-screen-background", commit);
    return () => window.removeEventListener("apply-screen-background", commit);
  });
  useEffect(() => () => window.clearTimeout(gesture.current?.timer), []);
  function endGesture() {
    window.clearTimeout(gesture.current?.timer);
    gesture.current = null;
    setComparing(false);
  }
  function cycle(direction: number) {
    if (!sourceFilename) return;
    const index = GREEN_SCREEN_BACKGROUNDS.findIndex(bg => bg.id === (pendingId ?? selectedId));
    const count = GREEN_SCREEN_BACKGROUNDS.length;
    chooseBackground(GREEN_SCREEN_BACKGROUNDS[(index + direction + count) % count].id);
  }

  return (
    <div className={styles.stage}>
      <main className="relative h-full w-full">
        <section className="absolute inset-0 bg-black">
          <div
            className="relative h-full w-full overflow-hidden bg-black"
            tabIndex={0} role="group" aria-label="Background preview. Use arrow keys to change and hold Space to compare."
            onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); cycle(e.key === "ArrowLeft" ? -1 : 1); } if (e.key === " ") { e.preventDefault(); setComparing(true); } }}
            onKeyUp={e => { if (e.key === " ") setComparing(false); }} onBlur={endGesture}
            onPointerDown={e => { if ((e.target as Element).closest("button")) return; endGesture(); e.currentTarget.setPointerCapture(e.pointerId); gesture.current = { x:e.clientX, timer:window.setTimeout(() => setComparing(true), 250) }; }}
            onPointerMove={e => { if (gesture.current && Math.abs(e.clientX - gesture.current.x) > 12) { window.clearTimeout(gesture.current.timer); setComparing(false); } }}
            onPointerUp={e => { const dx = gesture.current ? e.clientX - gesture.current.x : 0; endGesture(); if (Math.abs(dx) > 45) cycle(dx < 0 ? 1 : -1); }} onPointerCancel={endGesture} onLostPointerCapture={endGesture}
            onClick={() => {
              if (!soundBlocked) return;
              videoRef.current?.play().catch(() => {});
              playSelectedAudio();
            }}
          >
            {videoSrc ? (
              <video
                key={videoSrc}
                ref={videoRef}
                src={videoSrc}
                autoPlay
                loop
                muted={!english}
                playsInline
                onError={handleVideoError}
                onLoadedData={() => {
                  if (selectedId && sourceFilename) {
                    videoRetryCount.current.delete(keyFor(selectedId, sourceFilename));
                  }
                  if (english) playSelectedAudio();
                  else void videoRef.current?.play().catch(() => {});
                }}
                className="w-full h-full object-cover"
                style={{ filter: `brightness(${brightness}%)` }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm font-mono">
                {sourceFilename ? "Preparing first edited-background composite…" : "Waiting for edited video…"}
              </div>
            )}

            {!english && selectedAudioUrl && <audio
              ref={audioRef}
              key={selectedAudioUrl}
              src={selectedAudioUrl}
              preload="auto"
              className="hidden"
              aria-hidden="true"
            />}

            {comparing && sourceFilename && selectedId !== onAir.id && (
              <video className="pointer-events-none absolute inset-0 h-full w-full object-cover" src={composedOutputUrl(onAir.id, sourceFilename)}
                muted playsInline autoPlay loop onLoadedMetadata={e => { e.currentTarget.currentTime = videoRef.current?.currentTime ?? 0; }}
                style={{filter: `brightness(${brightness}%)`}} />
            )}
            {isProcessing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/80 backdrop-blur-sm">
                <span className="w-12 h-12 rounded-full border-[3px] border-emerald-400 border-t-transparent animate-spin" />
                <div className="w-56 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-emerald-500 animate-[loaderSlide_1.1s_ease-in-out_infinite]" />
                </div>
                <p className="text-sm font-mono text-slate-200">
                  Preparing background… {elapsedSeconds}s
                </p>
                <button
                  type="button"
                  onClick={cancelWaiting}
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-mono text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-400"
                >
                  Stop waiting
                </button>
              </div>
            )}
          </div>

        {errorMessage && (
          <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-xl border border-rose-500/30 bg-rose-950/85 p-3.5 text-xs text-rose-300 backdrop-blur-md">
            {errorMessage}
          </div>
        )}
        {fallbackMessage && !errorMessage && (
          <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-xl border border-amber-500/30 bg-amber-950/85 p-3.5 text-xs text-amber-200 backdrop-blur-md">
            {fallbackMessage}
          </div>
        )}
        </section>

        <div className={styles.badge}><i />Background<span>{onAir.label} on air</span></div>
        {preview && <div className={styles.preview} role="status"><i />{comparing ? "On air now" : pendingId ? "Preparing " + preview.label : "Previewing " + preview.label}</div>}
        <nav className={styles.rail} aria-label="Broadcast backgrounds">
          {GREEN_SCREEN_BACKGROUNDS.map(bg => <button type="button" key={bg.id} disabled={!sourceFilename}
            aria-label={bg.label} aria-pressed={preview?.id === bg.id} onClick={() => chooseBackground(bg.id)}>
            <img src={bg.thumb} alt="" />
            <span>{onAir.id === bg.id && <i aria-label="On air" />}{bg.label}</span>
            {preview?.id === bg.id && <b aria-hidden="true">✓</b>}
          </button>)}
        </nav>
        <button className={styles.audio} type="button" onClick={playSelectedAudio} aria-label={soundBlocked ? "Enable selected audio" : selectedAudioLabel}>
          <span aria-hidden="true">♫</span> Audio · {selectedAudioLabel}{soundBlocked && " · Enable sound"}
        </button>
        <div className={styles.hint}>Swipe to change, hold to compare</div>
      </main>
    </div>
  );
}
