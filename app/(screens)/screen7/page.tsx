"use client";

import { useEffect, useRef, useState } from "react";
import {
  GREEN_SCREEN_BACKGROUNDS,
  composedOutputUrl,
} from "@/lib/green-screen";
import { recordingSourceQuery } from "@/lib/camera-recordings";
import { fetchCurrentSession, patchSession } from "@/lib/current-session";

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

const EDITED_REEL_QUERY = recordingSourceQuery({ highlight: true });

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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // Composited backgrounds now carry real audio (see composeGreenScreenBackground
  // in lib/ffmpeg.ts) — unmuted autoplay can be silently blocked by the browser
  // without a prior user gesture, same pattern as components/recording-looper.tsx.
  const [soundBlocked, setSoundBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const inFlight = useRef<Map<string, InFlightCompose>>(new Map());
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);
  const selectedIdRef = useRef<string | null>(null);
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
      if (session?.selectedBackgroundId) {
        setSelectedId(session.selectedBackgroundId);
        selectedIdRef.current = session.selectedBackgroundId;
      }
    });
  }, []);
  const persistBackgroundSelection = (backgroundId: string) => {
    if (sessionIdRef.current) {
      patchSession(sessionIdRef.current, { selectedBackgroundId: backgroundId });
    }
  };

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

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
    // This function is only invoked from user/effect callbacks, never during
    // render; the React purity rule cannot infer that through this closure.
    // eslint-disable-next-line react-hooks/purity
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
    persistBackgroundSelection(backgroundId);
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
            "Compositing timed out. Is the worker running? — npm run worker:green-screen"
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
          setFallbackMessage(
            data.status === "fallback-ready"
              ? `RVM matte failed; showing chromakey fallback${data.fallbackReason ? ` (${data.fallbackReason})` : ""}.`
              : null
          );
          if (entry.autoShow && (selectedIdRef.current === null || selectedIdRef.current === backgroundId)) {
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
        if (!entry.silent) setErrorMessage("Lost contact with the compose worker.");
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
          setFallbackMessage(
            data.status === "fallback-ready"
              ? `RVM matte failed; showing chromakey fallback${data.fallbackReason ? ` (${data.fallbackReason})` : ""}.`
              : null
          );
          if (entry.autoShow && (selectedIdRef.current === null || selectedIdRef.current === backgroundId)) {
            showComposed(backgroundId, data.url);
          }
          settleCompose(key, entry, data.url);
          return;
        }

        if (data.jobId) {
          pollCompose(backgroundId, sourceTake, data.jobId, entry);
          return;
        }

        if (!entry.silent) setErrorMessage("The compose API returned no job to track.");
        settleCompose(key, entry, undefined);
      } catch (err) {
        if (!ownsCompose(key, entry)) return;
        const reason = err instanceof Error ? err.message : "";
        if (!entry.silent) setErrorMessage(reason || "Failed to reach the compose API.");
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
      const selected = selectedIdRef.current;
      for (const bg of GREEN_SCREEN_BACKGROUNDS) {
        const entry = byId.get(bg.id);
        const key = keyFor(bg.id, sourceFilename);
        if (entry?.status === "completed" || entry?.status === "fallback-ready") {
          ready.add(key);
          continue;
        }
        if (["waiting", "active", "delayed", "paused", "processing"].includes(entry?.status ?? "")) {
          warming.add(key);
          continue;
        }
        const autoShow = selected === null || selected === bg.id;
        ensureComposed(bg.id, sourceFilename, { silent: true, autoShow, intent: "prewarm" });
      }
      setReadyIds(ready);
      setWarmingIds(warming);
      const restoredId = selected && ready.has(keyFor(selected, sourceFilename))
        ? selected
        : GREEN_SCREEN_BACKGROUNDS.find((bg) => ready.has(keyFor(bg.id, sourceFilename)))?.id ?? null;
      if (restoredId) {
        setSelectedId(restoredId);
        selectedIdRef.current = restoredId;
        setVideoSrc(`${composedOutputUrl(restoredId, sourceFilename)}?t=${Date.now()}`);
      }
    };
    restoreAndWarm();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilename]);

  const chooseBackground = (backgroundId: string) => {
    if (!sourceFilename) return;
    if (backgroundId === selectedId || backgroundId === pendingId) return;
    setErrorMessage(null);
    setFallbackMessage(null);

    const key = keyFor(backgroundId, sourceFilename);
    if (readyIds.has(key)) {
      // Already rendered against the current edited reel — swap instantly.
      // eslint-disable-next-line react-hooks/purity
      setVideoSrc(`${composedOutputUrl(backgroundId, sourceFilename)}?t=${Date.now()}`);
      setSelectedId(backgroundId);
      selectedIdRef.current = backgroundId;
      persistBackgroundSelection(backgroundId);
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
        `"${label}" keeps failing to load — check the worker terminal for ffmpeg errors.`
      );
      return;
    }

    videoRetryCount.current.set(key, attempts + 1);
    setErrorMessage(`"${label}" failed to load — re-rendering it now…`);
    setPendingId(backgroundId);
    startElapsedClock();
    ensureComposed(backgroundId, sourceFilename, { silent: false, autoShow: true, intent: "select" });
  };

  const isProcessing = pendingId !== null;
  const stillWarmingCount = warmingIds.size;

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      <main className="relative h-full w-full">
        <section className="absolute inset-0 bg-black">
          <div
            className="relative h-full w-full overflow-hidden bg-black"
            onClick={() => {
              if (!soundBlocked) return;
              videoRef.current
                ?.play()
                .then(() => setSoundBlocked(false))
                .catch(() => {});
            }}
          >
            {videoSrc ? (
              <video
                key={videoSrc}
                ref={videoRef}
                src={videoSrc}
                autoPlay
                loop
                playsInline
                onError={handleVideoError}
                onLoadedData={() => {
                  if (selectedId && sourceFilename) {
                    videoRetryCount.current.delete(keyFor(selectedId, sourceFilename));
                  }
                  videoRef.current
                    ?.play()
                    .then(() => setSoundBlocked(false))
                    .catch(() => setSoundBlocked(true));
                }}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm font-mono">
                {sourceFilename ? "Preparing first edited-background composite…" : "Waiting for edited video…"}
              </div>
            )}

            {soundBlocked && (
              <div className="absolute bottom-4 right-4 px-3 py-2 rounded-lg bg-slate-950/85 border border-slate-700 text-xs font-mono text-slate-200">
                🔇 Click to enable sound
              </div>
            )}

            {isProcessing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/80 backdrop-blur-sm">
                <span className="w-12 h-12 rounded-full border-[3px] border-emerald-400 border-t-transparent animate-spin" />
                <div className="w-56 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-emerald-500 animate-[loaderSlide_1.1s_ease-in-out_infinite]" />
                </div>
                <p className="text-sm font-mono text-slate-200">
                  Compositing background with ffmpeg… {elapsedSeconds}s
                </p>
              </div>
            )}
          </div>

        {errorMessage && (
          <div className="absolute left-6 top-6 z-20 rounded-xl border border-rose-500/30 bg-rose-950/85 p-3.5 text-xs text-rose-300 backdrop-blur-md">
            {errorMessage}
          </div>
        )}
        {fallbackMessage && !errorMessage && (
          <div className="absolute left-6 top-6 z-20 rounded-xl border border-amber-500/30 bg-amber-950/85 p-3.5 text-xs text-amber-200 backdrop-blur-md">
            {fallbackMessage}
          </div>
        )}
        </section>

        {/* Background picker */}
        <section className="absolute inset-x-6 bottom-6 z-20 mx-auto max-w-4xl space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-center gap-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">
              Choose a Background
            </h3>
            {stillWarmingCount > 0 && (
              <span className="text-[10px] font-mono text-amber-400/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                pre-rendering {stillWarmingCount} in the background
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {GREEN_SCREEN_BACKGROUNDS.map((bg) => {
              const key = sourceFilename ? keyFor(bg.id, sourceFilename) : null;
              const isActive = selectedId === bg.id;
              const isPending = pendingId === bg.id;
              const isWarming = !!key && warmingIds.has(key) && !isPending;
              const isReady = !!key && readyIds.has(key);
              return (
                <button
                  key={bg.id}
                  onClick={() => chooseBackground(bg.id)}
                  disabled={isProcessing || !sourceFilename}
                  className={`group relative rounded-xl overflow-hidden border-2 transition aspect-video ${
                    isActive
                      ? "border-emerald-400 shadow-lg shadow-emerald-950"
                      : "border-slate-800 hover:border-emerald-500/60"
                  } ${(isProcessing && !isPending) || !sourceFilename ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={bg.thumb} alt={bg.label} className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 px-2 py-1.5">
                    <p className="text-[11px] font-semibold text-slate-100 truncate">{bg.label}</p>
                  </div>
                  {isActive && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] flex items-center justify-center font-bold">
                      ✓
                    </span>
                  )}
                  {!isActive && isReady && (
                    <span
                      title="Ready — instant switch"
                      className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500"
                    />
                  )}
                  {!isActive && isWarming && (
                    <span
                      title="Pre-rendering…"
                      className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"
                    />
                  )}
                  {isPending && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
                      <span className="w-5 h-5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <style>{`
        @keyframes loaderSlide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(150%); }
        }
      `}</style>
    </div>
  );
}
