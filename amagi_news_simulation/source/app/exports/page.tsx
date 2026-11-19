"use client";
import { useState } from "react";
import { ExportControls, useExportPanel } from "@/components/export-panel";
import type { ExportAspect } from "@/lib/video-export";

export default function ExportsPage() {
  const [aspect, setAspect] = useState<ExportAspect>("landscape");
  const panel = useExportPanel(aspect);
  return <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
    <div className="mx-auto max-w-5xl space-y-8">
      <header><h1 className="text-3xl font-semibold">Export your broadcast</h1>
        <p className="mt-3 text-slate-300">Create a local video with your selected language and voice.</p></header>
      <div role="group" aria-label="Video format" className="flex gap-3">
        {(["landscape", "portrait"] as const).map(value => <button key={value} type="button" aria-pressed={aspect === value}
          onClick={() => setAspect(value)} className={`rounded-full border px-5 py-2 ${aspect === value ? "border-indigo-400 bg-indigo-700" : "border-slate-600"}`}>
          {value === "landscape" ? "Landscape 16:9" : "Portrait 9:16"}</button>)}
      </div>
      <ExportControls panel={panel} />
      {panel.videoUrl && <section className="space-y-4" aria-label="Completed export">
        <video key={panel.videoUrl} src={panel.videoUrl} controls preload="metadata" className="max-h-[65vh] w-full rounded-xl bg-black" />
        <a href={panel.downloadUrl!} className="inline-block rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950">Download video</a>
      </section>}
    </div>
  </main>;
}
