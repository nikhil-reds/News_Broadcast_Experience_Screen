"use client";
import { useCallback, useEffect, useRef } from "react";
import { fetchCurrentSession } from "@/lib/current-session";

type RealtimeSelectionKind = "background" | "subtitle-language" | "industry" | "brand";

function localSelectionKey(kind: RealtimeSelectionKind, sessionId?: string | null) {
  return sessionId ? `broadcast-selection:${sessionId}:${kind}` : `broadcast-selection:${kind}`;
}

function localSelectionEvent(kind: RealtimeSelectionKind) {
  return `broadcast-selection:${kind}:changed`;
}

function readLocalSelection(kind: RealtimeSelectionKind, sessionId?: string | null) {
  try {
    return window.localStorage.getItem(localSelectionKey(kind)) ?? window.localStorage.getItem(localSelectionKey(kind, sessionId));
  } catch {
    return null;
  }
}

function writeLocalSelection(kind: RealtimeSelectionKind, value: string, sessionId?: string | null) {
  try {
    window.localStorage.setItem(localSelectionKey(kind), value);
    if (sessionId) window.localStorage.setItem(localSelectionKey(kind, sessionId), value);
    window.dispatchEvent(new CustomEvent(localSelectionEvent(kind), { detail: { value } }));
  } catch {}
}

export function useRealtimeSelection(kind: RealtimeSelectionKind, onState: (value: string, version: number) => void) {
  const socketRef = useRef<WebSocket | null>(null); const sessionRef = useRef<string | null>(null); const pendingRef = useRef<string | null>(null); const versionRef = useRef(0);
  const applyLocalState = useCallback((value: string) => { const version = Date.now(); versionRef.current = Math.max(versionRef.current, version); onState(value, version); }, [onState]);
  const save = useCallback((value: string) => { pendingRef.current = value; writeLocalSelection(kind, value, sessionRef.current); applyLocalState(value); const socket = socketRef.current; if (socket?.readyState === WebSocket.OPEN && sessionRef.current) { socket.send(JSON.stringify({ type: `${kind}:set`, sessionId: sessionRef.current, value })); pendingRef.current = null; } }, [applyLocalState, kind]);
  useEffect(() => { let closed = false; let timer: number | null = null; const url = process.env.NEXT_PUBLIC_AUDIO_LANGUAGE_WS_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3001/ws`;
    const localValue = readLocalSelection(kind);
    if (localValue) applyLocalState(localValue);
    const onLocalChange = (event: Event) => {
      const value = event instanceof CustomEvent && typeof event.detail?.value === "string" ? event.detail.value : readLocalSelection(kind);
      if (value) applyLocalState(value);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === localSelectionKey(kind) && event.newValue) applyLocalState(event.newValue);
    };
    window.addEventListener(localSelectionEvent(kind), onLocalChange);
    window.addEventListener("storage", onStorage);
    const connect = async () => { const session = await fetchCurrentSession(); if (closed || !session) return; sessionRef.current = session.id; const socket = new WebSocket(url); socketRef.current = socket;
      const sessionLocalValue = readLocalSelection(kind, session.id);
      if (sessionLocalValue) applyLocalState(sessionLocalValue);
      socket.onopen = () => { socket.send(JSON.stringify({ type: `${kind}:get`, sessionId: session.id })); if (pendingRef.current) { socket.send(JSON.stringify({ type: `${kind}:set`, sessionId: session.id, value: pendingRef.current })); pendingRef.current = null; } };
      socket.onmessage = (event) => { try { const message = JSON.parse(String(event.data)) as { type?: string; state?: { value?: string; version?: number } | null }; if ([`${kind}:state`, `${kind}:changed`, `${kind}:saved`].includes(message.type || "") && message.state && typeof message.state.value === "string" && typeof message.state.version === "number" && message.state.version >= versionRef.current) { versionRef.current = message.state.version; onState(message.state.value, message.state.version); } } catch {} };
      socket.onclose = () => { if (!closed) timer = window.setTimeout(connect, 2000); };
    }; void connect(); return () => { closed = true; if (timer) clearTimeout(timer); window.removeEventListener(localSelectionEvent(kind), onLocalChange); window.removeEventListener("storage", onStorage); socketRef.current?.close(); };
  }, [applyLocalState, kind, onState]);
  return save;
}
