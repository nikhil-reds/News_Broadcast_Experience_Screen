import { NextRequest, NextResponse } from "next/server";
import { QWEN_MODEL, translateBatch, translateOne } from "@/lib/qwen";

interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
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
