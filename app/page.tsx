"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import ScreenNavigationMatrix from "@/components/screen-navigation-matrix";
import { useCameraRecorder } from "@/lib/use-camera-recorder";

interface NexmosphereFrame {
  raw: string;
  address: string;
  command: string;
  value: string;
  at: string;
}

interface NexmosphereStatus {
  connected: boolean;
  path: string;
  baudRate: number;
  lastError: string | null;
}

/**
 * X-talk frames from the physical Nexmosphere panel. Button 1 arms the studio,
 * button 2 stops it and hands the takes to the save/transcribe pipeline.
 */
const NEX_START_FRAME = "X001A[17]";
const NEX_END_FRAME = "X001A[3]";

export default function HomePage() {
  // --- Camera States ---
  // Two independent capture chains. Only camera 1 carries the mic so the takes
  // don't fight over the input device or double up the room sound.
  const camera1 = useCameraRecorder(1, { captureAudio: true });
  const camera2 = useCameraRecorder(2);
  const camera3 = useCameraRecorder(3);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

  // --- Nexmosphere Hardware Panel States ---
  const [nexStatus, setNexStatus] = useState<NexmosphereStatus | null>(null);
  const [lastNexFrame, setLastNexFrame] = useState<NexmosphereFrame | null>(null);
  const nexTriggersRef = useRef<{ start: () => void; end: () => void }>({
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

  const handleSelectDevice = (recorder: any) => async (deviceId: string) => {
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

  // Keep the triggers pointing at the newest closures so the subscription below
  // can mount once without ever going stale.
  useEffect(() => {
    nexTriggersRef.current = { start: startAllRecording, end: endAllRecording };
  });

  // Physical panel -> recording. EventSource handles its own reconnects, so this
  // mounts once and stays up for the life of the page.
  useEffect(() => {
    const source = new EventSource("/api/nexmosphere/events");

    source.addEventListener("status", (e) => {
      try {
        setNexStatus(JSON.parse((e as MessageEvent).data));
      } catch (err) {
        console.error("Bad Nexmosphere status payload:", err);
      }
    });

    source.addEventListener("frame", (e) => {
      let frame: NexmosphereFrame;
      try {
        frame = JSON.parse((e as MessageEvent).data);
      } catch (err) {
        console.error("Bad Nexmosphere frame payload:", err);
        return;
      }

      setLastNexFrame(frame);
      setNexStatus((prev) => (prev ? { ...prev, connected: true } : prev));

      if (frame.raw === NEX_START_FRAME) {
        nexTriggersRef.current.start();
      } else if (frame.raw === NEX_END_FRAME) {
        nexTriggersRef.current.end();
      }
    });

    source.onerror = () => {
      setNexStatus((prev) => (prev ? { ...prev, connected: false } : prev));
    };

    return () => source.close();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Studio Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-indigo-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-950">
            🎙️
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Amagi Intelligence
            </h1>
            <p className="text-xs text-slate-400">
              Run your media operations on the agentic industry cloud
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Nexmosphere panel telemetry */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${nexStatus?.connected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                }`}
            />
            <div className="leading-tight">
              <p className="text-[11px] font-semibold text-slate-200">
                Panel {nexStatus?.connected ? "Live" : "Offline"}
                {nexStatus?.path ? ` · ${nexStatus.path}` : ""}
              </p>
              <p className="text-[10px] font-mono text-slate-500">
                {lastNexFrame
                  ? `${lastNexFrame.raw} received`
                  : `${NEX_START_FRAME} start · ${NEX_END_FRAME} stop`}
              </p>
            </div>
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
