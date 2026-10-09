import { translateBatch, translateOne, translateText, QWEN_MODEL } from "@/lib/qwen";

export const TRANSLATION_MODEL = QWEN_MODEL;

/** Translate a batch of texts into targetLanguage in a single Gemini call. */
export { translateBatch, translateOne, translateText };

/** Translate a list of segment texts, preserving order/count (batch call, per-item fallback). */
export async function translateSegmentTexts(
  texts: string[],
  targetLanguage: string
): Promise<string[]> {
  const batch = await translateBatch(texts, targetLanguage);
  if (batch) return batch;
  const out: string[] = [];
  for (const t of texts) out.push(await translateOne(t, targetLanguage));
  return out;
}

/**
 * Translate a full transcript text blob into targetLanguage.
 */
