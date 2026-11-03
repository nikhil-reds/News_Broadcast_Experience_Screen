import { GREEN_SCREEN_BACKGROUNDS } from "@/lib/green-screen";
import { BRAND_IDS, INDUSTRY_IDS } from "@/lib/ad-catalog";
import { getSelectionState, saveSelectionState } from "@/lib/selection-state";

export const SUBTITLE_LANGUAGE_CODES = ["en", "de", "hi", "fr", "es", "off"] as const;
export const BACKGROUND_IDS = GREEN_SCREEN_BACKGROUNDS.map((item) => item.id) as string[];
export const realtimeSelections = {
  background: { allowed: BACKGROUND_IDS, get: (id: string) => getSelectionState("background", id, BACKGROUND_IDS), save: (id: string, value: string) => saveSelectionState("background", id, value) },
  "subtitle-language": { allowed: SUBTITLE_LANGUAGE_CODES, get: (id: string) => getSelectionState("subtitle-language", id, SUBTITLE_LANGUAGE_CODES), save: (id: string, value: typeof SUBTITLE_LANGUAGE_CODES[number]) => saveSelectionState("subtitle-language", id, value) },
  "industry-preview": { allowed: INDUSTRY_IDS, get: (id: string) => getSelectionState("industry-preview", id, INDUSTRY_IDS), save: (id: string, value: string) => saveSelectionState("industry-preview", id, value) },
  industry: { allowed: INDUSTRY_IDS, get: (id: string) => getSelectionState("industry", id, INDUSTRY_IDS), save: (id: string, value: string) => saveSelectionState("industry", id, value) },
  brand: { allowed: BRAND_IDS, get: (id: string) => getSelectionState("brand", id, BRAND_IDS), save: (id: string, value: string) => saveSelectionState("brand", id, value) },
} as const;
