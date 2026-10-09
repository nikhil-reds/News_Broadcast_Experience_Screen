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

/** Internal adapter contract for the future Qwen2.5-VL service. */
export async function analyzeFrames(prompt: string, images: string[]): Promise<VisionManifest> {
  const response = await fetch(`${VISION_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: QWEN_VL_MODEL,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...images.map((image) => ({ type: "image_url", image_url: { url: image } }))] }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(Number(process.env.QWEN_VL_TIMEOUT_MS || 300000)),
  });
  if (!response.ok) throw new Error(`Qwen-VL HTTP ${response.status}`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Qwen-VL returned no manifest");
  const parsed = JSON.parse(raw) as VisionManifest;
  if (!parsed || typeof parsed.title !== "string" || !Array.isArray(parsed.segments)) {
    throw new Error("Qwen-VL returned an invalid manifest");
  }
  return parsed;
}
