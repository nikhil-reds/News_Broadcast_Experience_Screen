"use client";

import RecordingLooper from "@/components/recording-looper";

const BOTTOM_AD_IMAGE = "/ads/best/juice.png";

/** Screen 11: portrait highlight reel with the Screen 10-style juice ad rail. */
export default function Screen11HighlightPlayer() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-950 font-sans text-slate-100">
      <div
        className="grid h-[844px] w-[390px] grid-rows-[90%_30%] overflow-hidden rounded-3xl bg-black shadow-2xl shadow-black/40"
        style={{ gridTemplateRows: "70% 30%" }}
      >
        <section className="h-full min-h-0 overflow-hidden bg-black">
          <RecordingLooper
            source={{ highlight: true }}
            muted={false}
            englishSubtitles
            compositeBackgroundId="newsroom-blue"
            containerClassName="h-full w-full bg-black"
          />
        </section>

        <aside className="relative min-h-0 overflow-hidden border-t border-white/20 bg-white">
          {/* Crop the full 16:9 creative to its bottom advertising artwork. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BOTTOM_AD_IMAGE}
            alt="Real Fruit Power advertisement"
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: "contain", objectPosition: "center bottom" }}
          />
        </aside>
      </div>
    </div>
  );
}
