"use client";
import { selectionFetch } from "@/lib/screen-selection-writes";

import styles from "./brightness-preview.module.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWorkflowDirty, useWorkflowReady } from "@/lib/workflow-ready";
import { useSelectedBrightness } from "@/lib/use-selected-brightness";
import { fetchCurrentSession } from "@/lib/current-session";
import { useScreenPublication } from "@/lib/use-screen-publication";

const MIN_BRIGHTNESS = 0;
const MAX_BRIGHTNESS = 200;
const BRIGHTNESS_STEP = 5;

function clampBrightness(value: number) {
  return Math.min(MAX_BRIGHTNESS, Math.max(MIN_BRIGHTNESS, value));
}

async function saveBrightnessSelection(sessionId: string, brightness: number) {
  return selectionFetch("/api/brightness/selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, brightness }),
  });
}

/** Screen 06: muted preview with a live brightness control rail. */
export default function Screen6BrightnessPlayer() {
  const remoteBrightness = useSelectedBrightness();
  const [draft, setDraft] = useState<number | null>(null);
  const brightness = draft ?? remoteBrightness;
  const [sessionId, setSessionId] = useState<string | null>(null);
  useWorkflowDirty(brightness !== remoteBrightness);
  useWorkflowReady(Boolean(sessionId));
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const publication = useScreenPublication<{ videoUrl: string; filename: string }>(6);
  const [comparing, setComparing] = useState(false);

  const changeBrightness = useCallback((value: number) => setDraft(clampBrightness(value)), []);
  useEffect(() => {
    const commit = () => {
      if (sessionId) void saveBrightnessSelection(sessionId, brightness).then(response => {
        if (response.ok) setDraft(null);
      }).catch(() => {});
    };
    window.addEventListener("apply-screen-brightness", commit);
    return () => window.removeEventListener("apply-screen-brightness", commit);
  }, [brightness, sessionId]);

  useEffect(() => {
    if (!publication.assets?.videoUrl) return;
    const syncTimer = window.setTimeout(() => {
      setVideoUrl(publication.assets?.videoUrl ?? null);
    }, 0);
    return () => window.clearTimeout(syncTimer);
  }, [publication.assets]);

  useEffect(() => {
    if (!videoUrl || !videoRef.current) return;
    videoRef.current.play().catch(() => {});
  }, [videoUrl]);

  useEffect(() => {
    let disposed = false;
    const load = () => { void fetchCurrentSession().then(session => {
      if (!disposed && session) setSessionId(session.id);
    }); };
    load();
    const timer = sessionId ? undefined : window.setInterval(load, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [sessionId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      changeBrightness(brightness + (event.key === "ArrowUp" ? BRIGHTNESS_STEP : -BRIGHTNESS_STEP));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [brightness, changeBrightness]);

  return (
    <main className={styles.stage}>
      <button type="button" className={styles.picture} aria-label="Hold to compare with original brightness"
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setComparing(true); }}
        onPointerUp={() => setComparing(false)} onLostPointerCapture={() => setComparing(false)}
        onPointerCancel={() => setComparing(false)} onBlur={() => setComparing(false)}
        onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setComparing(true); } }}
        onKeyUp={event => { if (event.key === " " || event.key === "Enter") setComparing(false); }}>
        {videoUrl && <video ref={videoRef} key={videoUrl} src={videoUrl} muted autoPlay loop playsInline
          style={{ filter: `brightness(${comparing ? 100 : brightness}%)` }} />}
      </button>
      <div className={styles.badge}><i aria-hidden="true" />Edited video<span>{remoteBrightness}% on air</span></div>
      {comparing && <div className={styles.original}>Original · 100%</div>}
      <div className={styles.rail}>
        <div className={styles.fill} style={{height: `${brightness / 2}%`}} />
        <svg className={styles.sun} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5m0 15V22M2 12h2.5m15 0H22M5 5l1.8 1.8m10.4 10.4L19 19M5 19l1.8-1.8M17.2 6.8 19 5"/>
        </svg>
        <span className={styles.dim} aria-hidden="true">○</span>
        <output className={styles.value} htmlFor="brightness">{brightness}<small>%</small></output>
        <input type="range" id="brightness" aria-label="Brightness" aria-orientation="vertical" aria-valuetext={`${brightness}% brightness`}
          min={MIN_BRIGHTNESS} max={MAX_BRIGHTNESS} value={brightness}
          onChange={event => changeBrightness(Number(event.target.value))} />
      </div>
      <div className={styles.footer}>
        <span>{publication.status === "failed" ? "Next reel failed · showing last good reel" : publication.status === "preparing" ? `Preparing next reel${publication.progress ? " · " + publication.progress.completed + "/" + publication.progress.total : "…"}` : "Hold the video to compare"}</span>
        {brightness !== 100 && <button type="button" onClick={() => changeBrightness(100)}>Reset to 100%</button>}
      </div>
    </main>
  );
}
