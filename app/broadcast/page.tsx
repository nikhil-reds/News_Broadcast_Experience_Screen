import type { Metadata } from "next";
import Link from "next/link";
import { abroSans } from "@/lib/abro-sans";
import { poppins } from "@/lib/poppins";

export const metadata: Metadata = {
  title: "Broadcast Outputs | News Simulation",
  description: "Preview all six responsive broadcast outputs.",
};

type BroadcastOutput = {
  number: string;
  name: string;
  ratio: string;
  detail: string;
  frame: string;
  notch?: boolean;
  audio?: boolean;
};

const outputs: readonly BroadcastOutput[] = [
  { number: "01", name: "Portrait Mobile", ratio: "9:16", detail: "Vertical phone", frame: "h-[11.5rem] aspect-[9/16]", notch: true },
  { number: "02", name: "Landscape Mobile", ratio: "16:9", detail: "Horizontal phone", frame: "h-[11.5rem] aspect-video", notch: true },
  { number: "03", name: "Portrait Tablet", ratio: "3:4", detail: "Vertical tablet", frame: "h-[11.5rem] aspect-[3/4]" },
  { number: "04", name: "Landscape Tablet", ratio: "4:3", detail: "Horizontal tablet", frame: "h-[11.5rem] aspect-[4/3]" },
  { number: "05", name: "Landscape Tablet + Audio", ratio: "4:3", detail: "Tablet with broadcast audio", frame: "h-[11.5rem] aspect-[4/3]", audio: true },
  { number: "06", name: "TV / Large Display", ratio: "16:9", detail: "Landscape television", frame: "h-[11.5rem] aspect-video" },
];

export default function BroadcastPage() {
  return (
    <main
      className={`${abroSans.className} min-h-dvh bg-black px-3 py-3 text-[#eeedf0] sm:px-4 sm:py-4`}
      style={{
        background: "radial-gradient(ellipse at 62% 20%, #15132b 0%, transparent 48%), radial-gradient(ellipse at 100% 35%, #25101e 0%, transparent 50%), #000",
      }}
    >
      <div className="mx-auto w-full max-w-[1800px]">
        <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={`${poppins.className} text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300`}>News Simulation</p>
            <h1 className="mt-1 text-3xl font-thin tracking-[-0.04em] sm:text-4xl">Broadcast Outputs</h1>
            <p className={`${poppins.className} mt-1 max-w-2xl text-xs leading-5 text-[#aaa5b2]`}>Preview all six device-sized outputs for mobile, tablet, and television displays.</p>
          </div>
          <div className={`${poppins.className} flex flex-wrap items-center gap-2 text-xs text-[#b9b4c1]`}>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-2.5 py-1.5">6 live outputs</span>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-2.5 py-1.5">Responsive previews</span>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Broadcast output previews">
          {outputs.map((output) => {
            const href = `/broadcast${output.number}`;
            return (
              <article key={output.number} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/15 bg-white/[.035] p-2.5 shadow-2xl backdrop-blur-sm">
                <header className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-normal">Broadcast {output.number} · {output.name}</h2>
                    <p className={`${poppins.className} mt-0.5 text-[10px] text-[#9e99a6]`}>{output.ratio} · {output.detail}{output.audio ? " · Audio enabled" : ""}</p>
                  </div>
                  <Link href={href} target="_blank" aria-label={`Open Broadcast ${output.number} ${output.name}`} className={`${poppins.className} inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-full bg-white px-3 py-1.5 text-[10px] font-medium text-black transition hover:bg-[#e7e2ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300`}>
                    Open <span aria-hidden="true">↗</span>
                  </Link>
                </header>

                <div className="flex min-h-[13rem] flex-1 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/55 p-2">
                  <div className={`relative max-h-full max-w-full overflow-hidden rounded-md border-[3px] bg-black shadow-[0_14px_34px_rgba(0,0,0,.42)] ${output.audio ? "border-violet-500/70" : "border-white/20"} ${output.frame}`}>
                    {output.notch ? <span className="pointer-events-none absolute left-1/2 top-1 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-black/80" /> : null}
                    <iframe
                      src={href}
                      title={`Broadcast ${output.number} · ${output.name}`}
                      loading="lazy"
                      className="h-full w-full border-0 bg-black"
                      allow={output.audio ? "autoplay" : undefined}
                    />
                  </div>
                </div>

                <div className={`${poppins.className} mt-2 flex items-center justify-between gap-2 text-[10px]`}>
                  <code className="truncate text-[#aaa5b2]" title={href}>{href}</code>
                  <span className={`inline-flex items-center gap-1.5 ${output.audio ? "text-violet-300" : "text-emerald-300"}`}>
                    <i className={`size-1.5 rounded-full ${output.audio ? "bg-violet-300" : "bg-emerald-300"}`} aria-hidden="true" />
                    {output.audio ? "Audio output" : "Display output"}
                  </span>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
