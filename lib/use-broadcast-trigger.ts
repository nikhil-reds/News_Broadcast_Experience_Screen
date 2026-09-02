"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BROADCAST_TRIGGER_CHANNEL,
  BROADCAST_TRIGGER_KEYBOARD_OVERRIDE_KEY,
  BROADCAST_TRIGGER_STORAGE_KEY,
} from "@/lib/broadcast-trigger";
import { subscribeSharedEventSource } from "@/lib/shared-event-source";

function readActive() {
  if (typeof window === "undefined") return false;
  const value = window.localStorage.getItem(BROADCAST_TRIGGER_STORAGE_KEY);
  return value === "1";
}

function hasKeyboardOverride() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(BROADCAST_TRIGGER_KEYBOARD_OVERRIDE_KEY) === "1";
}

export function useBroadcastTrigger() {
  const [isFinalActive, setIsFinalActive] = useState(false);

  const setSharedActive = useCallback((active: boolean) => {
    window.localStorage.setItem(BROADCAST_TRIGGER_STORAGE_KEY, active ? "1" : "0");
    setIsFinalActive(active);
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(BROADCAST_TRIGGER_CHANNEL);
      channel.postMessage({ active });
      channel.close();
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsFinalActive(readActive());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === BROADCAST_TRIGGER_STORAGE_KEY) {
        setIsFinalActive(readActive());
      }
    };
    window.addEventListener("storage", onStorage);

    const channel =
      "BroadcastChannel" in window ? new BroadcastChannel(BROADCAST_TRIGGER_CHANNEL) : null;
    channel?.addEventListener("message", (event) => {
      if (typeof event.data?.active === "boolean") {
        setIsFinalActive(event.data.active);
      } else {
        setIsFinalActive(readActive());
      }
    });

    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, []);

  // Keyboard fallback for the physical COM3 screen button. This listener is
  // mounted by the shared screens layout, so every screen can enter/leave the
  // broadcast state even when the ESP32 is disconnected. localStorage and the
  // BroadcastChannel fan the toggle out to all open screen tabs.
  useEffect(() => {
    const onKeyboardButton = (event: KeyboardEvent) => {
      if (event.repeat || event.key.toLowerCase() !== "n") return;

      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, button, [contenteditable='true']")
      ) {
        return;
      }

      event.preventDefault();
      window.localStorage.setItem(BROADCAST_TRIGGER_KEYBOARD_OVERRIDE_KEY, "1");
      setSharedActive(!readActive());
    };

    window.addEventListener("keydown", onKeyboardButton);
    return () => window.removeEventListener("keydown", onKeyboardButton);
  }, [setSharedActive]);

  useEffect(() => {
    return subscribeSharedEventSource("/api/esp32/events", {
      events: {
        status: (event) => {
          try {
            const status = JSON.parse(event.data);
            // A disconnected COM3 reports its default false state repeatedly.
            // Do not let that passive status overwrite an intentional keyboard
            // toggle; an explicit hardware frame below is authoritative.
            if (!hasKeyboardOverride() && typeof status.screenActive === "boolean") {
              setSharedActive(status.screenActive);
            }
          } catch (err) {
            console.error("Bad ESP32 status payload:", err);
          }
        },
        frame: (event) => {
          try {
            const frame = JSON.parse(event.data);
            if (typeof frame.screenActive === "boolean") {
              window.localStorage.removeItem(BROADCAST_TRIGGER_KEYBOARD_OVERRIDE_KEY);
              setSharedActive(frame.screenActive);
            }
          } catch (err) {
            console.error("Bad ESP32 frame payload:", err);
          }
        },
      },
    });
  }, [setSharedActive]);

  return {
    isFinalActive,
  };
}
