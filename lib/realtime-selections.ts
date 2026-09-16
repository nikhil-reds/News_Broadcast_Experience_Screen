import { GREEN_SCREEN_BACKGROUNDS } from "@/lib/green-screen";
import { getSelectionState, saveSelectionState } from "@/lib/selection-state";

export const SUBTITLE_LANGUAGE_CODES = ["en", "de", "hi", "fr", "es"] as const;
export const INDUSTRY_IDS = ["fmcg", "consumer-electronics", "banking-finance", "retail-ecommerce"] as const;
export const BRAND_IDS = ["boat", "samsung", "apple", "sony"] as const;
export const BACKGROUND_IDS = GREEN_SCREEN_BACKGROUNDS.map((item) => item.id) as string[];
export const realtimeSelections = {
  background: { allowed: BACKGROUND_IDS, get: (id: string) => getSelectionState("background", id, BACKGROUND_IDS), save: (id: string, value: string) => saveSelectionState("background", id, value) },
  "subtitle-language": { allowed: SUBTITLE_LANGUAGE_CODES, get: (id: string) => getSelectionState("subtitle-language", id, SUBTITLE_LANGUAGE_CODES), save: (id: string, value: typeof SUBTITLE_LANGUAGE_CODES[number]) => saveSelectionState("subtitle-language", id, value) },
  industry: { allowed: INDUSTRY_IDS, get: (id: string) => getSelectionState("industry", id, INDUSTRY_IDS), save: (id: string, value: typeof INDUSTRY_IDS[number]) => saveSelectionState("industry", id, value) },
  brand: { allowed: BRAND_IDS, get: (id: string) => getSelectionState("brand", id, BRAND_IDS), save: (id: string, value: typeof BRAND_IDS[number]) => saveSelectionState("brand", id, value) },
} as const;
