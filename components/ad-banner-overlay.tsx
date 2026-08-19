"use client";

import type { AdCampaign } from "@/lib/use-ad-rotation";

/**
 * The sponsored-ad banner overlay, positioned either bottom (Screen 09's
 * layout) or left-side-vertical (Screen 10's layout). Extracted so Screens
 * 11/12's final preview can show the same banner without duplicating the
 * markup a third/fourth time — see lib/use-ad-rotation.ts for the campaign
 * fetch/rotate logic this expects the caller to already be running.
 */
export default function AdBannerOverlay({
  activeAd,
  position,
}: {
  activeAd: AdCampaign;
  position: "bottom" | "left";
}) {
  if (position === "left") {
    return (
      <div className="absolute left-6 top-16 bottom-16 w-64 bg-slate-950/85 backdrop-blur-md border border-indigo-500/30 rounded-xl p-5 flex flex-col justify-between shadow-2xl z-20 transition-all duration-500">
        <div className="space-y-4">
          <div className="bg-indigo-600 text-white text-[9px] font-mono font-extrabold px-2.5 py-1 rounded tracking-widest animate-pulse border border-indigo-400/30 self-start w-fit">
            SPONSOR
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-indigo-300 tracking-wide font-mono">{activeAd.sponsor}</h4>
            <p className="text-xs text-slate-200 leading-relaxed">{activeAd.text}</p>
          </div>
        </div>
        <div className="border-t border-slate-800/80 pt-3">
          <div className="text-[8px] text-slate-400 font-mono tracking-wider uppercase">CAMPAIGN CODE</div>
          <div className="text-xs text-indigo-400 font-mono font-bold mt-0.5">{activeAd.code}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 right-4 bg-slate-950/85 backdrop-blur-md border border-indigo-500/30 rounded-xl p-3.5 flex items-center justify-between shadow-lg z-20 transition-all duration-500">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 text-white text-[9px] font-mono font-extrabold px-2.5 py-1 rounded tracking-widest animate-pulse border border-indigo-400/30">
          SPONSOR
        </div>
        <div>
          <h4 className="text-xs font-bold text-indigo-300 tracking-wide font-mono">{activeAd.sponsor}</h4>
          <p className="text-[11px] text-slate-200 line-clamp-1 mt-0.5">{activeAd.text}</p>
        </div>
      </div>
      <div className="hidden sm:block text-right">
        <div className="text-[9px] text-slate-400 font-mono tracking-wider">CAMPAIGN CODE</div>
        <div className="text-[10px] text-indigo-400 font-mono font-bold">{activeAd.code}</div>
      </div>
    </div>
  );
}
