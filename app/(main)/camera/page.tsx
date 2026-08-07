"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import CameraStudioCard from "@/components/camera-studio-card";
import AudioStudioCard from "@/components/audio-studio-card";
import { useCameraRecorder } from "@/lib/use-camera-recorder";

export default function CameraPage() {
  // --- Camera States ---
  const camera1 = useCameraRecorder(1, { captureAudio: true });
  const camera2 = useCameraRecorder(2);
  const camera3 = useCameraRecorder(3);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

  // --- Audio States ---
  const [isAudioRecording, setIsAudioRecording] = useState<boolean>(false);
  const audioTriggersRef = useRef<{
    start: () => void;
    end: () => void;
    isRecording: () => boolean;
  } | null>(null);

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

  // Hot-plugging support
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

  // Mount effects to initialize cameras
  useEffect(() => {
    let cancelled = false;

    (async () => {
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

  const startAllRecording = () => {
    if (!camera1.isRecorderRunning()) camera1.startRecording();
    if (!camera2.isRecorderRunning()) camera2.startRecording();
    if (!camera3.isRecorderRunning()) camera3.startRecording();
    if (audioTriggersRef.current && !audioTriggersRef.current.isRecording()) {
      audioTriggersRef.current.start();
    }
  };

  const endAllRecording = () => {
    camera1.endRecording();
    camera2.endRecording();
    camera3.endRecording();
    if (audioTriggersRef.current && audioTriggersRef.current.isRecording()) {
      audioTriggersRef.current.end();
    }
  };

  const isAnyRecording = camera1.isRecording || camera2.isRecording || camera3.isRecording || isAudioRecording;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Page Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-indigo-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-950">
            📹
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Multi-Camera & Audio Studio Control
            </h1>
            <p className="text-xs text-slate-400">
              Manage and record live feeds for Camera 01, Camera 02, Camera 03, and Master Audio
            </p>
          </div>
        </div>
      </header>

      {/* Cameras & Audio Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8 flex flex-col justify-between">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* ================= CAMERA 01 ================= */}
          <CameraStudioCard
            recorder={camera1}
            devices={videoDevices}
            onSelectDevice={handleSelectDevice(camera1)}
          />

          {/* ================= CAMERA 02 ================= */}
          <CameraStudioCard
            recorder={camera2}
            devices={videoDevices}
            onSelectDevice={handleSelectDevice(camera2)}
          />

          {/* ================= CAMERA 03 ================= */}
          <CameraStudioCard
            recorder={camera3}
            devices={videoDevices}
            onSelectDevice={handleSelectDevice(camera3)}
          />

          {/* ================= AUDIO STUDIO CARD ================= */}
          <div className="w-full">
            <AudioStudioCard
              showButtons={false}
              onRegisterTriggers={(triggers) => {
                audioTriggersRef.current = triggers;
              }}
              onRecordingChange={(recording) => {
                setIsAudioRecording(recording);
              }}
            />
          </div>
        </div>

        {/* Global Recording Controls */}
        <div className="flex justify-center pt-8">
          {isAnyRecording ? (
            <button
              onClick={endAllRecording}
              className="px-8 py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-lg transition shadow-xl shadow-rose-950/50 flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="w-3.5 h-3.5 rounded-full bg-white animate-pulse" />
              End Recording
            </button>
          ) : (
            <button
              onClick={startAllRecording}
              className="px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-lg transition shadow-xl shadow-indigo-950/50 flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="w-3.5 h-3.5 rounded-full bg-indigo-300 animate-pulse" />
              Start Recording
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
