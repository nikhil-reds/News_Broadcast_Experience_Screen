"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import ScreenNavigationMatrix from "@/components/screen-navigation-matrix";
import { useCameraRecorder, type CameraRecorder } from "@/lib/use-camera-recorder";
import { subscribeSharedEventSource } from "@/lib/shared-event-source";

interface Esp32Frame {
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

/**
 * Serial messages from the ESP32 panel. Button 1 arms the studio; button 0
 * stops it and hands the takes to the save/transcribe pipeline.
 */
const ESP32_START_FRAMES = new Set(["1", "BUTTON[1]", "CLICK[1]", "START", "ON"]);
const ESP32_END_FRAMES = new Set(["0", "BUTTON[0]", "STOP", "OFF"]);

export default function HomePage() {
  // --- Camera States ---
  // Two independent capture chains. Only camera 1 carries the mic so the takes
  // don't fight over the input device or double up the room sound.
  const camera1 = useCameraRecorder(1, { captureAudio: true });
  const camera2 = useCameraRecorder(2);
  const camera3 = useCameraRecorder(3);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

  // --- ESP32 Hardware Panel States ---
  const [esp32Status, setEsp32Status] = useState<Esp32Status | null>(null);
  const [lastEsp32Frame, setLastEsp32Frame] = useState<Esp32Frame | null>(null);
  const esp32TriggersRef = useRef<{ start: () => void; end: () => void }>({
    start: () => { },
    end: () => { },
  });

  const refreshVideoDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
      setVideoDevices(inputs);
      return inputs;
    } catch (err) {
      console.error("Failed to enumerate video devices:", err);
      return [] as MediaDeviceInfo[];
    }
  }, []);

  // Cameras get hot-plugged mid-show; keep the pickers honest.
  useEffect(() => {
    const onDeviceChange = () => refreshVideoDevices();
    navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);
    return () =>
      navigator.mediaDevices?.removeEventListener("devicechange", onDeviceChange);
  }, [refreshVideoDevices]);

  const handleSelectDevice = (recorder: CameraRecorder) => async (deviceId: string) => {
    if (!deviceId) return;
    await recorder.startCamera(deviceId);
    refreshVideoDevices();
  };

  // Mount effects
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Camera 1 opens the default device first: that grants the permission that
      // makes enumerateDevices() hand back real deviceIds and labels, which is
      // what camera 2 needs to pin a *different* piece of hardware.
      const primaryDeviceId = await camera1.startCamera();
      const inputs = await refreshVideoDevices();
      if (cancelled) return;

      const secondary = inputs.find((d) => d.deviceId !== primaryDeviceId);
      if (secondary) {
        await camera2.startCamera(secondary.deviceId);
      } else {
        camera2.setError(
          "No second camera detected. Connect one, then pick it in the list below."
        );
      }

      const tertiary = inputs.find((d) => d.deviceId !== primaryDeviceId && d.deviceId !== secondary?.deviceId);
      if (tertiary) {
        await camera3.startCamera(tertiary.deviceId);
      } else {
        camera3.setError(
          "No third camera detected. Connect one, then pick it in the list below."
        );
      }
    })();

    camera1.fetchSaved();
    camera2.fetchSaved();
    camera3.fetchSaved();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================= NEXMOSPHERE PANEL TRIGGERS =================
  const startAllRecording = () => {
    if (!camera1.isRecorderRunning()) {
      camera1.startRecording();
    }
    if (!camera2.isRecorderRunning()) {
      camera2.startRecording();
    }
    if (!camera3.isRecorderRunning()) {
      camera3.startRecording();
    }
  };

  const endAllRecording = () => {
    camera1.endRecording();
    camera2.endRecording();
    camera3.endRecording();
  };

  // Keyboard fallback for the physical COM3 button. The first N starts the
  // synchronized take; the next N ends it and lets the screens return to the
  // latest available/demo playback flow.
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
      if (camera1.isRecording || camera2.isRecording || camera3.isRecording) {
        esp32TriggersRef.current.end();
      } else {
        esp32TriggersRef.current.start();
      }
    };

    window.addEventListener("keydown", onKeyboardButton);
    return () => window.removeEventListener("keydown", onKeyboardButton);
  }, [camera1.isRecording, camera2.isRecording, camera3.isRecording]);

  // Keep the triggers pointing at the newest closures so the subscription below
  // can mount once without ever going stale.
  useEffect(() => {
    esp32TriggersRef.current = { start: startAllRecording, end: endAllRecording };
  });

  // Physical panel -> recording. The shared SSE helper keeps only one browser
  // tab connected to the server stream and fans events out to the others.
  useEffect(() => {
    return subscribeSharedEventSource("/api/esp32/events", {
      events: {
        status: (e) => {
          try {
            setEsp32Status(JSON.parse(e.data));
          } catch (err) {
            console.error("Bad ESP32 status payload:", err);
          }
        },
        frame: (e) => {
          let frame: Esp32Frame;
          try {
            frame = JSON.parse(e.data);
          } catch (err) {
            console.error("Bad ESP32 frame payload:", err);
            return;
          }

          setLastEsp32Frame(frame);
          setEsp32Status((prev) => (prev ? { ...prev, connected: true } : prev));

          const raw = frame.raw.trim().toUpperCase();
          if (ESP32_START_FRAMES.has(raw)) {
            esp32TriggersRef.current.start();
          } else if (ESP32_END_FRAMES.has(raw)) {
            esp32TriggersRef.current.end();
          }
        },
      },
      onError: () => setEsp32Status((prev) => (prev ? { ...prev, connected: false } : prev)),
    });
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans">
      {/* Studio Header */}
      <header 
        className="border-b border-slate-800 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50"
        style={{ backgroundColor: '#050F64' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center">
            <Image src="/amagi-logo-white.svg" alt="Amagi Logo" width={100} height={28} className="object-contain" />
          </div>

        </div>


      </header>

      {/* Main Studio Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">

        {/* ================= 12-SCREEN CONTROL ROOM MULTI-VIEW ================= */}
        <ScreenNavigationMatrix
          camera1Recording={camera1.isRecording}
          camera2Recording={camera2.isRecording}
          camera3Recording={camera3.isRecording}
        />

        {/* Control Room Matrix only */}


      </main>
    </div>
  );
}
