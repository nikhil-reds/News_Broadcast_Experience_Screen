"use client";

import { useState } from "react";

const SCREENS = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1;
  const titles = [
    "Camera 01", "Camera 02", "Camera 03", "Audio in Text", "Multi-Language", "Brightness", "Background Change", "Subtitle Language", "Industry Selection", "Brand Selection", "Ads Preview", "Final Preview",
  ];
  return { number, path: `/screen${number}`, title: titles[index] };
});

function frameUrl(path: string) {
  return `${path}?embed=1&preview=1`;
}

export default function AllScreensWall() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <main className="grid h-screen w-screen place-items-center overflow-hidden bg-[#020617] p-2 text-slate-100">
      <section
        aria-label="All broadcast screen previews"
        className="grid h-full w-full gap-3"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gridTemplateRows: "repeat(3, minmax(0, 1fr))",
        }}
      >
        {SCREENS.map((screen) => {
          const isSelected = screen.number === selected;
          return (
            isSelected ? (
            <article key={screen.number} className="relative min-h-0 min-w-0 overflow-hidden rounded-lg border border-cyan-400 bg-slate-950 text-left shadow-[inset_0_0_0_1px_rgba(34,211,238,0.65),0_0_18px_-8px_rgba(34,211,238,0.9)]">
              <div className="absolute inset-0 overflow-hidden bg-slate-900">
                <iframe title={`${screen.title} screen`} src={frameUrl(screen.path)} className="absolute inset-0 h-full w-full border-0" allow="autoplay" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-slate-950/85 px-2 py-1.5"><span className="font-mono text-[10px] text-cyan-300">{String(screen.number).padStart(2, "0")}</span><span className="truncate pl-2 text-xs font-bold text-slate-100">{screen.title}</span></div>
              </div>
            </article>
            ) : (
            <button key={screen.number} type="button" onClick={() => setSelected(screen.number)} className="group relative min-h-0 min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-left transition duration-200 hover:z-10 hover:scale-[1.025] hover:border-cyan-400 hover:shadow-[0_0_22px_-10px_rgba(34,211,238,0.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              <div className="absolute inset-0 overflow-hidden bg-slate-950">
                <video src="/bg-video/1.1.mp4" autoPlay loop muted playsInline className="pointer-events-none h-full w-full object-cover" />
                <div className="pointer-events-none absolute inset-0 bg-slate-950/20 transition group-hover:bg-slate-950/5" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-slate-950/85 px-2 py-1.5"><span className="font-mono text-[10px] text-cyan-300">{String(screen.number).padStart(2, "0")}</span><span className="truncate pl-2 text-xs font-bold text-slate-100">{screen.title}</span></div>
              </div>
            </button>
            )
          );
        })}
      </section>
    </main>
  );
}
