"use client";

import RecordingLooper from "@/components/recording-looper";
import Image from "next/image";

const AD_IMAGE = "/ads/best/amul.png";

/** Screen 12: landscape L-band output matching Screen 9. */
export default function Screen12HighlightPlayer() {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-black font-sans text-slate-100">
      <div className="absolute inset-0 z-0">
        <Image src={AD_IMAGE} alt="Amul advertisement" fill className="object-fill" priority />
      </div>

      <section
        className="absolute z-10 overflow-hidden bg-black"
        style={{ top: "0%", right: "0%", bottom: "16.8%", left: "13.3%" }}
      >
        <RecordingLooper
          source={{ highlight: true }}
          muted={false}
          englishSubtitles
          compositeBackgroundId="newsroom-blue"
          containerClassName="h-full w-full bg-black"
        />
      </section>
    </div>
  );
}
