"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ExportAspect } from "@/lib/video-export";
import { EXPORT_AUDIO_LABELS, isExportAudioLanguage, type ExportAudioLanguage } from "@/lib/export-settings";
import { isVoiceId, voiceProfile, type VoiceId } from "@/lib/voice-profiles";

interface RecordingItem { filename: string; url: string; sessionId?: string | null; }
interface VideoJob {
  id: string; status: "queued" | "processing" | "completed" | "failed";
  outputUrl: string | null; errorMessage: string | null;
  audioLanguage?: string; voiceId?: string;
}
export interface ExportPanelState {
  status: "idle" | VideoJob["status"]; videoUrl: string | null; downloadUrl: string | null;
  error: string | null; reelFilename: string; sourceAudio: string; language: string;
  audioLanguage: ExportAudioLanguage; voiceId: VoiceId | "original"; selectionLoaded: boolean;
  setReelFilename: (v: string) => void; setSourceAudio: (v: string) => void; setLanguage: (v: string) => void;
  reels: RecordingItem[]; audioFiles: RecordingItem[]; generate: () => void; isBusy: boolean;
}
export function useExportPanel(aspect: ExportAspect): ExportPanelState {
  const [reels, setReels] = useState<RecordingItem[]>([]);
  const [audioFiles, setAudioFiles] = useState<RecordingItem[]>([]);
  const [reelFilename, setReelFilename] = useState("");
  const [sourceAudio, setSourceAudio] = useState("");
  const [language, updateLanguage] = useState("English");
  const [audioLanguage, setAudioLanguage] = useState<ExportAudioLanguage>("en");
  const [voiceId, setVoiceId] = useState<VoiceId | "original">("original");
  const [selectionLoaded, setSelectionLoaded] = useState(false);
  const [job, setJob] = useState<VideoJob | null>(null);
  const captionTouched = useRef(false);
  const requestKey = JSON.stringify([reelFilename, sourceAudio, language, aspect, audioLanguage, voiceId]);
  const currentKey = useRef(requestKey); currentKey.current = requestKey;
  const jobKey = useRef("");
  const visibleJob = jobKey.current === requestKey ? job : null;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return; inFlight = true;
      try {
        const [reelsRes, audioRes, sessionRes] = await Promise.all([
          fetch("/api/save-recording?kind=highlight"), fetch("/api/save-audio"), fetch("/api/sessions/current"),
        ]);
        if (cancelled) return;
        if (reelsRes.ok) {
          const list = (await reelsRes.json()).recordings || [];
          setReels(list); if (list.length) setReelFilename(v => v || list[0].filename);
        }
        if (audioRes.ok) {
          const list = ((await audioRes.json()).audioFiles || []).filter((a: RecordingItem) => a.filename !== "master-audio-16k.wav");
          setAudioFiles(list); if (list.length) setSourceAudio(v => v || list[0].url);
        }
        if (sessionRes.ok) {
          const session = (await sessionRes.json()).session;
          let selection = null;
          if (session) {
            const res = await fetch(`/api/audio-language/selection?sessionId=${encodeURIComponent(session.id)}`);
            if (res.ok) selection = (await res.json()).state;
          }
          if (cancelled) return;
          const savedCode = Object.entries(EXPORT_AUDIO_LABELS).find(([, label]) => label === session?.selectedAudioLanguage)?.[0];
          const code: ExportAudioLanguage = isExportAudioLanguage(selection?.audioLanguage) ? selection.audioLanguage : isExportAudioLanguage(savedCode) ? savedCode : "en";
          setAudioLanguage(code);
          setVoiceId(code === "en" ? "original" : isVoiceId(selection?.voiceId) ? selection.voiceId : "indian-male-01");
          if (!captionTouched.current) updateLanguage(EXPORT_AUDIO_LABELS[code]);
          setSelectionLoaded(true);
        }
      } finally { inFlight = false; }
    };
    void refresh().catch(() => {});
    const timer = window.setInterval(() => void refresh().catch(() => {}), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!visibleJob?.id || ["completed", "failed"].includes(visibleJob.status)) return;
    let cancelled = false;
    const id = visibleJob.id, key = requestKey;
    const poll = async () => {
      try {
        const res = await fetch(`/api/video-export/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && currentKey.current === key) setJob(data.videoJob);
      } catch {}
    };
    const timer = window.setInterval(() => void poll(), 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [visibleJob?.id, visibleJob?.status, requestKey]);

  const generate = useCallback(() => {
    if (!reelFilename || !sourceAudio || !selectionLoaded) return;
    const key = requestKey;
    jobKey.current = key;
    setJob({ id: "", status: "queued", outputUrl: null, errorMessage: null });
    void (async () => {
      try {
        const res = await fetch("/api/video-export", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reelFilename, sourceAudio, language, aspect, audioLanguage, voiceId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to start export");
        if (currentKey.current === key) setJob(data.videoJob);
      } catch (error) {
        if (currentKey.current === key) setJob({ id: "", status: "failed", outputUrl: null,
          errorMessage: error instanceof Error ? error.message : "Unable to start export" });
      }
    })();
  }, [reelFilename, sourceAudio, language, aspect, audioLanguage, voiceId, selectionLoaded, requestKey]);

  return { status: visibleJob?.status ?? "idle", videoUrl: visibleJob?.status === "completed" ? visibleJob.outputUrl : null,
    downloadUrl: visibleJob?.status === "completed" ? `/api/video-export/${visibleJob.id}/download` : null,
    error: visibleJob?.errorMessage ?? null, reelFilename, sourceAudio, language, audioLanguage, voiceId, selectionLoaded,
    setReelFilename: value => {
      setReelFilename(value);
      const reel = reels.find(r => r.filename === value);
      const audio = reel?.sessionId ? audioFiles.find(a => a.sessionId === reel.sessionId) : undefined;
      if (audio) setSourceAudio(audio.url);
    },
    setSourceAudio, setLanguage: value => { captionTouched.current = true; updateLanguage(value); },
    reels, audioFiles, generate, isBusy: visibleJob?.status === "queued" || visibleJob?.status === "processing",
  };
}
export function ExportControls({ panel }: { panel: ExportPanelState }) {
  const inputClass = "mt-2 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-sm text-white";
  return <div className="space-y-5">
    <div className="rounded-xl border border-cyan-700/50 bg-cyan-950/30 p-4" aria-live="polite">
      <p className="text-sm text-cyan-200">Export audio</p>
      <p className="mt-1 text-xl font-semibold">{panel.selectionLoaded
        ? `${EXPORT_AUDIO_LABELS[panel.audioLanguage]} · ${panel.voiceId === "original" ? "Original recording" : voiceProfile(panel.voiceId).label}`
        : "Loading selected voice…"}</p>
      <a href="/screen5" className="mt-2 inline-block text-sm text-cyan-300 underline">Change language or voice on Screen 5</a>
      <p className="mt-2 text-sm text-slate-300">Each export keeps the settings selected when you generate it.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-3">
      <label className="text-sm">Highlight reel<select aria-label="Highlight reel" className={inputClass} value={panel.reelFilename}
        onChange={e => panel.setReelFilename(e.target.value)}>
        {!panel.reels.length && <option value="">No highlight reels found</option>}
        {panel.reels.map(r => <option key={r.filename} value={r.filename}>{r.filename}</option>)}
      </select></label>
      <label className="text-sm">Source recording<select aria-label="Source recording" className={inputClass} value={panel.sourceAudio}
        onChange={e => panel.setSourceAudio(e.target.value)}>
        {!panel.audioFiles.length && <option value="">No recordings found</option>}
        {panel.audioFiles.map(a => <option key={a.filename} value={a.url}>{a.filename}</option>)}
      </select></label>
      <label className="text-sm">Subtitle language<select aria-label="Subtitle language" className={inputClass} value={panel.language}
        onChange={e => panel.setLanguage(e.target.value)}>
        {Object.values(EXPORT_AUDIO_LABELS).map(l => <option key={l}>{l}</option>)}
      </select></label>
    </div>
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" onClick={panel.generate} disabled={panel.isBusy || !panel.selectionLoaded || !panel.reelFilename || !panel.sourceAudio}
        className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{panel.isBusy ? "Rendering…" : "Generate export"}</button>
      <p aria-live="polite" className="text-sm text-slate-300">
        {panel.status === "queued" && "Queued for local rendering"}
        {panel.status === "processing" && "Creating selected speech and encoding video"}
        {panel.status === "completed" && "Export ready"}
      </p>
      {panel.error && <p role="alert" className="text-sm text-rose-300">{panel.error}</p>}
    </div>
  </div>;
}

