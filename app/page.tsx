"use client";

import React, { useEffect, useCallback } from "react";
import Image from "next/image";
import ScreenNavigationMatrix from "@/components/screen-navigation-matrix";
import { useCameraRecorder } from "@/lib/use-camera-recorder";

export default function HomePage() {
  // --- Camera States ---
  // Two independent capture chains. Only camera 1 carries the mic so the takes
  // don't fight over the input device or double up the room sound.
  const camera1 = useCameraRecorder(1, { captureAudio: true });
  const camera2 = useCameraRecorder(2);
  const camera3 = useCameraRecorder(3);
  const refreshVideoDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
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
