"use client";

import { useEffect, useRef, useState } from "react";
import { createRotaryDecoder, type RotaryFrame } from "@/lib/nexmosphere-rotary";
import { subscribeSharedEventSource } from "@/lib/shared-event-source";

export interface NexmosphereFrame extends RotaryFrame {
  at: string;
}

export interface NexmosphereStatus {
  connected: boolean;
  path: string;
  baudRate: number;
  lastError: string | null;
}

export interface NexmosphereHandlers {
  /** Signed detents from the rotary knob: > 0 clockwise, < 0 counter-clockwise. */
  onRotate?: (delta: number, frame: NexmosphereFrame) => void;
  /** Every frame, rotation or not. */
  onFrame?: (frame: NexmosphereFrame) => void;
}

export interface NexmosphereConnection {
  status: NexmosphereStatus | null;
  /** Newest frame received, for on-screen hardware diagnostics. */
  lastFrame: NexmosphereFrame | null;
}

/**
 * Subscribe a screen to the physical Nexmosphere panel.
 *
 * The SSE route (app/api/nexmosphere/events) owns the serial port and fans the
 * frames out, so any number of screens can listen at once. EventSource handles
 * its own reconnects, so this subscribes once for the life of the page: the
 * handlers are kept in a ref and re-pointed every render, which is what lets
 * them close over fresh state without tearing the connection down.
 */
export function useNexmosphere(handlers: NexmosphereHandlers): NexmosphereConnection {
  const [status, setStatus] = useState<NexmosphereStatus | null>(null);
  const [lastFrame, setLastFrame] = useState<NexmosphereFrame | null>(null);

  const handlersRef = useRef<NexmosphereHandlers>(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const decoder = createRotaryDecoder();
    return subscribeSharedEventSource("/api/nexmosphere/events", {
      events: {
        status: (e) => {
          try {
            setStatus(JSON.parse(e.data));
          } catch (err) {
            console.error("Bad Nexmosphere status payload:", err);
          }
        },
        frame: (e) => {
          let frame: NexmosphereFrame;
          try {
            frame = JSON.parse(e.data);
          } catch (err) {
            console.error("Bad Nexmosphere frame payload:", err);
            return;
          }

          setLastFrame(frame);
          setStatus((prev) => (prev ? { ...prev, connected: true } : prev));
          handlersRef.current.onFrame?.(frame);

          const reading = decoder.read(frame);
          if (reading && reading.delta !== 0) {
            handlersRef.current.onRotate?.(reading.delta, frame);
          }
        },
      },
      onError: () => setStatus((prev) => (prev ? { ...prev, connected: false } : prev)),
    });
  }, []);

  return { status, lastFrame };
}
