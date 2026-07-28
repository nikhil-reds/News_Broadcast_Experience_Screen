import { NextRequest, NextResponse } from "next/server";

interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
}

const QWEN_API_URL = (process.env.QWEN_API_URL || "http://localhost:11434").replace(/\/$/, "");
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen2.5:3b";

/** Call the Qwen (ollama) model with a prompt and return the raw response text. */
async function callQwen(prompt: string, json: boolean): Promise<string> {
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
async function translateBatch(texts: string[], targetLanguage: string): Promise<string[] | null> {
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

/** Fallback: translate a single line. */
async function translateOne(text: string, targetLanguage: string): Promise<string> {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const segments: Segment[] = Array.isArray(body.segments) ? body.segments : [];
    const targetLanguage: string = String(body.targetLanguage || "").trim();

    if (!targetLanguage) {
      return NextResponse.json({ error: "targetLanguage is required" }, { status: 400 });
    }
    if (segments.length === 0) {
      return NextResponse.json({ error: "no segments to translate" }, { status: 400 });
    }

    const texts = segments.map((s) => s.text);

    // Try a single batched call first, fall back to per-segment on mismatch.
    let translations = await translateBatch(texts, targetLanguage);
    if (!translations) {
      translations = [];
      for (const t of texts) {
        translations.push(await translateOne(t, targetLanguage));
      }
    }

    const translatedSegments: Segment[] = segments.map((s, i) => ({
      ...s,
      text: translations![i] || s.text,
    }));

    return NextResponse.json({
      success: true,
      targetLanguage,
      model: QWEN_MODEL,
      segments: translatedSegments,
      text: translatedSegments.map((s) => s.text).join(" "),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Translation failed", details: error.message },
      { status: 500 }
    );
  }
}
