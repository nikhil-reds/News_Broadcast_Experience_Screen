"use client";

import styles from "./workflow-button.module.css";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { workflowRun, type WorkflowView } from "@/lib/screen-workflow";
import { flushScreenSelections } from "@/lib/screen-selection-writes";
import { WorkflowDirtyContext, WorkflowReadyContext } from "@/lib/workflow-ready";

export default function TriggeredBroadcastScreen({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const match = /^\/screen([1-9]|1[0-2])\/?$/.exec(pathname);
  if (!match) return children;
  return <ScreenWorkflowGate key={pathname} screen={Number(match[1])}>{children}</ScreenWorkflowGate>;
}
function ScreenWorkflowGate({ screen, children }: { screen: number; children: ReactNode }) {
  const [handoff, setHandoff] = useState<{
    started: number; sessionId: string; run: number; targets: number[]; saved: boolean;
  } | null>(null);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const watching = useRef(false);
  const [view, setView] = useState<WorkflowView | null>(null);
  const [dirty, setDirty] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectionReady, setSelectionReady] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const suspendedMedia = useRef<Array<{
    index: number;
    muted: boolean;
    volume: number;
  }>>([]);
  const inFlight = useRef(false);
  const latest = useRef<WorkflowView | null>(null);
  const applied = view?.state?.applied.includes(screen) ?? false;
  const active = view?.active.includes(screen) ?? false;
  const retained = screen <= 10 && applied;
  const visible = retained || (active && (screen === 7 || Boolean(view?.ready)));
  const needsVideo = [1, 2, 3, 6, 7, 8, 11, 12].includes(screen);
  const enabled = connected && ((active && Boolean(view?.ready)) || (retained && (dirty || Boolean(error)))) && (!needsVideo || mediaReady) && (![5, 6, 7, 8].includes(screen) || selectionReady) && !busy && !handoff;

  const suspendAudibleMedia = useCallback(() => {
    const mediaElements = Array.from(contentRef.current?.querySelectorAll<HTMLMediaElement>("audio, video") ?? []);
    suspendedMedia.current = mediaElements.flatMap((element, index) =>
      !element.paused && !element.muted && element.volume > 0
        ? [{ index, muted: element.muted, volume: element.volume }]
        : []
    );
    for (const { index } of suspendedMedia.current) {
      const element = mediaElements[index];
      if (!element) continue;
      element.pause();
      element.muted = true;
    }
  }, []);

  const resumeSuspendedMedia = useCallback(() => {
    const snapshots = suspendedMedia.current;
    if (!snapshots.length) return;
    suspendedMedia.current = [];
    const mediaElements = Array.from(contentRef.current?.querySelectorAll<HTMLMediaElement>("audio, video") ?? []);
    for (const { index, muted, volume } of snapshots) {
      const element = mediaElements[index];
      if (!element) continue;
      element.muted = muted;
      element.volume = volume;
      void element.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/screen-workflow?screen=${screen}${watching.current ? "&handoff=1" : ""}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error();
        const next = await response.json() as WorkflowView;
        if (!disposed && !inFlight.current) {
          const old = latest.current;
          if (next.state?.sessionId !== old?.state?.sessionId || (next.state?.revision ?? 0) >= (old?.state?.revision ?? 0)) {
            latest.current = next; setView(next);
          }
          setConnected(true);
        }
      } catch { if (!disposed) setConnected(false); }
      if (!disposed) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [screen]);

  useEffect(() => {
    const check = () => {
      const videos = contentRef.current?.querySelectorAll("video");
      setMediaReady(Boolean(visible && videos?.length && Array.from(videos).every(video => video.readyState >= 2 && !video.error)));
    };
    check();
    const timer = setInterval(check, 250);
    return () => clearInterval(timer);
  }, [visible, view?.state?.sessionId]);

  const sessionId = view?.state?.sessionId;
  const run = view?.state ? workflowRun(view.state) : undefined;
  useEffect(() => {
    if (!active || screen < 2 || screen > 11 || !enabled || !sessionId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const acknowledge = async () => {
      try {
        const response = await fetch("/api/screen-workflow", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screen, sessionId, run }), signal: controller.signal,
        });
        if (response.ok) return;
      } catch { /* Retry while this display is ready. */ }
      if (!controller.signal.aborted) timer = setTimeout(acknowledge, 1000);
    };
    void acknowledge();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [active, enabled, run, screen, sessionId]);

  const started = handoff?.started;
  useEffect(() => {
    if (started === undefined) return;
    const timer = setTimeout(() => setMinimumElapsed(true), Math.max(0, 1800 - (performance.now() - started)));
    return () => clearTimeout(timer);
  }, [started]);

  const waiting = handoff?.targets.filter(target =>
    !view?.state?.applied.includes(target) && !view?.readyDisplays?.includes(target)) ?? [];
  useEffect(() => {
    if (!handoff) return;
    if (handoff.sessionId !== sessionId || handoff.run !== run) {
      watching.current = false; setHandoff(null); setConfirmed(false);
    } else if (handoff.saved && minimumElapsed && waiting.length === 0) {
      setConfirmed(true);
    }
  }, [handoff, sessionId, run, minimumElapsed, waiting.length]);

  useEffect(() => {
    if (!confirmed) return;
    const timer = setTimeout(() => {
      watching.current = false; setHandoff(null); setConfirmed(false);
    }, 420);
    return () => clearTimeout(timer);
  }, [confirmed]);

  const apply = async () => {
    if (!enabled || inFlight.current || !view?.state) return;
    inFlight.current = true; setBusy(true); setError("");
    if (screen <= 10) {
      watching.current = true;
      setMinimumElapsed(false);
      setHandoff({ started: performance.now(), sessionId: view.state.sessionId,
        run: workflowRun(view.state), targets: [], saved: false });
    }
    try {
      // Stop sound on the screen being handed off. Retained screens restore
      // exactly the media that was audible on the viewer's next interaction.
      // Screen 12 is the final published output, so it keeps playing.
      if (screen <= 11) suspendAudibleMedia();
      if (screen === 5) window.dispatchEvent(new Event("apply-screen-audio"));
      if (screen === 6) window.dispatchEvent(new Event("apply-screen-brightness"));
      if (screen === 7) window.dispatchEvent(new Event("apply-screen-background"));
      if (screen === 8) window.dispatchEvent(new Event("apply-screen-subtitles"));
      if (screen === 9) window.dispatchEvent(new Event("apply-screen-industry"));
      if (screen === 10) window.dispatchEvent(new Event("apply-screen-brand"));
      await flushScreenSelections();
      if (retained) {
        setHandoff(current => current && { ...current, saved: true });
        return;
      }
      const response = await fetch("/api/screen-workflow", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: view.state.sessionId, screen }), signal: AbortSignal.timeout(20000),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Unable to save progress");
      latest.current = next; setView(next);
      if (screen <= 10) {
        const targets = (next.active as number[]).filter(target => !view.active.includes(target));
        setHandoff(current => current && { ...current, saved: true, targets });
      }
    } catch (cause) { watching.current = false; setHandoff(null); setError(cause instanceof Error ? cause.message : "Unable to save progress. Please retry."); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const showApplied = handoff ? confirmed : applied && !dirty && !error;
  const applying = Boolean(handoff && !confirmed);
  const showContent = visible || Boolean(handoff);
  return (
    <div className="relative min-h-screen bg-black text-white">
      {showContent ? (
        <WorkflowReadyContext.Provider value={setSelectionReady}>
          <WorkflowDirtyContext.Provider value={setDirty}>
            <div
              ref={contentRef}
              key={`${sessionId}:${run}:${view?.state?.restartAt ?? 0}`}
              inert={busy || Boolean(handoff)}
              onPointerDownCapture={resumeSuspendedMedia}
              onKeyDownCapture={resumeSuspendedMedia}
            >{children}</div>
          </WorkflowDirtyContext.Provider>
        </WorkflowReadyContext.Provider>
      ) : (
        <div className="fixed inset-0 flex items-center justify-center bg-black">
          {/* Keep the existing branded intro looping while this display waits. */}
          <img src="/amagi-logo-white.svg" alt="Amagi" className="w-64 max-w-[60vw]" />
          {!(screen === 12 && applied) && <video autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.style.display = "none"; }}>
            <source src="/bg-video/1.1.mp4" type="video/mp4" />
          </video>}
        </div>
      )}
      {showContent && <div className={`fixed right-6 z-[9999] flex max-w-sm flex-col items-end gap-3 ${screen === 11 ? "top-6" : "bottom-6"}`}>
        <p role="status" className="rounded-lg bg-black/80 px-3 py-2 text-sm empty:hidden">
          {error || (applying && minimumElapsed && waiting.length ? `Waiting for Screen ${waiting.join(" and ")}…` : applying || confirmed ? "" : !connected ? "Connecting to screens…" : busy ? "Saving…" : active && !enabled ? "Preparing content…" : "")}
        </p>
        <button type="button" onClick={apply} disabled={!enabled || Boolean(showApplied)} aria-busy={busy || applying}
          className={`${styles.button} ${screen <= 10 ? styles.applyButton : ""} ${applying ? styles.applying : ""} ${showApplied ? styles.applied : ""}`}>
          <span aria-live="polite">{screen === 12 ? (applied ? "Published" : "Publish") : screen === 11 ? (applied ? "Broadcasted" : "Broadcast") : (showApplied ? "Applied" : applying ? "Applying…" : "Apply")}</span>
          <span className={styles.icon} aria-hidden="true">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {applying ? <circle className={styles.ring} cx="12" cy="12" r="8" strokeDasharray="36 15" /> : showApplied ? <path d="m5 12 4 4 10-10" /> : <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>}
            </svg>
          </span>
        </button>
      </div>}
    </div>
  );
}
