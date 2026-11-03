"use client";
import { selectionFetch } from "@/lib/screen-selection-writes";
import { useCallback, useEffect, useRef } from "react";
import { fetchCurrentSession } from "@/lib/current-session";

type RealtimeSelectionKind = "background" | "subtitle-language" | "industry" | "industry-preview" | "brand";

function localSelectionKey(kind: RealtimeSelectionKind, sessionId?: string | null) {
  return sessionId ? `broadcast-selection:${sessionId}:${kind}` : `broadcast-selection:${kind}`;
}

function localSelectionEvent(kind: RealtimeSelectionKind) {
  return `broadcast-selection:${kind}:changed`;
}

function readLocalSelection(kind: RealtimeSelectionKind, sessionId?: string | null) {
  try {
    // A selection is scoped to a broadcast session. Prefer that value over a
    // generic browser cache left by an older session.
    if (kind === "industry-preview") return sessionId ? window.localStorage.getItem(localSelectionKey(kind, sessionId)) : null;
    return (sessionId ? window.localStorage.getItem(localSelectionKey(kind, sessionId)) : null) ?? window.localStorage.getItem(localSelectionKey(kind));
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
  // Local state is only an optimistic display value. It must not receive a
  // synthetic Date.now() version: that would make a real server state (from
  // Screen 10) look older and leave Screens 11/12 showing a stale brand.
  const applyLocalState = useCallback((value: string) => onState(value, versionRef.current), [onState]);
  const persist = useCallback(async (sessionId: string, value: string) => {
    const response = await selectionFetch("/api/realtime-selections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, sessionId, value }),
    });
    const data = await response.json().catch(() => null) as { state?: { value?: string; version?: number } } | null;
    if (response.ok && typeof data?.state?.value === "string" && typeof data.state.version === "number") {
      versionRef.current = Math.max(versionRef.current, data.state.version);
      onState(data.state.value, data.state.version);
    }
  }, [kind, onState]);
  const save = useCallback((value: string) => {
    pendingRef.current = value; writeLocalSelection(kind, value, sessionRef.current); applyLocalState(value);
    const sessionId = sessionRef.current;
    // The HTTP endpoint writes to Redis, whose pub/sub channel is what the
    // WebSocket gateway broadcasts. One authoritative write avoids competing
    // duplicate socket and HTTP saves that can make state churn.
    if (sessionId) void persist(sessionId, value).finally(() => { if (pendingRef.current === value) pendingRef.current = null; });
    else void fetchCurrentSession().then((session) => { if (session) { sessionRef.current = session.id; void persist(session.id, value).finally(() => { if (pendingRef.current === value) pendingRef.current = null; }); } });
  }, [applyLocalState, kind, persist]);
  useEffect(() => { let closed = false; let timer: number | null = null; const url = process.env.NEXT_PUBLIC_AUDIO_LANGUAGE_WS_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3001/ws`;
    const localValue = readLocalSelection(kind);
    if (localValue) applyLocalState(localValue);
    const onLocalChange = (event: Event) => {
      const value = event instanceof CustomEvent && typeof event.detail?.value === "string" ? event.detail.value : readLocalSelection(kind);
      if (value) applyLocalState(value);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === localSelectionKey(kind, kind === "industry-preview" ? sessionRef.current : null) && event.newValue) applyLocalState(event.newValue);
    };
    window.addEventListener(localSelectionEvent(kind), onLocalChange);
    window.addEventListener("storage", onStorage);
    const readServerState = async (sessionId: string) => {
      try {
        const response = await selectionFetch(`/api/realtime-selections?kind=${encodeURIComponent(kind)}&sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        const data = await response.json() as { state?: { value?: string; version?: number } | null };
        if (typeof data.state?.value === "string" && typeof data.state.version === "number" && data.state.version >= versionRef.current) {
          versionRef.current = data.state.version; onState(data.state.value, data.state.version);
        }
      } catch { /* WebSocket remains the primary path. */ }
    };
    const connect = async () => { const session = await fetchCurrentSession(); if (closed || !session) return; sessionRef.current = session.id; const socket = new WebSocket(url); socketRef.current = socket;
      const sessionLocalValue = readLocalSelection(kind, session.id);
      if (sessionLocalValue) applyLocalState(sessionLocalValue);
      void readServerState(session.id);
      socket.onopen = () => { socket.send(JSON.stringify({ type: `${kind}:get`, sessionId: session.id })); if (pendingRef.current) void persist(session.id, pendingRef.current).finally(() => { pendingRef.current = null; }); };
      socket.onmessage = (event) => { try { const message = JSON.parse(String(event.data)) as { type?: string; state?: { value?: string; version?: number } | null }; if ([`${kind}:state`, `${kind}:changed`, `${kind}:saved`].includes(message.type || "") && message.state && typeof message.state.value === "string" && typeof message.state.version === "number" && message.state.version >= versionRef.current) { versionRef.current = message.state.version; onState(message.state.value, message.state.version); } } catch {} };
      socket.onclose = () => { if (!closed) timer = window.setTimeout(connect, 2000); };
    }; void connect(); const poll = window.setInterval(() => { if (sessionRef.current) void readServerState(sessionRef.current); }, 1500); return () => { closed = true; if (timer) clearTimeout(timer); clearInterval(poll); window.removeEventListener(localSelectionEvent(kind), onLocalChange); window.removeEventListener("storage", onStorage); socketRef.current?.close(); };
  }, [applyLocalState, kind, onState, persist]);
  return save;
}
