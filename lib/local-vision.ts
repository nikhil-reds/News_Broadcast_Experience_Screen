import type { CameraId } from "@/lib/camera-recordings";

const VISION_URL = (
  process.env.QWEN_VL_URL || "http://localhost:11435"
).replace(/\/$/, "");
export const QWEN_VL_MODEL = process.env.QWEN_VL_MODEL || "Qwen2.5-VL-7B-Instruct";

export interface VisionSegment {
  camera: CameraId;
  start: number;
  end: number;
  reason: string;
  confidence?: number;
}

export interface VisionManifest {
  title: string;
  segments: VisionSegment[];
}

export function parseVisionManifest(raw: string): VisionManifest {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Qwen-VL JSON parse failed: ${error instanceof Error ? error.message : "unknown error"}; raw=${JSON.stringify(raw.slice(0, 1200))}`);
  }
  const value = parsed as Partial<VisionManifest>;
  if (typeof value.title !== "string" || !Array.isArray(value.segments)) {
    throw new Error(`Qwen-VL manifest schema failed: expected title:string and segments:array; keys=${Object.keys(value || {}).join(",")}`);
  }
  return value as VisionManifest;
}

/** Internal adapter contract for the future Qwen2.5-VL service. */
export async function analyzeFrames(prompt: string, images: string[]): Promise<VisionManifest> {
  const imageParts = await Promise.all(images.map(async (image) => {
    if (image.startsWith("data:")) {
      return { type: "image_url", image_url: { url: image } };
    }
    const imageResponse = await fetch(image, { signal: AbortSignal.timeout(120000) });
    if (!imageResponse.ok) throw new Error(`Qwen-VL image fetch failed: HTTP ${imageResponse.status}`);
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    return { type: "image_url", image_url: { url: `data:${contentType};base64,${bytes.toString("base64")}` } };
  }));
  const response = await fetch(`${VISION_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: QWEN_VL_MODEL,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageParts] }],
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(Number(process.env.QWEN_VL_TIMEOUT_MS || 300000)),
  });
  const responseText = await response.text();
  console.log(`[local-vision] HTTP ${response.status} response-shape=${responseText.slice(0, 180).replace(/\s+/g, " ")}`);
  if (!response.ok) throw new Error(`Qwen-VL HTTP ${response.status}: ${responseText.slice(0, 500)}`);
  let body: { choices?: Array<{ message?: { content?: string } }> };
  try {
    body = JSON.parse(responseText) as typeof body;
  } catch (error) {
    throw new Error(`Qwen-VL response JSON parse failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Qwen-VL returned no manifest");
  console.log(`[local-vision] model-content=${JSON.stringify(raw.slice(0, 1600))}`);
  return parseVisionManifest(raw);
}
