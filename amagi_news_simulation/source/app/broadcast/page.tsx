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
  { number: "01", name: "Portrait Mobile", ratio: "9:16", detail: "Vertical phone", frame: "h-[14.5rem] aspect-[9/16]", notch: true },
  { number: "02", name: "Landscape Mobile", ratio: "16:9", detail: "Horizontal phone", frame: "h-[10.5rem] aspect-video", notch: true },
  { number: "03", name: "Portrait Tablet", ratio: "3:4", detail: "Vertical tablet", frame: "h-[14rem] aspect-[3/4]" },
  { number: "04", name: "Landscape Tablet", ratio: "4:3", detail: "Horizontal tablet", frame: "h-[13rem] aspect-[4/3]" },
  { number: "05", name: "Landscape Tablet + Audio", ratio: "4:3", detail: "Tablet with broadcast audio", frame: "h-[13rem] aspect-[4/3]", audio: true },
  { number: "06", name: "TV / Large Display", ratio: "16:9", detail: "Landscape television", frame: "h-[10.5rem] aspect-video" },
];

export default function BroadcastPage() {
  return (
    <main
      className={`${poppins.className} relative min-h-dvh overflow-hidden bg-black px-4 py-8 text-[#f7f5fa] sm:px-7 sm:py-10 lg:px-10 lg:py-12`}
      style={{
        background: "radial-gradient(circle at 72% 4%, rgba(92,63,170,.28), transparent 31%), radial-gradient(circle at 6% 44%, rgba(116,32,81,.17), transparent 30%), linear-gradient(145deg,#060609 0%,#0b0912 50%,#050507 100%)",
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
      <div className="relative mx-auto w-full max-w-[1680px]">
        <header className="mb-8 flex flex-col gap-7 border-b border-white/10 pb-8 sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:pb-9">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-px w-8 bg-violet-400" aria-hidden="true" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300">News Simulation</p>
            </div>
            <h1 className={`${abroSans.className} text-[clamp(3rem,6vw,6rem)] font-thin leading-[.9] tracking-[-0.055em] text-white`}>Broadcast Outputs</h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-[#aaa5b5] sm:text-base">Monitor every live destination from one refined workspace, with device-accurate previews for mobile, tablet, and television.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#d0ccd6]">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[.07] px-4 py-2.5 shadow-[inset_0_1px_rgba(255,255,255,.06)]">
              <i className="size-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.8)]" aria-hidden="true" />
              6 live outputs
            </span>
            <span className="rounded-full border border-white/10 bg-white/[.045] px-4 py-2.5 shadow-[inset_0_1px_rgba(255,255,255,.05)]">Responsive previews</span>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3" aria-label="Broadcast output previews">
          {outputs.map((output) => {
            const href = `/broadcast${output.number}`;
            return (
              <article key={output.number} className="group relative flex min-w-0 flex-col overflow-hidden rounded-[1.4rem] border border-white/[.12] bg-[linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.025))] p-4 shadow-[0_24px_70px_rgba(0,0,0,.38),inset_0_1px_rgba(255,255,255,.06)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-violet-300/30 hover:shadow-[0_30px_90px_rgba(0,0,0,.52),0_0_45px_rgba(111,76,194,.1),inset_0_1px_rgba(255,255,255,.09)] sm:p-5">
                <header className="mb-4 flex min-w-0 items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/25 text-xs font-semibold text-violet-200 shadow-inner">{output.number}</span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold tracking-[-0.01em] text-white sm:text-base">{output.name}</h2>
                      <p className="mt-1 text-[11px] leading-4 text-[#9f9aa8]">{output.ratio} <span className="px-1 text-white/20">•</span> {output.detail}</p>
                    </div>
                  </div>
                  <Link href={href} target="_blank" aria-label={`Open Broadcast ${output.number} ${output.name}`} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-white py-1 pl-4 pr-1 text-[11px] font-semibold text-black shadow-[0_8px_24px_rgba(0,0,0,.25)] transition hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300">
                    Open
                    <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-black text-sm text-white transition-transform duration-300 group-hover:-rotate-45">↗</span>
                  </Link>
                </header>

                <div className="relative flex min-h-[17rem] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/[.09] bg-[radial-gradient(circle_at_50%_40%,rgba(91,70,150,.16),transparent_55%),rgba(0,0,0,.52)] p-4 shadow-[inset_0_0_45px_rgba(0,0,0,.55)] sm:min-h-[18rem] sm:p-5">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:28px_28px]" />
                  <div className={`relative max-h-full max-w-full overflow-hidden rounded-lg border-[3px] bg-black shadow-[0_20px_45px_rgba(0,0,0,.62),0_0_0_1px_rgba(255,255,255,.08)] ${output.audio ? "border-violet-500/80 shadow-[0_20px_45px_rgba(0,0,0,.62),0_0_28px_rgba(139,92,246,.18)]" : "border-white/20"} ${output.frame}`}>
                    {output.notch ? <span className="pointer-events-none absolute left-1/2 top-1.5 z-10 h-1.5 w-11 -translate-x-1/2 rounded-full bg-black/90 shadow-sm" /> : null}
                    <iframe
                      src={href}
                      title={`Broadcast ${output.number} · ${output.name}`}
                      loading="lazy"
                      className="h-full w-full border-0 bg-black"
                      allow={output.audio ? "autoplay" : undefined}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[.07] pt-4 text-[11px]">
                  <span className="truncate text-[#8f8a98]" title={href}>{href}</span>
                  <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 ${output.audio ? "border-violet-300/15 bg-violet-300/[.06] text-violet-200" : "border-emerald-300/15 bg-emerald-300/[.06] text-emerald-200"}`}>
                    <i className={`size-1.5 rounded-full ${output.audio ? "bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,.7)]" : "bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.7)]"}`} aria-hidden="true" />
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
