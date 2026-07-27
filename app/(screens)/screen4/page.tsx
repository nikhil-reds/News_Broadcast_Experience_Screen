"use client";

import React, { useState, useEffect, useRef } from "react";

interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface TranscriptData {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptSegment[];
  createdAt: string;
  sourceAudio: string;
}

interface AudioFileItem {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

export default function Screen4Page() {
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [srtContent, setSrtContent] = useState<string>("");
  const [audioFiles, setAudioFiles] = useState<AudioFileItem[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<string>("/audio/master-audio.wav");

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);

  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcribeMessage, setTranscribeMessage] = useState<string | null>(null);

  // Live Web Speech Recognition states
  const [isListeningMic, setIsListeningMic] = useState<boolean>(false);
  const [liveRecognizedText, setLiveRecognizedText] = useState<string>("");

  // Custom text input states
  const [showAddTextInput, setShowAddTextInput] = useState<boolean>(false);
  const [customText, setCustomText] = useState<string>("");

  const [viewMode, setViewMode] = useState<"broadcast" | "teleprompter" | "srt">("broadcast");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeSentenceRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Load existing transcript and audio files on mount
  useEffect(() => {
    fetchSavedAudioFiles();
    fetchTranscript();

    const interval = setInterval(fetchTranscript, 5000);
    return () => clearInterval(interval);
  }, []);

