"use client";

import { useCallback, useEffect, useState } from "react";

interface MediaEvent {
  raw: string;
  command: string;
  value: string;
  at: string;
}

interface Esp32Status {
  connected: boolean;
  path: string;
  baudRate: number;
  lastError: string | null;
}

type Esp32Command =
  | { command: "BUTTON"; value: "PRESSED" | "RELEASED" }
  | { command: "CLICK"; value: "PLAY_PAUSE" }
  | { command: "ROTARY"; value: number };

function parseEsp32Payload(payload: unknown): Esp32Command | null {
  if (typeof payload !== "string") return null;

  const message = payload.replace(/^BLE SEND:\s*/i, "").trim();
  if (message === "11") return { command: "BUTTON", value: "PRESSED" };
  if (message === "22") return { command: "BUTTON", value: "RELEASED" };

  const match = /^(BUTTON|CLICK|ROTARY)\[(\d+)\]$/i.exec(message);
  if (!match) return null;

  const [, type, rawValue] = match;
  const value = Number(rawValue);

  if (type.toUpperCase() === "BUTTON" && (value === 0 || value === 1)) {
    return { command: "BUTTON", value: value === 1 ? "PRESSED" : "RELEASED" };
  }

  if (type.toUpperCase() === "CLICK" && value === 1) {
    return { command: "CLICK", value: "PLAY_PAUSE" };
  }

  if (type.toUpperCase() === "ROTARY") {
    return { command: "ROTARY", value: Math.max(0, Math.min(100, value)) };
  }

  return null;
}

