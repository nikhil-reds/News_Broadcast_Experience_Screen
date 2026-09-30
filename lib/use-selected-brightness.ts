"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCurrentSession } from "@/lib/current-session";

const MIN_BRIGHTNESS = 1;
const MAX_BRIGHTNESS = 100;
const BRIGHTNESS_POLL_MS = 3000;
const WS_RECONNECT_MS = 2000;

function clampBrightness(value: number) {
  return Math.min(MAX_BRIGHTNESS, Math.max(MIN_BRIGHTNESS, value));
}

function isBrightness(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_BRIGHTNESS && value <= MAX_BRIGHTNESS;
}

export function useSelectedBrightness() {
  const [brightness, setBrightness] = useState(MAX_BRIGHTNESS);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const lastVersionRef = useRef(0);

  const applyBrightnessState = useCallback((state: unknown) => {
    if (!state || typeof state !== "object") return;
    const candidate = state as { brightness?: unknown; version?: unknown };
    if (typeof candidate.version !== "number" || candidate.version < lastVersionRef.current) return;
    if (!isBrightness(candidate.brightness)) return;
    lastVersionRef.current = candidate.version;
    setBrightness(candidate.brightness);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchBrightness = async () => {
      const session = await fetchCurrentSession();
      if (!cancelled && isBrightness(session?.selectedBrightness)) {
        setBrightness(clampBrightness(session.selectedBrightness));
      }
    };

    fetchBrightness();
    const interval = window.setInterval(fetchBrightness, BRIGHTNESS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const websocketUrl = process.env.NEXT_PUBLIC_AUDIO_LANGUAGE_WS_URL ||
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;

    const connect = async () => {
      const session = await fetchCurrentSession();
      if (disposed || !session) return;
      const socket = new WebSocket(websocketUrl);
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "brightness:get", sessionId: session.id }));
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; state?: unknown };
          if (message.type === "brightness:state" || message.type === "brightness:changed" || message.type === "brightness:saved") {
            applyBrightnessState(message.state);
          }
        } catch {
          /* polling keeps this in sync if websocket data is malformed */
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
  }, [applyBrightnessState]);

  return brightness;
}
