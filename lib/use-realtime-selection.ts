"use client";
import { useCallback, useEffect, useRef } from "react";
import { fetchCurrentSession } from "@/lib/current-session";

export function useRealtimeSelection(kind: "background" | "subtitle-language" | "industry" | "brand", onState: (value: string, version: number) => void) {
  const socketRef = useRef<WebSocket | null>(null); const sessionRef = useRef<string | null>(null); const pendingRef = useRef<string | null>(null); const versionRef = useRef(0);
  const save = useCallback((value: string) => { pendingRef.current = value; const socket = socketRef.current; if (socket?.readyState === WebSocket.OPEN && sessionRef.current) { socket.send(JSON.stringify({ type: `${kind}:set`, sessionId: sessionRef.current, value })); pendingRef.current = null; } }, [kind]);
  useEffect(() => { let closed = false; let timer: number | null = null; const url = process.env.NEXT_PUBLIC_AUDIO_LANGUAGE_WS_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3001/ws`;
    const connect = async () => { const session = await fetchCurrentSession(); if (closed || !session) return; sessionRef.current = session.id; const socket = new WebSocket(url); socketRef.current = socket;
      socket.onopen = () => { socket.send(JSON.stringify({ type: `${kind}:get`, sessionId: session.id })); if (pendingRef.current) { socket.send(JSON.stringify({ type: `${kind}:set`, sessionId: session.id, value: pendingRef.current })); pendingRef.current = null; } };
      socket.onmessage = (event) => { try { const message = JSON.parse(String(event.data)) as { type?: string; state?: { value?: string; version?: number } | null }; if ([`${kind}:state`, `${kind}:changed`, `${kind}:saved`].includes(message.type || "") && message.state && typeof message.state.value === "string" && typeof message.state.version === "number" && message.state.version >= versionRef.current) { versionRef.current = message.state.version; onState(message.state.value, message.state.version); } } catch {} };
      socket.onclose = () => { if (!closed) timer = window.setTimeout(connect, 2000); };
    }; void connect(); return () => { closed = true; if (timer) clearTimeout(timer); socketRef.current?.close(); };
  }, [kind, onState]);
  return save;
}
