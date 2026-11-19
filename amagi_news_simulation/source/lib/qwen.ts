const QWEN_TRANSLATION_URL = (
  process.env.QWEN_TRANSLATION_URL || process.env.QWEN_API_URL || "http://localhost:11434"
).replace(/\/$/, "");
export const QWEN_TRANSLATION_MODEL =
  process.env.QWEN_TRANSLATION_MODEL || process.env.QWEN_MODEL || "qwen2.5:3b";
export const QWEN_MODEL = QWEN_TRANSLATION_MODEL;

const LANGUAGE_RULES: Record<string, string> = {
  German: "Write idiomatic, grammatically correct standard German as a native broadcast journalist. Translate meaning, not word order; use correct articles, cases, adjective endings, and natural verb placement. Preserve names, numbers, dates, and terminology consistently. Output German sentences only—never English, Dutch, literal machine phrasing, or translator commentary.",
  Spanish: "Write idiomatic, grammatically correct standard Spanish as a native broadcast journalist. Translate meaning, not word order; use natural articles, agreement, tense, and word choice. Preserve names, numbers, dates, and terminology consistently. Output Spanish sentences only—never English, Portuguese, literal machine phrasing, or translator commentary.",
  French: "Write idiomatic, grammatically correct standard French as a native broadcast journalist. Translate meaning, not word order; use natural articles, agreement, tense, and professional broadcast vocabulary. Preserve names, numbers, dates, and terminology consistently. Output French sentences only—never English, Spanish, literal machine phrasing, or translator commentary.",
  Hindi: "Write idiomatic, grammatically correct formal broadcast Hindi as a native Hindi news presenter. Translate meaning, not word order; use natural Hindi vocabulary, correct gender, case, tense, and sentence structure. Preserve names, numbers, dates, and terminology consistently. Write every Hindi sentence in Devanagari. Output Hindi only—never English transliteration, Bengali, Marathi, Urdu, Punjabi, literal machine phrasing, or translator commentary.",
};

function languageRule(targetLanguage: string) {
  return LANGUAGE_RULES[targetLanguage] ?? `Output natural ${targetLanguage} only and preserve the original meaning.`;
}

function hasDevanagari(text: string) {
  const letters = [...text].filter((char) => /\p{L}/u.test(char));
  const devanagari = letters.filter((char) => /[\u0900-\u097F]/u.test(char));
  return letters.length > 0 && devanagari.length / letters.length >= 0.55;
}

function validateTranslation(texts: string[], sourceTexts: string[], targetLanguage: string) {
  if (texts.length !== sourceTexts.length || texts.some((text) => !text.trim())) return false;
  if (texts.some((text, index) => text.trim() === sourceTexts[index].trim())) return false;
  if (texts.some((text) => /\b(JSON|translation|translator|explanation|input array)\b/i.test(text))) return false;
  if (targetLanguage === "Hindi" && texts.some((text) => !hasDevanagari(text))) return false;
  return true;
}

/** Call the Qwen (ollama) model with a prompt and return the raw response text. */
export async function callQwen(prompt: string, json: boolean): Promise<string> {
  const controller = new AbortController();
  // Qwen on CPU can be slow; allow up to 5 minutes.
  const timeoutId = setTimeout(() => controller.abort(), 300000);
  try {
    const res = await fetch(`${QWEN_TRANSLATION_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: QWEN_TRANSLATION_MODEL,
        prompt,
        stream: false,
        ...(json ? { format: "json" } : {}),
        options: { temperature: 0.1, num_ctx: 8192 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Qwen HTTP ${res.status}`);
    const body = await res.json();
    return String(body.response || "").trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Translate a batch of texts into targetLanguage in a single Qwen call. */
export async function translateBatch(
  texts: string[],
  targetLanguage: string
): Promise<string[] | null> {
  const prompt = [
    "You are a professional broadcast translation engine.",
    `Translate each item of the input array into ${targetLanguage}.`,
    languageRule(targetLanguage),
    'Respond with ONLY a JSON object of the form {"translations": ["...", "..."]}',
    "The translations array MUST have exactly the same length and order as the input array.",
    "Keep the tone natural and broadcast-ready. Do not add notes or commentary.",
    `Input array: ${JSON.stringify(texts)}`,
  ].join("\n\n");

  try {
    const raw = await callQwen(prompt, true);
    const parsed = JSON.parse(raw);
    const arr = parsed.translations;
    if (Array.isArray(arr) && arr.length === texts.length) {
      const translated = arr.map((t) => String(t).trim());
      if (validateTranslation(translated, texts, targetLanguage)) return translated;
    }
  } catch {
    /* fall through to per-item */
  }
  return null;
}

/** Translate a single line/sentence. */
export async function translateOne(text: string, targetLanguage: string): Promise<string> {
  if (!text.trim()) return text;
  const prompt = [
    `Translate the following text into ${targetLanguage}.`,
    languageRule(targetLanguage),
    "Respond with ONLY the translated text, no quotes, no notes.",
    `Text: ${text}`,
  ].join("\n\n");
  try {
    const raw = await callQwen(prompt, false);
    return validateTranslation([raw], [text], targetLanguage) ? raw : text;
  } catch {
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
  if (!validateTranslation(out, texts, targetLanguage)) {
    throw new Error(`${targetLanguage} translation failed language-quality validation`);
  }
  return out;
}

/**
 * Translate a full transcript text blob into targetLanguage.
 * Uses JSON-mode for reliability, falling back to a plain-text prompt.
 */
export async function translateText(text: string, targetLanguage: string): Promise<string> {
  if (!text.trim()) return text;

  const jsonPrompt = [
    "You are a professional broadcast translation engine.",
    `Translate the following broadcast transcript into ${targetLanguage}.`,
    languageRule(targetLanguage),
    'Respond with ONLY a JSON object of the form {"translation": "..."}',
    "Keep the tone natural and broadcast-ready. Do not add notes or commentary.",
    `Transcript:\n${text}`,
  ].join("\n\n");

  try {
    const raw = await callQwen(jsonPrompt, true);
    const parsed = JSON.parse(raw);
    if (typeof parsed.translation === "string" && parsed.translation.trim()) {
      const translated = parsed.translation.trim();
      if (validateTranslation([translated], [text], targetLanguage)) return translated;
    }
  } catch {
    /* fall through to plain-text prompt */
  }

  const translated = await translateOne(text, targetLanguage);
  if (!validateTranslation([translated], [text], targetLanguage)) {
    throw new Error(`${targetLanguage} translation failed language-quality validation`);
  }
  return translated;
}