export default function SensorPage() {
  const [events, setEvents] = useState<MediaEvent[]>([]);
  const [esp32Status, setEsp32Status] = useState<Esp32Status | null>(null);
  const [mediaPlaying, setMediaPlaying] = useState(false);
  const [mediaVolume, setMediaVolume] = useState(50);
  const [buttonPressed, setButtonPressed] = useState(false);
  const [lastEvent, setLastEvent] = useState("Waiting for ESP32 media keys…");

  const record = useCallback((command: string, value: string, raw = `ESP32:${command}:${value}`) => {
    const at = new Date().toISOString();
    setLastEvent(`${command.replaceAll("_", " ")} · ${value}`);
    setEvents((previous) => [
      { raw, command, value, at },
      ...previous.slice(0, 11),
    ]);
  }, []);

  const handleEsp32Payload = useCallback((payload: unknown) => {
    const event = parseEsp32Payload(payload);
    if (!event) return false;

    const raw = typeof payload === "string" ? payload.trim() : "ESP32 payload";

    if (event.command === "BUTTON") {
      setButtonPressed(event.value === "PRESSED");
      record("BUTTON", event.value, raw);
      return true;
    }

    if (event.command === "CLICK") {
      setMediaPlaying((playing) => {
        const next = !playing;
        record("CLICK", next ? "PLAYING" : "PAUSED", raw);
        return next;
      });
      return true;
    }

    setMediaVolume(event.value);
    record("ROTARY", `${event.value}%`, raw);
    return true;
  }, [record]);

  useEffect(() => {
    const onMediaKey = (event: KeyboardEvent) => {
      if (event.key === "MediaPlayPause") {
        if (event.repeat) return;
        event.preventDefault();
        setMediaPlaying((playing) => {
          const next = !playing;
          record("PLAY_PAUSE", next ? "PLAYING" : "PAUSED");
          return next;
        });
      } else if (event.key === "MediaPlay" || event.key === "MediaPause") {
        event.preventDefault();
        const playing = event.key === "MediaPlay";
        setMediaPlaying(playing);
        record(playing ? "PLAY" : "PAUSE", playing ? "PLAYING" : "PAUSED");
      } else if (event.key === "AudioVolumeUp" || event.key === "AudioVolumeDown") {
        event.preventDefault();
        const delta = event.key === "AudioVolumeUp" ? 5 : -5;
        setMediaVolume((volume) => {
          const next = Math.max(0, Math.min(100, volume + delta));
          record(delta > 0 ? "VOLUME_UP" : "VOLUME_DOWN", `${next}%`);
          return next;
        });
      }
    };

    const onEsp32Media = (event: Event) => {
      handleEsp32Payload((event as CustomEvent<unknown>).detail);
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      handleEsp32Payload(event.data);
    };

    window.addEventListener("keydown", onMediaKey);
    window.addEventListener("esp32-media", onEsp32Media);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onMediaKey);
      window.removeEventListener("esp32-media", onEsp32Media);
      window.removeEventListener("message", onMessage);
    };
  }, [handleEsp32Payload, record]);

  useEffect(() => {
    const source = new EventSource("/api/esp32/events");

    source.addEventListener("status", (event) => {
      try {
        setEsp32Status(JSON.parse((event as MessageEvent).data));
      } catch (err) {
        console.error("Bad ESP32 status payload:", err);
      }
    });

    source.addEventListener("frame", (event) => {
      try {
        const frame = JSON.parse((event as MessageEvent).data) as MediaEvent;
        const handled = handleEsp32Payload(frame.raw);
        if (!handled) record(frame.command, frame.value, frame.raw);
        setEsp32Status((previous) => previous ? { ...previous, connected: true } : previous);
      } catch (err) {
        console.error("Bad ESP32 frame payload:", err);
      }
    });

    source.onerror = () => {
      setEsp32Status((previous) => previous ? { ...previous, connected: false } : previous);
    };

    return () => source.close();
  }, [handleEsp32Payload, record]);

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 font-sans text-slate-100 sm:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-cyan-500/25 bg-slate-900/40 p-7 shadow-2xl shadow-cyan-950/20 backdrop-blur-md sm:p-10">
          <div className="flex items-start justify-between gap-5 border-b border-slate-800 pb-6">
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.24em] text-cyan-300">
                <span className={`h-2 w-2 rounded-full ${esp32Status?.connected ? "animate-pulse bg-emerald-400" : "bg-rose-400"}`} />
                COM3 ESP32
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">ESP32 Media Controller</h1>
              <p className="mt-2 text-sm text-slate-400">
                {esp32Status
                  ? `${esp32Status.path} @ ${esp32Status.baudRate}${esp32Status.lastError ? ` · ${esp32Status.lastError}` : ""}`
                  : "Connecting to ESP32 serial stream..."}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider ${buttonPressed ? "border-amber-400/50 bg-amber-400/15 text-amber-200" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"}`}>
              {buttonPressed ? "BUTTON PRESSED" : esp32Status?.connected ? "LISTENING" : "PORT OFFLINE"}
            </span>
          </div>

          <div className="mt-10 grid gap-10 sm:grid-cols-2">
            <div className="flex flex-col items-center text-center">
              <div className={`flex h-44 w-44 items-center justify-center rounded-full border-8 shadow-2xl transition-colors ${buttonPressed ? "border-amber-400 bg-amber-500/15 shadow-amber-950/40" : mediaPlaying ? "border-emerald-400/70 bg-emerald-500/15 shadow-emerald-950/50" : "border-slate-700 bg-slate-950 shadow-black/40"}`}>
                <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full border border-slate-700 bg-slate-900">
                  <span className="text-4xl">{mediaPlaying ? "❚❚" : "▶"}</span>
                  <span className="mt-2 font-mono text-[10px] tracking-widest text-slate-400">MEDIA BUTTON</span>
                </div>
              </div>
              <p className={`mt-5 font-mono text-sm font-bold tracking-wider ${mediaPlaying ? "text-emerald-300" : "text-slate-300"}`}>
                {mediaPlaying ? "PLAYING" : "PAUSED"}
              </p>
              <p className="mt-1 text-xs text-slate-500">{buttonPressed ? "BUTTON[1] received" : "CLICK[1] toggles playback"}</p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div
                className="flex h-44 w-44 items-center justify-center rounded-full p-3 shadow-2xl shadow-cyan-950/35"
                style={{ background: `conic-gradient(#22d3ee ${mediaVolume}%, #1e293b 0)` }}
              >
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-slate-700 bg-slate-950">
                  <span className="font-mono text-4xl font-extrabold text-cyan-300">{mediaVolume}</span>
                  <span className="mt-1 font-mono text-xs tracking-widest text-slate-400">VOLUME %</span>
                </div>
              </div>
              <p className="mt-5 font-mono text-sm font-bold tracking-wider text-cyan-300">ROTARY VOLUME</p>
              <p className="mt-1 text-xs text-slate-500">Turn clockwise or counter-clockwise</p>
            </div>
          </div>

          <div className="mt-10 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 font-mono text-xs text-slate-400">
            <span className="text-slate-600">LAST EVENT / </span>{lastEvent}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 shadow-2xl shadow-black/25 backdrop-blur-md sm:p-7">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="font-mono text-sm font-extrabold tracking-wider text-slate-200">HARDWARE EVENT LOG</h2>
              <p className="mt-1 text-xs text-slate-500">Events received while this page is focused</p>
            </div>
            <button onClick={() => setEvents([])} className="font-mono text-xs text-cyan-300 hover:text-cyan-100">CLEAR</button>
          </div>

          <div className="mt-4 divide-y divide-slate-800/80">
            {events.length ? events.map((event) => (
              <div key={`${event.at}-${event.raw}`} className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs font-bold text-cyan-300">{event.command.replaceAll("_", " ")}</span>
                  <span className="font-mono text-xs text-slate-300">{event.value}</span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-slate-600">{new Date(event.at).toLocaleTimeString()}</p>
              </div>
            )) : (
              <div className="py-20 text-center">
                <p className="font-mono text-sm text-slate-500">AWAITING INPUT</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">Use the ESP32 play/pause button or rotate the volume knob.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