  // Sync active segment with current audio time
  useEffect(() => {
    if (!transcript || !transcript.segments) return;

    const currentSeg = transcript.segments.find(
      (s) => currentTime >= s.start && currentTime <= s.end
    );

    if (currentSeg) {
      if (currentSeg.id !== activeSegmentId) {
        setActiveSegmentId(currentSeg.id);
        if (activeSentenceRef.current) {
          activeSentenceRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }
    }
  }, [currentTime, transcript]);

  const fetchSavedAudioFiles = async () => {
    try {
      const res = await fetch("/api/save-audio");
      if (res.ok) {
        const data = await res.json();
        setAudioFiles(data.audioFiles || []);
        if (data.audioFiles && data.audioFiles.length > 0) {
          const master = data.audioFiles.find((a: AudioFileItem) => a.filename === "master-audio.wav");
          if (master) {
            setSelectedAudio(master.url);
          } else {
            setSelectedAudio(data.audioFiles[0].url);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch audio files:", err);
    }
  };

  const fetchTranscript = async () => {
    try {
      const res = await fetch("/api/transcript");
      if (res.ok) {
        const data = await res.json();
        if (data.exists && data.transcript) {
          setTranscript(data.transcript);
          setSrtContent(data.srtContent || "");
        }
      }
    } catch (err) {
      console.error("Failed to fetch transcript:", err);
    }
  };

  const handleRunTranscription = async () => {
    setIsTranscribing(true);
    setTranscribeMessage("Processing audio waveform & STT transcription engine...");

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setTranscript(data.transcript);
        setTranscribeMessage(`✓ Complete! Engine: ${data.sttEngine}`);
        fetchTranscript();
      } else {
        setTranscribeMessage(`❌ Error: ${data.error || "Transcription failed"}`);
      }
    } catch (err: any) {
      setTranscribeMessage(`❌ Transcribe Error: ${err.message}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Live Speech Recognition from Microphone
  const toggleLiveMicSTT = () => {
    if (isListeningMic) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListeningMic(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Browser Speech Recognition API is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      let currentSegs: TranscriptSegment[] = transcript?.segments ? [...transcript.segments] : [];
      let startTime = Date.now();

      recognition.onstart = () => {
        setIsListeningMic(true);
        setTranscribeMessage("🎤 Live Microphone STT active. Speak now...");
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptStr = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            const elapsed = (Date.now() - startTime) / 1000;
            const newSeg: TranscriptSegment = {
              id: currentSegs.length,
              start: Number((elapsed - 3.0 > 0 ? elapsed - 3.0 : 0).toFixed(2)),
              end: Number(elapsed.toFixed(2)),
              text: transcriptStr.trim(),
            };
            currentSegs.push(newSeg);
            saveSegmentsToServer(currentSegs);
          } else {
            interim += transcriptStr;
          }
        }
        setLiveRecognizedText(interim);
      };

      recognition.onerror = (e: any) => {
        console.error("Speech recognition error:", e.error);
        setIsListeningMic(false);
      };

      recognition.onend = () => {
        setIsListeningMic(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err: any) {
      alert("Failed to start speech recognition: " + err.message);
    }
  };

  // Submit custom text to create timed transcript
  const handleAddCustomText = async () => {
    if (!customText.trim()) return;

    const lines = customText.split("\n").filter((l) => l.trim().length > 0);
    let cumulative = 0;
    const newSegs: TranscriptSegment[] = lines.map((line, idx) => {
      const words = line.split(" ").length;
      const durationSec = Math.max(2.5, Number((words * 0.4).toFixed(2)));
      const start = Number(cumulative.toFixed(2));
      const end = Number((cumulative + durationSec).toFixed(2));
      cumulative += durationSec + 0.3;
      return { id: idx, start, end, text: line.trim() };
    });

    await saveSegmentsToServer(newSegs);
    setCustomText("");
    setShowAddTextInput(false);
  };

  const saveSegmentsToServer = async (segs: TranscriptSegment[]) => {
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: segs }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTranscript(data.transcript);
        fetchTranscript();
      }
    } catch (err) {
      console.error("Error saving transcript segments:", err);
    }
  };

  const seekToSegment = (startSec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startSec;
      setCurrentTime(startSec);
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
  };

  const filteredSegments = transcript?.segments.filter((seg) =>
    seg.text.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* Top Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-emerald-950">
            <span className="text-xl">📺</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px] uppercase font-bold border border-emerald-500/30">
                Screen 04
              </span>
              <h1 className="text-lg font-bold text-slate-100">
                Speech-to-Text & Subtitle Live Display Client
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              100% Local Browser & Server Speech-to-Text • Waveform VAD Engine • JSON & SRT Output
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={toggleLiveMicSTT}
            className={`text-xs px-3.5 py-2 rounded-lg font-bold flex items-center gap-1.5 transition ${
              isListeningMic
                ? "bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-950"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950"
            }`}
          >
            <span>🎤</span> {isListeningMic ? "Stop Live Mic STT" : "Live Mic STT"}
          </button>

          <button
            onClick={() => setShowAddTextInput(!showAddTextInput)}
            className="text-xs px-3.5 py-2 rounded-lg font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            ✏️ Enter Custom Script
          </button>

          <button
            onClick={handleRunTranscription}
            disabled={isTranscribing}
            className={`text-xs px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg transition ${
              isTranscribing
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950"
            }`}
          >
            {isTranscribing ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                Transcribing...
              </>
            ) : (
              <>
                <span>⚡</span> Run STT Pipeline
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Pipeline & Status Banner */}
        <section className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Audio Channel:</span>
              <code className="text-emerald-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                {selectedAudio}
              </code>
            </div>

            <div className="text-slate-600">→</div>

            <div className="flex items-center gap-2 text-slate-300">
              <span>FFmpeg Normaliser:</span>
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                16kHz Mono WAV
              </span>
            </div>

            <div className="text-slate-600">→</div>

            <div className="flex items-center gap-2 text-slate-300">
              <span>STT Engine:</span>
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Local STT & VAD
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/transcripts/transcript.json"
              download="transcript.json"
              className="text-xs px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-400 font-mono border border-slate-700 transition flex items-center gap-1.5"
            >
              <span>📥</span> JSON Output
            </a>
            <a
              href="/transcripts/transcript.srt"
              download="transcript.srt"
              className="text-xs px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 font-mono border border-slate-700 transition flex items-center gap-1.5"
            >
              <span>📥</span> SRT Subtitles
            </a>
          </div>
        </section>

        {/* Live Mic Listening Box */}
        {isListeningMic && (
          <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/20 text-xs space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-rose-300 font-bold">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                Listening to Microphone... Speak into your mic!
              </span>
              <span>LIVE STT</span>
            </div>
            {liveRecognizedText && (
              <p className="font-mono text-slate-200 italic bg-slate-950 p-2 rounded border border-rose-900">
                “{liveRecognizedText}”
              </p>
            )}
          </div>
        )}

        {/* Custom Script Input Box */}
        {showAddTextInput && (
          <div className="p-5 rounded-2xl border border-indigo-500/40 bg-slate-900/90 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-indigo-300 uppercase font-mono">
                ✏️ Paste / Enter Custom Script Text for Audio Sync
              </h3>
              <button
                onClick={() => setShowAddTextInput(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕ Close
              </button>
            </div>
            <textarea
              rows={4}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Paste or type news text script line by line here..."
              className="w-full bg-slate-950 text-slate-200 text-xs p-3 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 font-sans"
            />
            <button
              onClick={handleAddCustomText}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-950"
            >
              Generate Timed Transcript Cards & SRT
            </button>
          </div>
        )}

        {transcribeMessage && (
          <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 text-xs font-mono flex items-center justify-between">
            <span>{transcribeMessage}</span>
            <button
              onClick={() => setTranscribeMessage(null)}
              className="text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Master Audio Controller Player Bar */}
        <section className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (audioRef.current) {
                    if (isPlaying) {
                      audioRef.current.pause();
                    } else {
                      audioRef.current.play();
                    }
                    setIsPlaying(!isPlaying);
                  }
                }}
                className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-emerald-950 transition"
              >
                {isPlaying ? "⏸" : "▶"}
              </button>

              <div>
                <h3 className="text-sm font-bold text-slate-200">
                  Master Audio Playback Synchroniser
                </h3>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>/</span>
                  <span>{formatTime(duration)}</span>
                  {activeSegmentId !== null && (
                    <span className="ml-2 px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-[10px]">
                      Segment #{activeSegmentId + 1} Active
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Audio Selection Dropdown */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 font-medium">Select Master Audio:</label>
              <select
                value={selectedAudio}
                onChange={(e) => {
                  setSelectedAudio(e.target.value);
                  setIsPlaying(false);
                }}
                className="bg-slate-950 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
              >
                <option value="/audio/master-audio.wav">/public/audio/master-audio.wav</option>
                <option value="/audio/master-audio-16k.wav">/public/audio/master-audio-16k.wav (16kHz Mono)</option>
                {audioFiles.map((a) => (
                  <option key={a.filename} value={a.url}>
                    {a.filename}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <audio
            ref={audioRef}
            src={selectedAudio}
            onTimeUpdate={() => {
              if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (audioRef.current) setDuration(audioRef.current.duration);
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />

          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setCurrentTime(val);
                if (audioRef.current) audioRef.current.currentTime = val;
              }}
              className="w-full accent-emerald-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
            />
          </div>
        </section>

        {/* Display Controls & View Modes */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("broadcast")}
              className={`text-xs px-3 py-2 rounded-lg font-semibold transition ${
                viewMode === "broadcast"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              🎙️ Broadcast Studio Display
            </button>

            <button
              onClick={() => setViewMode("teleprompter")}
              className={`text-xs px-3 py-2 rounded-lg font-semibold transition ${
                viewMode === "teleprompter"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              📺 Teleprompter Large Mode
            </button>

            <button
              onClick={() => setViewMode("srt")}
              className={`text-xs px-3 py-2 rounded-lg font-semibold transition ${
                viewMode === "srt"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              📄 Raw SRT File Output
            </button>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="Search transcript text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 text-slate-200 placeholder-slate-500 text-xs px-3.5 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* View Mode 1: Broadcast Studio Display */}
        {viewMode === "broadcast" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left 2 Cols: Interactive Sentences */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Transcript Sentences ({filteredSegments.length})</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  Click any sentence to seek audio playback
                </span>
              </h2>

              {!transcript || filteredSegments.length === 0 ? (
                <div className="p-10 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 text-center space-y-4">
                  <span className="text-4xl">🎙️</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">No Transcript Loaded Yet</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                      Choose an action below to generate text output and timestamps for Screen 04:
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      onClick={handleRunTranscription}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950"
                    >
                      ⚡ Run STT & Audio Waveform Segmenter
                    </button>
                    <button
                      onClick={toggleLiveMicSTT}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-950"
                    >
                      🎤 Speak into Mic (Live STT)
                    </button>
                    <button
                      onClick={() => setShowAddTextInput(true)}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
                    >
                      ✏️ Enter Script Text
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                  {filteredSegments.map((seg) => {
                    const isActive = activeSegmentId === seg.id;
                    return (
                      <div
                        key={seg.id}
                        ref={isActive ? activeSentenceRef : null}
                        onClick={() => seekToSegment(seg.start)}
                        className={`p-4 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                          isActive
                            ? "bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-emerald-500 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/50"
                            : "bg-slate-900/50 hover:bg-slate-900 border-slate-800 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-mono text-[11px] px-2 py-0.5 rounded border ${
                              isActive
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold"
                                : "bg-slate-950 text-slate-400 border-slate-800"
                            }`}
                          >
                            [{formatTime(seg.start)} ➔ {formatTime(seg.end)}]
                          </span>

                          {isActive && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest animate-pulse">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              Active Speaking
                            </span>
                          )}
                        </div>

                        <p
                          className={`text-sm sm:text-base leading-relaxed ${
                            isActive ? "text-emerald-100 font-semibold" : "text-slate-200"
                          }`}
                        >
                          {seg.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Col: Live Teleprompter Live Highlight Box */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Live Active Cue Highlight
              </h2>

              <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-md space-y-4 min-h-[300px] flex flex-col justify-between shadow-2xl">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <span className="text-xs font-mono text-emerald-400 font-bold uppercase">
                      Studio Live Display
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  </div>

                  {activeSegmentId !== null && transcript ? (
                    <div className="space-y-3">
                      <span className="text-xs font-mono text-slate-400">
                        Sentence #{activeSegmentId + 1}
                      </span>
                      <p className="text-lg font-bold text-emerald-200 leading-snug bg-slate-950 p-4 rounded-xl border border-emerald-500/30">
                        “{transcript.segments.find((s) => s.id === activeSegmentId)?.text}”
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500 text-xs italic">
                      Start audio playback to see live highlighted sentence timestamp.
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800 pt-4 text-[11px] font-mono text-slate-400 space-y-1">
                  <div>Output JSON: <code className="text-indigo-300">/public/transcripts/transcript.json</code></div>
                  <div>Output SRT: <code className="text-emerald-300">/public/transcripts/transcript.srt</code></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View Mode 2: Teleprompter Large Mode */}
        {viewMode === "teleprompter" && (
          <section className="bg-slate-950 p-8 rounded-3xl border border-slate-800 shadow-2xl space-y-6 max-h-[700px] overflow-y-auto">
            <div className="text-center space-y-2 border-b border-slate-800 pb-4">
              <span className="px-3 py-1 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold uppercase tracking-widest">
                Teleprompter Studio View Mode
              </span>
              <p className="text-xs text-slate-400">High contrast studio font rendering for on-air news broadcast</p>
            </div>

            <div className="space-y-6 max-w-4xl mx-auto py-4">
              {filteredSegments.map((seg) => {
                const isActive = activeSegmentId === seg.id;
                return (
                  <p
                    key={seg.id}
                    onClick={() => seekToSegment(seg.start)}
                    className={`text-2xl sm:text-3xl font-bold leading-relaxed cursor-pointer transition-all duration-200 ${
                      isActive
                        ? "text-emerald-300 bg-emerald-950/40 p-6 rounded-2xl border-l-8 border-emerald-500 shadow-xl"
                        : "text-slate-500 hover:text-slate-300 px-4"
                    }`}
                  >
                    {seg.text}
                  </p>
                );
              })}
            </div>
          </section>
        )}

        {/* View Mode 3: Raw SRT File View */}
        {viewMode === "srt" && (
          <section className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xs font-mono text-emerald-400 font-bold uppercase">
                Generated Subtitle SRT File (/public/transcripts/transcript.srt)
              </h2>
              <a
                href="/transcripts/transcript.srt"
                download="transcript.srt"
                className="text-xs px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono"
              >
                Download .srt
              </a>
            </div>

            <pre className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-xs font-mono text-emerald-300/90 leading-relaxed overflow-x-auto max-h-[500px]">
              {srtContent || "// SRT content will appear here after transcription..."}
            </pre>
          </section>
        )}

      </main>
    </div>
  );
}
