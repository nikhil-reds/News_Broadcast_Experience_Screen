"use client";

import { useCallback, useEffect } from "react";
import Image from "next/image";
import ScreenNavigationMatrix from "@/components/screen-navigation-matrix";
import { useCameraRecorder } from "@/lib/use-camera-recorder";

export default function ControlRoomExperience() {
  const camera1 = useCameraRecorder(1, { captureAudio: true });
  const camera2 = useCameraRecorder(2);
  const camera3 = useCameraRecorder(3);

  const refreshVideoDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "videoinput" && device.deviceId);
    } catch (error) {
      console.error("Failed to enumerate video devices:", error);
      return [] as MediaDeviceInfo[];
    }
  }, []);

  useEffect(() => {
    const onDeviceChange = () => refreshVideoDevices();
    navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", onDeviceChange);
  }, [refreshVideoDevices]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const primaryDeviceId = await camera1.startCamera();
      const inputs = await refreshVideoDevices();
      if (cancelled) return;

      const secondary = inputs.find((device) => device.deviceId !== primaryDeviceId);
      if (secondary) await camera2.startCamera(secondary.deviceId);
      else camera2.setError("No second camera detected. Connect one, then pick it in the list below.");

      const tertiary = inputs.find((device) => device.deviceId !== primaryDeviceId && device.deviceId !== secondary?.deviceId);
      if (tertiary) await camera3.startCamera(tertiary.deviceId);
      else camera3.setError("No third camera detected. Connect one, then pick it in the list below.");
    })();

    camera1.fetchSaved();
    camera2.fetchSaved();
    camera3.fetchSaved();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="control-room-preview min-h-screen bg-white font-sans text-slate-900">
      {/* <header className="sticky top-0 z-50 flex items-center border-b border-slate-800 bg-[#050F64] px-6 py-4">
        <Image src="/amagi-logo-white.svg" alt="Amagi" width={150} height={42} priority className="h-9 w-auto object-contain" />
      </header> */}
      <main className=" space-y-8 p-4 sm:p-6 lg:p-8">
        <ScreenNavigationMatrix camera1Recording={camera1.isRecording} camera2Recording={camera2.isRecording} camera3Recording={camera3.isRecording} />
      </main>
    </div>
  );
}
