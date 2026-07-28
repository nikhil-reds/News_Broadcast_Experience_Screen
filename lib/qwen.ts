const QWEN_API_URL = (process.env.QWEN_API_URL || "http://localhost:11434").replace(/\/$/, "");
export const QWEN_MODEL = process.env.QWEN_MODEL || "qwen2.5:3b";

/** Call the Qwen (ollama) model with a prompt and return the raw response text. */
export async function callQwen(prompt: string, json: boolean): Promise<string> {
  const controller = new AbortController();
  // Qwen on CPU can be slow; allow up to 5 minutes.
  const timeoutId = setTimeout(() => controller.abort(), 300000);
  try {
    const res = await fetch(`${QWEN_API_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: QWEN_MODEL,
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
      return arr.map((t) => String(t).trim());
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
    "Respond with ONLY the translated text, no quotes, no notes.",
    `Text: ${text}`,
  ].join("\n\n");
  try {
    const raw = await callQwen(prompt, false);
    return raw || text;
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
    'Respond with ONLY a JSON object of the form {"translation": "..."}',
    "Keep the tone natural and broadcast-ready. Do not add notes or commentary.",
    `Transcript:\n${text}`,
  ].join("\n\n");

  try {
    const raw = await callQwen(jsonPrompt, true);
    const parsed = JSON.parse(raw);
    if (typeof parsed.translation === "string" && parsed.translation.trim()) {
      return parsed.translation.trim();
    }
  } catch {
    /* fall through to plain-text prompt */
  }

  return translateOne(text, targetLanguage);
}
