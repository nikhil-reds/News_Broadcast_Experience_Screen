"use client";

import React, { useState, useRef, useEffect } from "react";
import { formatSize, formatTime } from "@/lib/format";

interface SavedAudio {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

interface AudioStudioCardProps {
  onRegisterTriggers?: (triggers: {
    start: () => void;
    end: () => void;
    isRecording: () => boolean;
  }) => void;
  onRecordingChange?: (recording: boolean) => void;
}

export default function AudioStudioCard({
  onRegisterTriggers,
  onRecordingChange,
}: AudioStudioCardProps) {
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

  // Mount effects
  useEffect(() => {
    fetchSavedAudioFiles();

    return () => {
      stopAudioRecordingStream();
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register external control hooks if callback provided
  useEffect(() => {
    if (onRegisterTriggers) {
      onRegisterTriggers({
        start: startAudioRecording,
        end: handleEndAudioRecording,
        isRecording: () => audioRecorderRef.current?.state === "recording",
      });
    }
  }, [onRegisterTriggers]);

  useEffect(() => {
    if (onRecordingChange) {
      onRecordingChange(isAudioRecording);
    }
  }, [isAudioRecording, onRecordingChange]);

  return (
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
  );
}
