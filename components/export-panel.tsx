"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { ExportAspect } from "@/lib/video-export";

interface RecordingItem {
  filename: string;
  url: string;
  createdAt: string;
}
interface AudioFileItem {
  filename: string;
  url: string;
  createdAt: string;
}
interface VideoJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  outputUrl: string | null;
  errorMessage: string | null;
}

const LANGUAGES = ["English", "German", "Hindi", "French", "Spanish"];
const FLAGS: Record<string, string> = {
  English: "🇬🇧",
  German: "🇩🇪",
  Hindi: "🇮🇳",
  French: "🇫🇷",
  Spanish: "🇪🇸",
};
const POLL_MS = 3000;
const REELS_REFETCH_MS = 5000;

export interface ExportPanelState {
  status: "idle" | "queued" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  /** The selected highlight reel's own URL — shown until an export finishes. */
  reelUrl: string | null;
  error: string | null;
  reelFilename: string;
  sourceAudio: string;
  language: string;
  setReelFilename: (v: string) => void;
  setSourceAudio: (v: string) => void;
  setLanguage: (v: string) => void;
  reels: RecordingItem[];
  audioFiles: AudioFileItem[];
  generate: () => void;
  isBusy: boolean;
}

/** Shared data/polling logic behind Screen 11 (portrait) and Screen 12 (landscape). */
export function useExportPanel(aspect: ExportAspect): ExportPanelState {
  const [reels, setReels] = useState<RecordingItem[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFileItem[]>([]);
  const [reelFilename, setReelFilename] = useState("");
  const [sourceAudio, setSourceAudio] = useState("");
  const [language, setLanguage] = useState("English");
  const [job, setJob] = useState<VideoJob | null>(null);

  // Refetches periodically so a reel/recording that lands after this screen
  // is already open shows up without a reload — but only *defaults* the
  // selection the first time each list is non-empty, via the `prev ||`
  // guard below, so it never stomps a director's manual dropdown choice.
  useEffect(() => {
    let cancelled = false;
    const fetchLists = async () => {
      try {
        const [reelsRes, audioRes] = await Promise.all([
          fetch("/api/save-recording?kind=highlight"),
          fetch("/api/save-audio"),
        ]);
        if (cancelled) return;
        if (reelsRes.ok) {
          const data = await reelsRes.json();
          const list: RecordingItem[] = data.recordings || [];
          setReels(list);
          if (list.length > 0) setReelFilename((prev) => prev || list[0].filename);
        }
        if (audioRes.ok) {
          const data = await audioRes.json();
          const list: AudioFileItem[] = (data.audioFiles || []).filter(
            (a: AudioFileItem) => a.filename !== "master-audio-16k.wav"
          );
          setAudioFiles(list);
          if (list.length > 0) setSourceAudio((prev) => prev || list[0].url);
        }
      } catch {
        /* leave selects empty — director can retry once recordings exist */
      }
    };
    fetchLists();
    const interval = setInterval(fetchLists, REELS_REFETCH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Poll while a job is in flight.
  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/video-export/${job.id}`);
        if (res.ok) {
          const data = await res.json();
          setJob(data.videoJob);
        }
      } catch {
        /* try again on the next tick */
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job]);

  const generate = useCallback(() => {
    if (!reelFilename || !sourceAudio || !language) return;
    (async () => {
      setJob({ id: "", status: "queued", outputUrl: null, errorMessage: null });
      try {
        const res = await fetch("/api/video-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reelFilename, sourceAudio, language, aspect }),
        });
        const data = await res.json();
        if (res.ok && data.videoJob) {
          setJob(data.videoJob);
        } else {
          setJob({ id: "", status: "failed", outputUrl: null, errorMessage: data.error || "Failed to start export" });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to start export";
        setJob({ id: "", status: "failed", outputUrl: null, errorMessage: message });
      }
    })();
  }, [reelFilename, sourceAudio, language, aspect]);

  const status = job?.status ?? "idle";
  return {
    status,
    videoUrl: job?.outputUrl ?? null,
    reelUrl: reels.find((r) => r.filename === reelFilename)?.url ?? null,
    error: job?.errorMessage ?? null,
    reelFilename,
    sourceAudio,
    language,
    setReelFilename,
    setSourceAudio,
    setLanguage,
    reels,
    audioFiles,
    generate,
    isBusy: status === "queued" || status === "processing",
  };
}

/** The controls row: reel/audio/language selects + Generate button + status line. */
export function ExportControls({ panel }: { panel: ExportPanelState }) {
  return (
    <div className="w-full max-w-4xl space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select
          value={panel.reelFilename}
          onChange={(e) => panel.setReelFilename(e.target.value)}
          className="bg-slate-900 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-amber-500 font-mono"
        >
          {panel.reels.length === 0 && <option value="">No highlight reels found</option>}
          {panel.reels.map((r) => (
            <option key={r.filename} value={r.filename}>
              {r.filename}
            </option>
          ))}
        </select>

        <select
          value={panel.sourceAudio}
          onChange={(e) => panel.setSourceAudio(e.target.value)}
          className="bg-slate-900 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-amber-500 font-mono"
        >
          {panel.audioFiles.length === 0 && <option value="">No audio recordings found</option>}
          {panel.audioFiles.map((a) => (
            <option key={a.filename} value={a.url}>
              {a.filename}
            </option>
          ))}
        </select>

        <select
          value={panel.language}
          onChange={(e) => panel.setLanguage(e.target.value)}
          className="bg-slate-900 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-amber-500 font-mono"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {FLAGS[l]} {l}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={panel.generate}
          disabled={panel.isBusy || !panel.reelFilename || !panel.sourceAudio}
          className={`px-5 py-2 rounded-lg font-bold text-sm transition ${
            panel.isBusy || !panel.reelFilename || !panel.sourceAudio
              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
              : "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-950"
          }`}
        >
          {panel.isBusy ? "Rendering…" : "Generate Export"}
        </button>

        <span className="text-xs font-mono text-slate-400">
          {panel.status === "queued" && "Queued — waiting for the export worker…"}
          {panel.status === "processing" && "Burning subtitles and encoding…"}
          {panel.status === "completed" && "✓ Export ready"}
          {panel.status === "failed" && `Error: ${panel.error}`}
        </span>
      </div>
    </div>
  );
}
