"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import CameraStudioCard from "@/components/camera-studio-card";
import { formatSize, formatTime } from "@/lib/format";
import { useCameraRecorder, type CameraRecorder } from "@/lib/use-camera-recorder";

interface SavedAudio {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

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
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

  // --- Audio States ---
  const [isAudioRecording, setIsAudioRecording] = useState<boolean>(false);
  const [audioRecordingTime, setAudioRecordingTime] = useState<number>(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isAudioSaving, setIsAudioSaving] = useState<boolean>(false);
  const [lastSavedAudio, setLastSavedAudio] = useState<SavedAudio | null>(null);
  const [savedAudioFiles, setSavedAudioFiles] = useState<SavedAudio[]>([]);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // --- Nexmosphere Hardware Panel States ---
  const [nexStatus, setNexStatus] = useState<NexmosphereStatus | null>(null);
  const [lastNexFrame, setLastNexFrame] = useState<NexmosphereFrame | null>(null);
  const nexTriggersRef = useRef<{ start: () => void; end: () => void }>({
    start: () => {},
    end: () => {},
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

  // Fetch Audio Files
  const fetchSavedAudioFiles = async () => {
    try {
      const res = await fetch("/api/save-audio");
      if (res.ok) {
        const data = await res.json();
        setSavedAudioFiles(data.audioFiles || []);
      }
    } catch (err) {
      console.error("Failed to fetch saved audio files:", err);
    }
  };

  // ================= AUDIO CAPTURE LOGIC =================
  const startAudioRecording = async () => {
    setAudioError(null);
    setAudioRecordingTime(0);
    audioChunksRef.current = [];
    setLastSavedAudio(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // Audio Level Visualizer
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((average / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Audio Recorder
      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported("audio/webm")) {
        options = { mimeType: "audio/webm" };
      } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
        options = { mimeType: "audio/ogg" };
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options = { mimeType: "audio/mp4" };
      }

      const recorder = new MediaRecorder(stream, options);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/wav";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        await saveAudioToServer(blob);
      };

      recorder.start(1000);
      audioRecorderRef.current = recorder;
      setIsAudioRecording(true);

      audioTimerRef.current = setInterval(() => {
        setAudioRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Audio recording error:", err);
      setAudioError("Microphone access failed: " + err.message);
    }
  };

  const handleEndAudioRecording = () => {
    if (audioRecorderRef.current?.state === "recording") {
      audioRecorderRef.current.stop();
      setIsAudioRecording(false);

      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      stopAudioRecordingStream();
    }
  };

  const stopAudioRecordingStream = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    setAudioLevel(0);
  };

  const saveAudioToServer = async (blob: Blob) => {
    setIsAudioSaving(true);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `master-audio-${timestamp}.wav`;
      const formData = new FormData();
      formData.append("audio", blob, filename);
      formData.append("filename", filename);

      const res = await fetch("/api/save-audio", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setLastSavedAudio({
          filename: data.filename,
          url: data.filePath,
          size: data.size || blob.size,
          createdAt: data.createdAt || new Date().toISOString(),
        });
        fetchSavedAudioFiles();
      } else {
        setAudioError(data.error || "Failed to save audio file.");
      }
    } catch (err: any) {
      setAudioError("Audio save error: " + err.message);
    } finally {
      setIsAudioSaving(false);
    }
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
    })();

    camera1.fetchSaved();
    camera2.fetchSaved();
    fetchSavedAudioFiles();

