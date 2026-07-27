"use client";

import React, { useState, useRef, useEffect } from "react";

interface SavedRecording {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

interface SavedAudio {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

export default function HomePage() {
  // --- Video States ---
  const [isVideoCameraActive, setIsVideoCameraActive] = useState<boolean>(false);
  const [isVideoRecording, setIsVideoRecording] = useState<boolean>(false);
  const [videoRecordingTime, setVideoRecordingTime] = useState<number>(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoSaving, setIsVideoSaving] = useState<boolean>(false);
  const [lastSavedVideo, setLastSavedVideo] = useState<SavedRecording | null>(null);
  const [savedVideos, setSavedVideos] = useState<SavedRecording[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Mount effects
  useEffect(() => {
    startCamera();
    fetchSavedVideos();
    fetchSavedAudioFiles();

    return () => {
      stopCamera();
      stopAudioRecordingStream();
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Fetch Videos
  const fetchSavedVideos = async () => {
    try {
      const res = await fetch("/api/save-recording");
      if (res.ok) {
        const data = await res.json();
        setSavedVideos(data.recordings || []);
      }
    } catch (err) {
      console.error("Failed to fetch saved videos:", err);
    }
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

  // ================= VIDEO CAPTURE LOGIC =================
  const startCamera = async () => {
    setVideoError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsVideoCameraActive(true);
    } catch (err: any) {
      setVideoError("Camera access failed: " + err.message);
      setIsVideoCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsVideoCameraActive(false);
  };

  const handleStartVideoRecording = () => {
    if (!videoStreamRef.current) {
      setVideoError("Camera stream is not active.");
      return;
    }

    videoChunksRef.current = [];
    setVideoRecordingTime(0);
    setVideoError(null);
    setLastSavedVideo(null);

    try {
      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")) {
        options = { mimeType: "video/mp4;codecs=avc1" };
      } else if (MediaRecorder.isTypeSupported("video/mp4")) {
        options = { mimeType: "video/mp4" };
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
        options = { mimeType: "video/webm;codecs=vp9" };
      } else if (MediaRecorder.isTypeSupported("video/webm")) {
        options = { mimeType: "video/webm" };
      }

      const recorder = new MediaRecorder(videoStreamRef.current, options);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) videoChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(videoChunksRef.current, {
          type: recorder.mimeType || "video/mp4",
        });
        await saveVideoToServer(blob);
      };

      recorder.start(1000);
      videoRecorderRef.current = recorder;
      setIsVideoRecording(true);

      videoTimerRef.current = setInterval(() => {
        setVideoRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setVideoError("Video recording failed: " + err.message);
    }
  };

  const handleEndVideoRecording = () => {
    if (videoRecorderRef.current && isVideoRecording) {
      videoRecorderRef.current.stop();
      setIsVideoRecording(false);
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
    }
  };

  const saveVideoToServer = async (blob: Blob) => {
    setIsVideoSaving(true);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `camera-recording-${timestamp}.mp4`;
      const formData = new FormData();
      formData.append("video", blob, filename);

      const res = await fetch("/api/save-recording", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setLastSavedVideo({
          filename: data.filename,
          url: data.filePath,
          size: data.size || blob.size,
          createdAt: data.createdAt || new Date().toISOString(),
        });
        fetchSavedVideos();
      } else {
        setVideoError(data.error || "Failed to save video.");
      }
    } catch (err: any) {
      setVideoError("Video save error: " + err.message);
    } finally {
      setIsVideoSaving(false);
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
    if (audioRecorderRef.current && isAudioRecording) {
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

  // Utilities
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

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
              Video Capture (`/public/recordings/`) & Audio Capture (`/public/audio/`)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/screen1"
            className="text-xs px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition shadow-lg shadow-rose-950"
          >
            Open Screen 01 (Looper) →
          </a>
        </div>
      </header>

      {/* Studio Grid: Left (Video) & Right (Audio) */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* ================= LEFT SIDE: VIDEO RECORDING ================= */}
        <section className="space-y-6 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>📹</span> Video Studio Capture
              </h2>
              <p className="text-xs text-slate-400">
                Saves camera video to <code className="text-rose-300">/public/recordings/</code>
              </p>
            </div>
            {isVideoRecording && (
              <span className="px-3 py-1 rounded-full bg-rose-950 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold animate-pulse">
                REC {formatTime(videoRecordingTime)}
              </span>
            )}
          </div>

          {videoError && (
            <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
              {videoError}
            </div>
          )}

          {/* Camera Canvas */}
          <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                isVideoCameraActive ? "opacity-100" : "opacity-0"
              }`}
            />

            {!isVideoCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                <p className="text-sm font-medium text-slate-300 mb-2">
                  Camera Feed Inactive
                </p>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  Enable Camera
                </button>
              </div>
            )}
          </div>

          {/* Video Controls */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleStartVideoRecording}
              disabled={isVideoRecording || !isVideoCameraActive || isVideoSaving}
              className={`flex-1 py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition ${
                isVideoRecording || !isVideoCameraActive || isVideoSaving
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800"
                  : "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              Start Recording
            </button>

            <button
              onClick={handleEndVideoRecording}
              disabled={!isVideoRecording || isVideoSaving}
              className={`flex-1 py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition ${
                !isVideoRecording || isVideoSaving
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
              }`}
            >
              <span className="w-3 h-3 rounded-sm bg-rose-400" />
              End Recording
            </button>
          </div>

          {isVideoSaving && (
            <p className="text-xs font-mono text-amber-400 animate-pulse text-center">
              Saving video to /public/recordings...
            </p>
          )}

          {/* Last Saved Video Info */}
          {lastSavedVideo && (
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-xs space-y-2">
              <div className="flex items-center justify-between text-emerald-400 font-semibold">
                <span>✓ Video Saved to /public/recordings/</span>
                <span>{formatSize(lastSavedVideo.size)}</span>
              </div>
              <p className="font-mono text-slate-300 truncate bg-slate-950 p-2 rounded">
                {lastSavedVideo.filename}
              </p>
            </div>
          )}

          {/* Saved Videos List */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Recent Video Recordings ({savedVideos.length})
            </h3>
            {savedVideos.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No video files recorded yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {savedVideos.slice(0, 3).map((v) => (
                  <div
                    key={v.filename}
                    className="p-2.5 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-slate-300 truncate max-w-[200px]">
                      {v.filename}
                    </span>
                    <a
                      href={v.url}
                      download={v.filename}
                      className="text-rose-400 hover:underline font-mono"
                    >
                      Download MP4
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>


        {/* ================= RIGHT SIDE: AUDIO RECORDING ================= */}
        <section className="space-y-6 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>🎙️</span> Audio Studio Recorder
              </h2>
              <p className="text-xs text-slate-400">
                Saves master audio to <code className="text-rose-300">/public/audio/</code>
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

          {/* RIGHT SIDE AUDIO BUTTONS */}
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
              Saving audio to /public/audio...
            </p>
          )}

          {/* Last Saved Audio Notification */}
          {lastSavedAudio && (
            <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 text-xs space-y-2">
              <div className="flex items-center justify-between text-indigo-300 font-semibold">
                <span>✓ Audio Saved to /public/audio/</span>
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
              Saved Audio Files in `/public/audio/` ({savedAudioFiles.length})
            </h3>
            {savedAudioFiles.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No audio files recorded yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
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
