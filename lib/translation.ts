import { generateJson, GEMINI_MODEL } from "@/lib/gemini";

export const TRANSLATION_MODEL = GEMINI_MODEL;

/** Translate a batch of texts into targetLanguage in a single Gemini call. */
export async function translateBatch(
  texts: string[],
  targetLanguage: string
): Promise<string[] | null> {
  if (texts.length === 0) return [];

  const prompt = [
    "You are a professional broadcast translation engine.",
    `Translate each item of the input array into ${targetLanguage}.`,
    "The translations array MUST have exactly the same length and order as the input array.",
    "Keep the tone natural and broadcast-ready. Do not add notes or commentary.",
    `Input array: ${JSON.stringify(texts)}`,
  ].join("\n\n");

  const responseSchema = {
    type: "OBJECT",
    properties: {
      translations: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "The translated texts matching the input array order and size"
      }
    },
    required: ["translations"]
  };

  try {
    const result = await generateJson<{ translations: string[] }>(
      [{ text: prompt }],
      responseSchema
    );
    if (result && Array.isArray(result.translations) && result.translations.length === texts.length) {
      return result.translations.map((t) => String(t).trim());
    }
  } catch (error: any) {
    console.error("Gemini translateBatch error:", error.message);
  }
  return null;
}

/** Translate a single line/sentence. */
export async function translateOne(text: string, targetLanguage: string): Promise<string> {
  if (!text.trim()) return text;
  const prompt = [
    `Translate the following text into ${targetLanguage}.`,
    "Keep the tone natural and broadcast-ready. Do not add notes or commentary.",
    `Text: ${text}`,
  ].join("\n\n");

  const responseSchema = {
    type: "OBJECT",
    properties: {
      translation: { type: "STRING" }
    },
    required: ["translation"]
  };

  try {
    const result = await generateJson<{ translation: string }>(
      [{ text: prompt }],
      responseSchema
    );
    return result.translation?.trim() || text;
  } catch (error: any) {
    console.error("Gemini translateOne error:", error.message);
    return text;
  }
}

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
export async function translateText(text: string, targetLanguage: string): Promise<string> {
  if (!text.trim()) return text;

  const prompt = [
    "You are a professional broadcast translation engine.",
    `Translate the following broadcast transcript into ${targetLanguage}.`,
    "Keep the tone natural and broadcast-ready. Do not add notes or commentary.",
    `Transcript:\n${text}`,
  ].join("\n\n");

  const responseSchema = {
    type: "OBJECT",
    properties: {
      translation: { type: "STRING" }
    },
    required: ["translation"]
  };

  try {
    const result = await generateJson<{ translation: string }>(
      [{ text: prompt }],
      responseSchema
    );
    return result.translation?.trim() || text;
  } catch (error: any) {
    console.error("Gemini translateText error:", error.message);
    return translateOne(text, targetLanguage);
  }
}