    return () => {
      cancelled = true;
      stopAudioRecordingStream();
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================= NEXMOSPHERE PANEL TRIGGERS =================
  // One physical button runs the whole studio, so both cameras and the master
  // audio move together. `recorder.state` is the synchronous source of truth —
  // React state lags a render behind, and a double press would otherwise stack
  // two MediaRecorders and orphan the first one's chunks.
  const startAllRecording = () => {
    if (!camera1.isRecorderRunning()) {
      camera1.startRecording();
    }
    if (!camera2.isRecorderRunning()) {
      camera2.startRecording();
    }
    if (audioRecorderRef.current?.state !== "recording") {
      startAudioRecording();
    }
  };

  const endAllRecording = () => {
    camera1.endRecording();
    camera2.endRecording();
    handleEndAudioRecording();
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
              Broadcast Studio Dashboard
            </h1>
            <p className="text-xs text-slate-400">
              Dual Camera Capture & Audio Capture (MinIO + Postgres)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Nexmosphere panel telemetry — lets the operator confirm the cable is
              live before going on air. */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                nexStatus?.connected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
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

          <a
            href="/screen1"
            className="text-xs px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition shadow-lg shadow-rose-950"
          >
            Screen 01 →
          </a>
          <a
            href="/screen2"
            className="text-xs px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition shadow-lg shadow-indigo-950"
          >
            Screen 02 →
          </a>
        </div>
      </header>

      {/* Studio Grid: Camera 01 | Camera 02, master audio underneath */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

        {/* ================= CAMERA 01 -> SCREEN 01 ================= */}
        <CameraStudioCard
          recorder={camera1}
          devices={videoDevices}
          onSelectDevice={handleSelectDevice(camera1)}
        />

        {/* ================= CAMERA 02 -> SCREEN 02 ================= */}
        <CameraStudioCard
          recorder={camera2}
          devices={videoDevices}
          onSelectDevice={handleSelectDevice(camera2)}
        />

        {/* ================= MASTER AUDIO RECORDING ================= */}
        <section className="lg:col-span-2 space-y-6 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>🎙️</span> Audio Studio Recorder
              </h2>
              <p className="text-xs text-slate-400">
                Saves master audio to the <code className="text-rose-300">audio</code> bucket
              </p>
            </div>
            {isAudioRecording && (
              <span className="px-3 py-1 rounded-full bg-indigo-950 border border-indigo-500/40 text-indigo-300 text-xs font-mono font-bold animate-pulse">
                REC {formatTime(audioRecordingTime)}
              </span>
            )}
          </div>

          {audioError && (
            <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
              {audioError}
            </div>
          )}

          {/* Audio Waveform / Volume Meter Display */}
          <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-6 flex flex-col items-center justify-center gap-4 min-h-[200px]">
            <div className="w-16 h-16 rounded-full bg-indigo-950/80 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-lg">
              <svg
                className={`w-8 h-8 ${isAudioRecording ? "animate-bounce" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>

            {/* Audio Volume Bar */}
            <div className="w-full max-w-xs space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>Microphone Level</span>
                <span>{audioLevel}%</span>
              </div>
              <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500 transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            </div>
          </div>

          {/* AUDIO BUTTONS */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={startAudioRecording}
              disabled={isAudioRecording || isAudioSaving}
              className={`flex-1 py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition ${
                isAudioRecording || isAudioSaving
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              Start Recording
            </button>

            <button
              onClick={handleEndAudioRecording}
              disabled={!isAudioRecording || isAudioSaving}
              className={`flex-1 py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition ${
                !isAudioRecording || isAudioSaving
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
              }`}
            >
              <span className="w-3 h-3 rounded-sm bg-indigo-400" />
              End Recording
            </button>
          </div>

          {isAudioSaving && (
            <p className="text-xs font-mono text-amber-400 animate-pulse text-center">
              Saving audio...
            </p>
          )}

          {/* Last Saved Audio Notification */}
          {lastSavedAudio && (
            <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 text-xs space-y-2">
              <div className="flex items-center justify-between text-indigo-300 font-semibold">
                <span>✓ Audio Saved</span>
                <span>{formatSize(lastSavedAudio.size)}</span>
              </div>
              <p className="font-mono text-slate-300 truncate bg-slate-950 p-2 rounded">
                {lastSavedAudio.filename}
              </p>
              <audio src={lastSavedAudio.url} controls className="w-full h-8 pt-1" />
            </div>
          )}

          {/* Saved Audio List */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Saved Audio Files ({savedAudioFiles.length})
            </h3>
            {savedAudioFiles.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No audio files recorded yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {savedAudioFiles.slice(0, 4).map((a) => (
                  <div
                    key={a.filename}
                    className="p-3 rounded-lg border border-slate-800 bg-slate-950 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-300 truncate max-w-[180px]">
                        {a.filename}
                      </span>
                      <a
                        href={a.url}
                        download={a.filename}
                        className="text-indigo-400 hover:underline font-mono text-[11px]"
                      >
                        Download Audio ↓
                      </a>
                    </div>
                    <audio src={a.url} controls className="w-full h-7" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
