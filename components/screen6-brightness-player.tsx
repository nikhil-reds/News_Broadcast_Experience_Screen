"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCurrentSession } from "@/lib/current-session";
import { useScreenPublication } from "@/lib/use-screen-publication";

const MIN_BRIGHTNESS = 1;
const MAX_BRIGHTNESS = 100;
const BRIGHTNESS_STEP = 5;
const WS_RECONNECT_MS = 2000;

function clampBrightness(value: number) {
  return Math.min(MAX_BRIGHTNESS, Math.max(MIN_BRIGHTNESS, value));
}

function sliderVars(brightness: number): React.CSSProperties {
  const pct = brightness / MAX_BRIGHTNESS;
  const switchLightMin = 40;
  const switchLightMax = 100;
  const l1 = pct * (switchLightMax - switchLightMin) + switchLightMin;
  const levels = [l1, l1 - 10, l1 - 37].map((light) => Math.max(0, light));
  const thumbHue = pct * 120;
  const thumbHSL = `${thumbHue},90.4%,44.9%`;

  return {
    "--l1": `hsl(228,9.8%,${levels[0]}%)`,
    "--l2": `hsl(228,9.8%,${levels[1]}%)`,
    "--l3": `hsl(228,9.8%,${levels[2]}%)`,
    "--p": `hsl(${thumbHSL})`,
    "--pT": `hsla(${thumbHSL},0)`,
  } as React.CSSProperties;
}

/** Screen 06: muted Gemini reel with a live brightness control rail. */
export default function Screen6BrightnessPlayer() {
  const [brightness, setBrightness] = useState(MAX_BRIGHTNESS);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastVersionRef = useRef(0);
  const pendingBrightnessRef = useRef<number | null>(null);
  const publication = useScreenPublication<{ videoUrl: string; filename: string }>(6);
  const controlVars = useMemo(() => sliderVars(brightness), [brightness]);

  const applyRemoteBrightness = useCallback((state: unknown) => {
    if (!state || typeof state !== "object") return;
    const candidate = state as { brightness?: unknown; version?: unknown };
    if (typeof candidate.version !== "number" || candidate.version < lastVersionRef.current) return;
    if (typeof candidate.brightness !== "number") return;
    lastVersionRef.current = candidate.version;
    pendingBrightnessRef.current = null;
    setBrightness(clampBrightness(candidate.brightness));
  }, []);

  const changeBrightness = useCallback((value: number) => {
    const nextBrightness = clampBrightness(value);
    setBrightness(nextBrightness);
    pendingBrightnessRef.current = nextBrightness;
    const socket = socketRef.current;
    if (!sessionIdRef.current || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      type: "brightness:set",
      sessionId: sessionIdRef.current,
      brightness: nextBrightness,
    }));
    pendingBrightnessRef.current = null;
  }, []);

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
    const websocketUrl = process.env.NEXT_PUBLIC_AUDIO_LANGUAGE_WS_URL ||
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;

    const connect = async () => {
      const session = await fetchCurrentSession();
      if (disposed || !session) return;
      sessionIdRef.current = session.id;
      const socket = new WebSocket(websocketUrl);
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "brightness:get", sessionId: session.id }));
        if (pendingBrightnessRef.current !== null) {
          socket.send(JSON.stringify({
            type: "brightness:set",
            sessionId: session.id,
            brightness: pendingBrightnessRef.current,
          }));
          pendingBrightnessRef.current = null;
        }
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; state?: unknown };
          if (message.type === "brightness:state" || message.type === "brightness:changed" || message.type === "brightness:saved") {
            applyRemoteBrightness(message.state);
          }
        } catch {
          // Ignore malformed gateway messages; reconnect will request the latest state.
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
  }, [applyRemoteBrightness]);

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
    <main className="h-screen w-screen overflow-hidden bg-[#15171b] text-white">
      <div className="flex h-full w-full flex-row gap-3 p-3">
        <section className="relative h-full min-w-0 flex-1 overflow-hidden rounded-lg bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          {videoUrl ? (
            <video
              key={videoUrl}
              ref={videoRef}
              src={videoUrl}
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
              style={{ filter: `brightness(${brightness}%)` }}
            />
          ) : null}

          {!videoUrl && <div className="h-full w-full bg-black" />}

          {publication.status === "preparing" && (
            <div className="absolute bottom-6 left-6 rounded-lg border border-slate-700 bg-slate-950/85 px-3 py-2 font-mono text-xs text-slate-400">
              Preparing next reel...
              {publication.progress ? ` ${publication.progress.completed}/${publication.progress.total}` : ""}
            </div>
          )}

          {publication.status === "failed" && (
            <div className="absolute bottom-6 left-6 rounded-lg border border-red-800 bg-red-950/85 px-3 py-2 font-mono text-xs text-red-200">
              Next reel failed - showing last good one
            </div>
          )}
        </section>

        <aside
          className="screen6-brightness-panel flex h-full w-[clamp(132px,12vw,190px)] shrink-0 items-center justify-center rounded-lg px-4 py-6 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
          style={controlVars}
        >
          <form className="flex h-full w-full items-center justify-center" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="brightness" className="sr-only">
              Brightness
            </label>
            <div className="flex h-full w-full flex-col items-center justify-between gap-4 py-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-700">Up</span>
              <input
                type="range"
                id="brightness"
                name="brightness"
                min={MIN_BRIGHTNESS}
                max={MAX_BRIGHTNESS}
                value={brightness}
                onChange={(event) => changeBrightness(Number(event.target.value))}
                className="screen6-brightness-slider"
                aria-valuetext={`${brightness}% brightness`}
              />
              <div className="flex flex-col items-center gap-1">
                <span className="text-xl font-black leading-none text-slate-800">{brightness}%</span>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-700">Down</span>
              </div>
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
}
