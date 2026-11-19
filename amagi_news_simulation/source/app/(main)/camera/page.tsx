"use client";

import { abroSans } from "@/lib/abro-sans";
import { poppins } from "@/lib/poppins";
import styles from "@/components/studio-controls.module.css";
import React, { useState, useRef, useEffect, useCallback } from "react";
import CameraStudioCard from "@/components/camera-studio-card";
import AudioStudioCard from "@/components/audio-studio-card";
import { useCameraRecorder } from "@/lib/use-camera-recorder";



type CameraRecorder = ReturnType<typeof useCameraRecorder>;

export default function CameraPage() {
  const [isMicActive, setIsMicActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
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
    setSessionId: (sessionId: string | null) => void;
  } | null>(null);

  // --- Session (ties the 3 camera takes + 1 audio take of one recording
  // together, replacing the old filename-timestamp-proximity guess) ---
  const sessionIdRef = useRef<string | null>(null);

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

  const handleSelectDevice = (recorder: CameraRecorder) => async (deviceId: string) => {
    if (!deviceId) return;
    await recorder.startCamera(deviceId);
    refreshVideoDevices();
  };

  // Sources stay off until the operator explicitly enables them.
  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshVideoDevices(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshVideoDevices]);

  const startAllRecording = async () => {
    if (isStarting) return;
    setIsStarting(true);
    // One session id for this take, shared by all 3 cameras + audio so the
    // backend can tell when all 4 uploads for THIS take have landed instead
    // of guessing from filename timestamps.
    // Without a session the takes cannot be matched later, so do not start
    // any recorder unless the session was created.
    let sessionId: string | null = null;
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed with ${res.status}`);
      sessionId = data.session?.id ?? null;
    } catch (err) {
      console.error("Failed to create broadcast session:", err);
    }
    if (!sessionId) {
      setIsStarting(false);
      setStartError("Could not create a recording session, so recording did not start. Check the server and try again.");
      return;
    }
    setStartError(null);
    sessionIdRef.current = sessionId;

    camera1.setSessionId(sessionId);
    camera2.setSessionId(sessionId);
    camera3.setSessionId(sessionId);
    audioTriggersRef.current?.setSessionId(sessionId);

    if (camera1.isCameraActive && !camera1.isRecorderRunning()) camera1.startRecording();
    if (camera2.isCameraActive && !camera2.isRecorderRunning()) camera2.startRecording();
    if (camera3.isCameraActive && !camera3.isRecorderRunning()) camera3.startRecording();
    if (isMicActive && audioTriggersRef.current && !audioTriggersRef.current.isRecording()) {
      audioTriggersRef.current.start();
    }
    setIsStarting(false);
  };

  const endAllRecording = () => {
    camera1.endRecording();
    camera2.endRecording();
    camera3.endRecording();
    if (audioTriggersRef.current && audioTriggersRef.current.isRecording()) {
      audioTriggersRef.current.end();
    }

    const sessionId = sessionIdRef.current;
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "processing", endedAt: new Date().toISOString() }),
      }).catch((err) => console.error("Failed to mark session as processing:", err));
    }
  };

  const isAnyRecording = camera1.isRecording || camera2.isRecording || camera3.isRecording || isAudioRecording;

  const readyCount = [camera1.isCameraActive, camera2.isCameraActive, camera3.isCameraActive, isMicActive].filter(Boolean).length;
  const isSaving = camera1.isSaving || camera2.isSaving || camera3.isSaving;

  return (
    <main className={`${poppins.className} ${styles.page}`}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div><h1 className={`${abroSans.variable} ${abroSans.className} admin-title`}>Studio</h1><p className="admin-page-description">Capture cameras and master audio for a session</p></div>
          <span className={styles.summary} role="status"><i className={styles.dot} />{readyCount} of 4 sources ready</span>
        </header>
        {startError && <p role="alert" className={styles.error}>{startError}</p>}
        <div className={styles.cameraGrid}>
          {[camera1, camera2, camera3].map((camera) => (
            <CameraStudioCard key={camera.cameraId} recorder={camera} devices={videoDevices} onSelectDevice={handleSelectDevice(camera)} showSavedRecordings={false} studioStyle />
          ))}
        </div>
        <AudioStudioCard studioStyle showButtons={false} showSavedAudioFiles={false} onActiveChange={setIsMicActive}
          onRegisterTriggers={(triggers) => { audioTriggersRef.current = triggers; }}
          onRecordingChange={setIsAudioRecording}
        />
        <div className={styles.bottomActions}>
          {readyCount === 0 && !isAnyRecording && <p className={styles.hint}>Turn on a camera or the microphone to start recording.</p>}
          <button type="button" className={`${styles.button} ${styles.recordButton}`} onClick={isAnyRecording ? endAllRecording : startAllRecording} disabled={!isAnyRecording && (readyCount === 0 || isStarting || isSaving)}>
            <i className={styles.recordDot} />{isAnyRecording ? "End recording" : isStarting ? "Starting…" : isSaving ? "Saving…" : "Start recording"}
          </button>
        </div>
      </div>
    </main>
  );
}
