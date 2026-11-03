"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import RecordingLooper from "@/components/recording-looper";
import { AD_INDUSTRIES, getAdsByBrandId } from "@/lib/ad-catalog";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";
import { useSelectedBackground } from "@/lib/use-selected-background";
import { useSelectedBrightness } from "@/lib/use-selected-brightness";

import { useSelectedAudio } from "@/lib/use-selected-audio";
import { useSelectedSubtitleLanguage } from "@/lib/use-selected-subtitle-language";

const L_BAND_VIDEO_BOUNDS = { top: "0%", right: "0%", bottom: "19.4%", left: "13.5%" };
const LANDSCAPE_MOBILE_VIDEO_BOUNDS = { top: "0%", right: "0%", bottom: "22%", left: "12%" };
const PORTRAIT_MOBILE_VIDEO_BOUNDS = { top: "0%", right: "0%", bottom: "28%", left: "0%" };
const PORTRAIT_TABLET_VIDEO_BOUNDS = { top: "0%", right: "0%", bottom: "24%", left: "0%" };
const FULL_VIDEO_BOUNDS = { top: "0%", right: "0%", bottom: "0%", left: "0%" };

export type BroadcastDisplayProfile = "portrait-mobile" | "landscape-mobile" | "portrait-tablet" | "landscape-tablet" | "tv";

function adVideoBounds(profile: BroadcastDisplayProfile) {
  if (profile === "portrait-mobile") return PORTRAIT_MOBILE_VIDEO_BOUNDS;
  if (profile === "portrait-tablet") return PORTRAIT_TABLET_VIDEO_BOUNDS;
  if (profile === "landscape-mobile") return LANDSCAPE_MOBILE_VIDEO_BOUNDS;
  return L_BAND_VIDEO_BOUNDS;
}

type PlayoutScene = {
  id: string;
  durationMs: number;
  image?: string;
  alt?: string;
};

function buildPlayoutSequence(brandId: string): readonly PlayoutScene[] {
  const ads = getAdsByBrandId(brandId);

  if (ads.length === 0) return [{ id: "full-only", durationMs: 6_000 }];

  return ads.map((ad) => ({ id: ad.id, durationMs: 8_000, image: ad.image, alt: ad.alt }));
}

/** Screen 11: starts full-screen, then alternates full programme video and the selected brand's ads. */
export default function Screen11HighlightPlayer({
  startedAt,
  sessionId,
  soundEnabled = true,
  displayProfile = "tv",
}: {
  startedAt?: number;
  sessionId?: string;
  soundEnabled?: boolean;
  displayProfile?: BroadcastDisplayProfile;
}) {
  const audio = useSelectedAudio();
  const subtitleLanguage = useSelectedSubtitleLanguage();
  const [sceneIndex, setSceneIndex] = useState(0);
  const [brandId, setBrandId] = useState<string>(AD_INDUSTRIES[0].brands[0].id);
  const backgroundId = useSelectedBackground();
  const brightness = useSelectedBrightness();
  const playoutSequence = useMemo(() => buildPlayoutSequence(brandId), [brandId]);
  const scene = playoutSequence[sceneIndex] ?? playoutSequence[0];
  const isLBand = Boolean(scene.image);
  const isPortrait = displayProfile === "portrait-mobile" || displayProfile === "portrait-tablet";
  const onRemoteBrand = useCallback((value: string) => {
    if (getAdsByBrandId(value).length === 0) return;
    setBrandId((current) => {
      if (current === value) return current;
      setSceneIndex(0);
      return value;
    });
  }, []);
  useRealtimeSelection("brand", onRemoteBrand);

  useEffect(() => {
    if (startedAt !== undefined) {
      const cycle = playoutSequence.reduce((total, item) => total + item.durationMs, 0);
      const update = () => {
        let offset = Math.max(0, Date.now() - startedAt) % cycle;
        for (const [index, item] of playoutSequence.entries()) {
          if (offset < item.durationMs) { setSceneIndex(index); break; }
          offset -= item.durationMs;
        }
      };
      update();
      const timer = window.setInterval(update, 200);
      return () => window.clearInterval(timer);
    }
    const timer = window.setTimeout(
      () => setSceneIndex((current) => (current + 1) % playoutSequence.length),
      scene.durationMs,
    );

    return () => window.clearTimeout(timer);
  }, [playoutSequence, scene.durationMs, sceneIndex, startedAt]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black font-sans text-slate-100">
      {scene.image && (
        <div key={`${brandId}:${scene.id}`} className="absolute inset-0 z-0 animate-in fade-in duration-700">
          <Image
            src={scene.image}
            alt={scene.alt ?? "Sponsored advertisement"}
            fill
            className={isPortrait ? "object-cover object-bottom" : "object-fill"}
            priority
          />
        </div>
      )}

      <section
        className="absolute z-10 overflow-hidden bg-black transition-all duration-700 ease-in-out"
        style={isLBand ? adVideoBounds(displayProfile) : FULL_VIDEO_BOUNDS}
      >
        <RecordingLooper
          source={{ highlight: true }}
          muted={!soundEnabled || audio.language !== "en"}
          audioLanguage={soundEnabled ? audio.language : "en"}
          voiceId={soundEnabled ? audio.voiceId : "original"}
          englishSubtitles
          subtitleLanguage={subtitleLanguage}
          startedAt={startedAt}
          sessionId={sessionId}
          brightness={brightness}
          compositeBackgroundId={backgroundId}
          containerClassName="h-full w-full bg-black"
        />
      </section>
    </div>
  );
}
