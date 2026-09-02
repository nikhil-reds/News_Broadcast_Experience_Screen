"use client";

import RecordingLooper from "@/components/recording-looper";
import { useAdRotation } from "@/lib/use-ad-rotation";

/** Screen 11: portrait highlight reel with the Screen 10-style bottom campaign rail. */
export default function Screen11HighlightPlayer() {
  const { activeAd } = useAdRotation();

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-950 font-sans text-slate-100">
      <div className="grid h-[844px] w-[390px] grid-rows-[90%_10%] overflow-hidden rounded-3xl bg-black shadow-2xl shadow-black/40">
        <section className="min-h-0 overflow-hidden bg-black">
          <RecordingLooper
            source={{ highlight: true }}
            muted={false}
            englishSubtitles
            compositeBackgroundId="newsroom-blue"
            containerClassName="h-full w-full bg-black"
          />
        </section>

        {activeAd && (
          <aside className="flex min-h-0 items-center gap-2 border-t border-indigo-500/25 bg-slate-900 px-3 py-2">
            <span className="shrink-0 rounded border border-indigo-400/30 bg-indigo-500/15 px-1.5 py-1 text-[7px] font-mono font-extrabold tracking-wider text-indigo-200">
              AD
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-xs font-extrabold tracking-wide text-indigo-200">
                {activeAd.sponsor}
              </h1>
              <p className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-slate-300">{activeAd.text}</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
