"use client";

import { useEffect, useRef, useState } from "react";
import {
  GREEN_SCREEN_BACKGROUNDS,
  GREEN_SCREEN_SOURCE_URL,
  composedOutputUrl,
} from "@/lib/green-screen";

type ComposeStatus = "waiting" | "active" | "delayed" | "paused" | "completed" | "failed";

interface ComposeResponse {
  status?: ComposeStatus;
  jobId?: string;
  url?: string;
  cached?: boolean;
  error?: string;
}

const POLL_INTERVAL_MS = 700;
/** Give up (and say so) rather than polling a dead worker forever. */
const COMPOSE_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * One render in progress. Held in a ref-map keyed by background id so a click
 * can *attach* to the pre-warm pass already rendering that background instead
 * of racing a second request against it.
 */
interface InFlightCompose {
  /** Set on unmount / settle so a late fetch resolution can't touch state. */
  cancelled: boolean;
  timer?: ReturnType<typeof setTimeout>;
  /** Flips to false the moment the operator starts waiting on this render. */
  silent: boolean;
  startedAt: number;
}

export default function Screen7Page() {
  const [selectedId, setSelectedId] = useState<string | null>(null); // null = original green screen
  const [videoSrc, setVideoSrc] = useState<string>(GREEN_SCREEN_SOURCE_URL);
  const [pendingId, setPendingId] = useState<string | null>(null); // background switch the user is waiting on
  const [readyIds, setReadyIds] = useState<Set<string>>(new Set()); // already rendered, instant to switch to
  const [warmingIds, setWarmingIds] = useState<Set<string>>(new Set()); // rendering quietly in the background
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const inFlight = useRef<Map<string, InFlightCompose>>(new Map());
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);
  // Caps handleVideoError's auto-retry per background so a persistently
  // broken render (as opposed to the one-off mid-write race it's meant to
  // recover from) fails loud instead of flickering forever.
  const videoRetryCount = useRef<Map<string, number>>(new Map());
  const MAX_VIDEO_RETRIES = 2;

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
   * True while `entry` is still the record registered for this background.
   *
   * Every async step re-checks this instead of just re-reading the map by id.
   * The difference matters because the map gets cleared wholesale (unmount, and
   * React's StrictMode double-invoked mount effect in dev): a stale continuation
   * that only looked up by id would find the *replacement* entry, adopt it, and
   * start a second poll loop against it — two loops writing one `timer` field,
   * one of them orphaned, and whichever settled first cancelling a render that
   * belonged to the other. That silently lost completions (a swatch that had
   * really rendered never lit up).
   */
  const ownsCompose = (backgroundId: string, entry: InFlightCompose) =>
    !entry.cancelled && inFlight.current.get(backgroundId) === entry;

  /**
   * Finish one render: drop its in-flight record and release the loader if the
   * operator was waiting on it. Reads `silent` off the record rather than a
   * closure param, so a pre-warm that got promoted by a click settles as the
   * visible render it became.
   */
  const settleCompose = (backgroundId: string, entry: InFlightCompose, url?: string) => {
    if (entry.timer) clearTimeout(entry.timer);
    // Only clear the slot if it's still ours — never evict a successor.
    if (inFlight.current.get(backgroundId) === entry) {
      inFlight.current.delete(backgroundId);
    }

    setWarmingIds((prev) => {
      const next = new Set(prev);
      next.delete(backgroundId);
      return next;
    });
    if (url) {
      setReadyIds((prev) => new Set(prev).add(backgroundId));
    }
    if (!entry.silent) {
      stopElapsedClock();
      setPendingId(null);
    }
  };

  const showComposed = (backgroundId: string, url: string) => {
    // Cache-buster: the URL is stable per background but its bytes change when
    // a background is re-rendered, and `key={videoSrc}` needs a distinct value
    // to actually remount and refetch.
    setVideoSrc(`${url}?t=${Date.now()}`);
    setSelectedId(backgroundId);
    // A successful swap retires whatever went wrong before it — otherwise
    // handleVideoError's "re-rendering it now…" notice outlives the re-render
    // it was describing and sits there over a background that plays fine.
    setErrorMessage(null);
  };

  const pollCompose = (backgroundId: string, jobId: string, entry: InFlightCompose) => {
    const tick = async () => {
      if (!ownsCompose(backgroundId, entry)) return;

      if (Date.now() - entry.startedAt > COMPOSE_TIMEOUT_MS) {
        if (!entry.silent) {
          setErrorMessage(
            "Compositing timed out. Is the worker running? — npm run worker:green-screen"
          );
        }
        settleCompose(backgroundId, entry, undefined);
        return;
      }

      try {
        const res = await fetch(`/api/green-screen/compose/${encodeURIComponent(jobId)}`);
        const data: ComposeResponse = await res.json().catch(() => ({}) as ComposeResponse);

        if (!ownsCompose(backgroundId, entry)) return;

        if (data.status === "completed" && data.url) {
          if (!entry.silent) showComposed(backgroundId, data.url);
          settleCompose(backgroundId, entry, data.url);
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
          settleCompose(backgroundId, entry, undefined);
          return;
        }

        entry.timer = setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        if (!ownsCompose(backgroundId, entry)) return;
        if (!entry.silent) setErrorMessage("Lost contact with the compose worker.");
        settleCompose(backgroundId, entry, undefined);
      }
    };
    tick();
  };

  /**
   * Renders (or reuses) one background. `silent` is used for the on-load
   * pre-warm pass: it tracks progress in `warmingIds`/`readyIds` without
   * touching the video card or the big loader, so warming up the other four
   * swatches never interrupts whatever is currently on screen.
   */
  const ensureComposed = (backgroundId: string, opts: { silent: boolean }) => {
    const existing = inFlight.current.get(backgroundId);
    if (existing) {
      // Already rendering — almost always the on-load pre-warm pass. Attach to
      // it instead of firing a second request: the old code let two pollers for
      // one background share a single timer slot, so cancelling reached only
      // one of them and the orphan kept swapping the <video> src underneath the
      // live one. Promoting the existing render is also just correct — there is
      // exactly one ffmpeg pass per background either way.
      if (!opts.silent) existing.silent = false;
      return;
    }

    const entry: InFlightCompose = {
      cancelled: false,
      silent: opts.silent,
      startedAt: Date.now(),
    };
    inFlight.current.set(backgroundId, entry);
    setWarmingIds((prev) => new Set(prev).add(backgroundId));

    (async () => {
      try {
        const res = await fetch("/api/green-screen/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backgroundId }),
        });
        const data: ComposeResponse = await res.json().catch(() => ({}) as ComposeResponse);

        if (!ownsCompose(backgroundId, entry)) return;

        if (!res.ok) {
          if (!entry.silent) setErrorMessage(data.error || "Failed to start compositing.");
          settleCompose(backgroundId, entry, undefined);
          return;
        }

        if (data.status === "completed" && data.url) {
          if (!entry.silent) showComposed(backgroundId, data.url);
          settleCompose(backgroundId, entry, data.url);
          return;
        }

        if (data.jobId) {
          pollCompose(backgroundId, data.jobId, entry);
          return;
        }

        if (!entry.silent) setErrorMessage("The compose API returned no job to track.");
        settleCompose(backgroundId, entry, undefined);
      } catch (err) {
        if (!ownsCompose(backgroundId, entry)) return;
        const reason = err instanceof Error ? err.message : "";
        if (!entry.silent) setErrorMessage(reason || "Failed to reach the compose API.");
        settleCompose(backgroundId, entry, undefined);
      }
    })();
  };

  // Pre-warm every background as soon as the screen loads: the ffmpeg render
  // is the slow part, not the click, so pay that cost up front in the
  // background instead of making the operator wait on whichever swatch they
  // happen to pick first. Cached results (from a previous run of this screen)
  // resolve instantly and skip straight to "ready".
  useEffect(() => {
    GREEN_SCREEN_BACKGROUNDS.forEach((bg) => ensureComposed(bg.id, { silent: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseBackground = (backgroundId: string) => {
    if (backgroundId === selectedId || backgroundId === pendingId) return;
    setErrorMessage(null);

    if (readyIds.has(backgroundId)) {
      // Already rendered (pre-warmed or picked before) — swap instantly.
      setVideoSrc(`${composedOutputUrl(backgroundId)}?t=${Date.now()}`);
      setSelectedId(backgroundId);
      return;
    }

    setPendingId(backgroundId);
    startElapsedClock();
    ensureComposed(backgroundId, { silent: false });
  };

  const resetToOriginal = () => {
    setErrorMessage(null);
    setSelectedId(null);
    setVideoSrc(GREEN_SCREEN_SOURCE_URL);
  };

  /**
   * The "ready" dot means the client saw this background render successfully
   * at some point in this session — it does NOT mean the file is still on
   * disk right now (e.g. the cache got cleared, or a worker crash left a
   * short/corrupt file). A missing or unplayable src otherwise fails silently
   * as a black rectangle with zero feedback, so: un-mark it as ready and
   * kick off a fresh render instead of leaving the operator staring at black.
   */
  const handleVideoError = () => {
    if (!selectedId) {
      // The original take itself won't play — nothing to re-render, but say so
      // rather than leaving an unexplained black rectangle.
      setErrorMessage(
        `Could not play the studio take (${GREEN_SCREEN_SOURCE_URL}). Check that it exists under /public.`
      );
      return;
    }
    const backgroundId = selectedId;
    // Look the label up by id — `activeLabel` is derived from `selectedId`,
    // which this handler clears, so reading it here got the wrong name.
    const label =
      GREEN_SCREEN_BACKGROUNDS.find((b) => b.id === backgroundId)?.label ?? backgroundId;
    const attempts = videoRetryCount.current.get(backgroundId) ?? 0;

    setReadyIds((prev) => {
      const next = new Set(prev);
      next.delete(backgroundId);
      return next;
    });
    setSelectedId(null);
    // Fall back to the un-composited take so the card shows *something*
    // playable while we re-render, instead of holding the dead src as black.
    setVideoSrc(GREEN_SCREEN_SOURCE_URL);

    if (attempts >= MAX_VIDEO_RETRIES) {
      setErrorMessage(
        `"${label}" keeps failing to load — check the worker terminal for ffmpeg errors.`
      );
      return;
    }

    videoRetryCount.current.set(backgroundId, attempts + 1);
    setErrorMessage(`"${label}" failed to load — re-rendering it now…`);
    setPendingId(backgroundId);
    startElapsedClock();
    ensureComposed(backgroundId, { silent: false });
  };

  const isProcessing = pendingId !== null;
  const activeLabel = selectedId
    ? GREEN_SCREEN_BACKGROUNDS.find((b) => b.id === selectedId)?.label
    : "Original green screen";
  const stillWarmingCount = warmingIds.size;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono text-[10px] uppercase font-bold border border-emerald-500/30">
            Screen 07
          </span>
          <span className="text-sm text-slate-400">Live Virtual Background</span>
        </div>
        <span className="text-xs font-mono text-slate-500">
          Showing: <span className="text-slate-300">{activeLabel}</span>
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 py-10 gap-10">
        {/* Green-screen video card */}
        <section className="w-full max-w-4xl space-y-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>🎬</span> Studio Take
              </h2>
              <p className="text-xs text-slate-400">
                Chroma-keyed live against the background you pick below
              </p>
            </div>
            {selectedId && (
              <button
                onClick={resetToOriginal}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                ↺ Original
              </button>
            )}
          </div>

          <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video">
            <video
              key={videoSrc}
              src={videoSrc}
              autoPlay
              loop
              muted
              playsInline
              onError={handleVideoError}
              onLoadedData={() => {
                if (selectedId) videoRetryCount.current.delete(selectedId);
              }}
              className="w-full h-full object-cover"
            />

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
            <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
              {errorMessage}
            </div>
          )}
        </section>

        {/* Background picker */}
        <section className="w-full max-w-4xl space-y-3">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {GREEN_SCREEN_BACKGROUNDS.map((bg) => {
              const isActive = selectedId === bg.id;
              const isPending = pendingId === bg.id;
              const isWarming = warmingIds.has(bg.id) && !isPending;
              const isReady = readyIds.has(bg.id);
              return (
                <button
                  key={bg.id}
                  onClick={() => chooseBackground(bg.id)}
                  disabled={isProcessing}
                  className={`group relative rounded-xl overflow-hidden border-2 transition aspect-video ${
                    isActive
                      ? "border-emerald-400 shadow-lg shadow-emerald-950"
                      : "border-slate-800 hover:border-emerald-500/60"
                  } ${isProcessing && !isPending ? "opacity-40 cursor-not-allowed" : ""}`}
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
