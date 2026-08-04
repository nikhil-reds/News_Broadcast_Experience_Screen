"use client";

import React, { useState, useRef } from "react";
import AudioStudioCard from "@/components/audio-studio-card";

export default function AudioPage() {
  const [isAudioRecording, setIsAudioRecording] = useState<boolean>(false);
  const audioTriggersRef = useRef<{
    start: () => void;
    end: () => void;
    isRecording: () => boolean;
  } | null>(null);

  const startRecording = () => {
    if (audioTriggersRef.current && !audioTriggersRef.current.isRecording()) {
      audioTriggersRef.current.start();
    }
  };

  const stopRecording = () => {
    if (audioTriggersRef.current && audioTriggersRef.current.isRecording()) {
      audioTriggersRef.current.end();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Page Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-indigo-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-950">
            🎙️
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Master Audio Control
            </h1>
            <p className="text-xs text-slate-400">
              Record and manage master audio tracks for the broadcast studio
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAudioRecording ? (
            <button
              onClick={stopRecording}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm transition shadow-lg shadow-rose-950 flex items-center gap-2"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
              Stop Recording
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-950"
            >
              Start Recording
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex items-center justify-center">
        <div className="w-full">
          <AudioStudioCard
            onRegisterTriggers={(triggers) => {
              audioTriggersRef.current = triggers;
            }}
            onRecordingChange={(recording) => {
              setIsAudioRecording(recording);
            }}
          />
        </div>
      </main>
    </div>
  );
}
