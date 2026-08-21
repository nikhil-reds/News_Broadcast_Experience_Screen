"use client";

import RecordingLooper from "@/components/recording-looper";
import { useAdRotation } from "@/lib/use-ad-rotation";

/** Screen 12: Screen 9-style sponsor rail beside the landscape highlight reel. */
export default function Screen12HighlightPlayer() {
  const { activeAd } = useAdRotation();

  return (
    <div className="grid h-screen w-screen grid-cols-[20%_80%] overflow-hidden bg-slate-950 font-sans text-slate-100">
      {activeAd && (
        <aside className="flex min-w-0 flex-col border-r border-indigo-500/25 bg-slate-900 px-6 py-8 shadow-2xl shadow-black/30">
          <div className="flex items-center gap-2 text-[10px] font-mono font-bold tracking-[0.2em] text-indigo-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
            SPONSORED
          </div>

          <div className="my-auto space-y-5">
            <span className="inline-flex rounded border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-1 text-[9px] font-mono font-extrabold tracking-widest text-indigo-200">
              ACTIVE CAMPAIGN
            </span>
            <div className="space-y-3">
              <h1 className="break-words font-mono text-xl font-extrabold tracking-wide text-indigo-200">
                {activeAd.sponsor}
              </h1>
              <p className="text-sm leading-relaxed text-slate-300">{activeAd.text}</p>
            </div>
          </div>

          <div className="border-t border-slate-700/80 pt-4">
            <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Campaign code</p>
            <p className="mt-1 font-mono text-sm font-bold text-indigo-400">{activeAd.code}</p>
          </div>
        </aside>
      )}

      <section className="min-w-0 overflow-hidden bg-black">
        <RecordingLooper
          source={{ highlight: true }}
          originalAudio
          englishSubtitles
          compositeBackgroundId="newsroom-blue"
          containerClassName="h-full w-full bg-black"
        />
      </section>
    </div>
  );
}
