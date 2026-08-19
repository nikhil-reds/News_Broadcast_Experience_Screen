"use client";

import { useCallback, useEffect, useState } from "react";

export interface AdCampaign {
  id?: string;
  sponsor: string;
  text: string;
  code: string;
}

/** Shown only if /api/ad-campaigns has no campaigns scheduled right now. */
const FALLBACK_CAMPAIGNS: AdCampaign[] = [
  { sponsor: "AMAGI CLOUDPORT", text: "Scale your broadcast channel playout and platform delivery dynamically in the cloud.", code: "AMAGI-PLAYOUT" },
  { sponsor: "AMAGI THUNDERSTORM", text: "Supercharge your CTV & FAST monetization with advanced Server-Side Ad Insertion (SSAI).", code: "AMAGI-DYNAMIC-ADS" },
  { sponsor: "AMAGI PLANNER", text: "Simplify scheduling, planning, and EPG management for broadcast and FAST networks.", code: "AMAGI-EPG-PLANNER" },
];

const ROTATE_MS = 5000;
const REFETCH_MS = 30000;

/**
 * Fetch + rotate + impression-track the sponsored ad campaigns. Same logic
 * Screens 09/10 have inline; extracted so Screens 11/12's final preview can
 * show the same rotating banner without re-implementing it a third/fourth
 * time.
 */
export function useAdRotation() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>(FALLBACK_CAMPAIGNS);
  const [usingFallback, setUsingFallback] = useState(true);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/ad-campaigns");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.campaigns) && data.campaigns.length > 0) {
        setCampaigns(data.campaigns);
        setUsingFallback(false);
      } else {
        setCampaigns(FALLBACK_CAMPAIGNS);
        setUsingFallback(true);
      }
    } catch {
      // Keep whatever campaigns are already on screen.
    }
  }, []);

  const recordImpression = useCallback(
    (campaign: AdCampaign) => {
      if (usingFallback || !campaign.code) return;
      fetch("/api/ad-campaigns/impression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: campaign.code }),
      }).catch(() => {});
    },
    [usingFallback]
  );

  useEffect(() => {
    fetchCampaigns();
    const refetchTimer = setInterval(fetchCampaigns, REFETCH_MS);
    return () => clearInterval(refetchTimer);
  }, [fetchCampaigns]);

  useEffect(() => {
    const adTimer = setInterval(() => {
      setCurrentAdIndex((prev) => {
        if (campaigns.length === 0) return prev;
        const next = (prev + 1) % campaigns.length;
        recordImpression(campaigns[next]);
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(adTimer);
  }, [campaigns, recordImpression]);

  // Campaign list can change size on refetch — keep the index in range.
  useEffect(() => {
    if (currentAdIndex >= campaigns.length) setCurrentAdIndex(0);
  }, [campaigns, currentAdIndex]);

  const activeAd = campaigns[currentAdIndex] ?? campaigns[0] ?? null;

  return { activeAd, campaigns, currentAdIndex, usingFallback };
}
