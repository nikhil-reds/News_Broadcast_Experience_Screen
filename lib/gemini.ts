/**
 * Minimal Gemini REST client — same shape as the other model clients in this
 * repo (lib/qwen.ts, lib/cosyvoice.ts): plain `fetch`, no SDK dependency.
 *
 * Video is too big for an inline request part, so the flow is:
 *   uploadFile() -> waitUntilActive() -> generateJson() -> deleteFile()
 */

const GEMINI_API_BASE = (
  process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com"
).replace(/\/$/, "");

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

/** Video reasoning on a multi-minute take is slow; give it room. */
const GENERATE_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 900_000);
const FILE_ACTIVE_TIMEOUT_MS = 600_000;
const FILE_POLL_INTERVAL_MS = 3_000;

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set — add it to .env before running this worker.");
  }
  return key;
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return `${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ""}`;
}

export interface GeminiFile {
  /** Resource name, e.g. `files/abc123`. */
  name: string;
  uri: string;
  mimeType: string;
}

/** Resumable upload of one media file to the Gemini Files API. */
export async function uploadFile(
  bytes: Buffer,
  mimeType: string,
  displayName: string
): Promise<GeminiFile> {
  const startRes = await fetch(`${GEMINI_API_BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey(),
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!startRes.ok) {
    throw new Error(`Gemini upload start failed: ${await readError(startRes)}`);
  }

  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini upload start returned no x-goog-upload-url header");
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(bytes),
  });
  if (!uploadRes.ok) {
    throw new Error(`Gemini upload failed: ${await readError(uploadRes)}`);
  }

  const { file } = await uploadRes.json();
  if (!file?.name || !file?.uri) {
    throw new Error("Gemini upload returned no file handle");
  }
  return { name: file.name, uri: file.uri, mimeType: file.mimeType || mimeType };
}

/**
 * Uploaded video sits in PROCESSING while Gemini decodes it; referencing it
 * before it is ACTIVE is rejected.
 */
export async function waitUntilActive(file: GeminiFile): Promise<void> {
  const deadline = Date.now() + FILE_ACTIVE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const res = await fetch(`${GEMINI_API_BASE}/v1beta/${file.name}`, {
      headers: { "x-goog-api-key": apiKey() },
    });
    if (!res.ok) throw new Error(`Gemini file poll failed: ${await readError(res)}`);

    const state = (await res.json()).state;
    if (state === "ACTIVE") return;
    if (state === "FAILED") throw new Error(`Gemini failed to process ${file.name}`);

    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
  }

  throw new Error(`Gemini file ${file.name} was still processing after 10 minutes`);
}

/** Best-effort cleanup; uploaded files also expire on their own after 48h. */
export async function deleteFile(file: GeminiFile): Promise<void> {
  try {
    await fetch(`${GEMINI_API_BASE}/v1beta/${file.name}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": apiKey() },
    });
  } catch (err: any) {
    console.warn(`Could not delete Gemini file ${file.name}: ${err.message}`);
  }
}

export type GeminiPart =
  | { text: string }
  | { file_data: { mime_type: string; file_uri: string } };

export function filePart(file: GeminiFile): GeminiPart {
  return { file_data: { mime_type: file.mimeType, file_uri: file.uri } };
}

/**
 * One generateContent call pinned to JSON output by `responseSchema`, so the
 * caller gets a parsed object instead of prose it has to scrape.
 */
export async function generateJson<T>(
  parts: GeminiPart[],
  responseSchema: Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${GEMINI_API_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema,
          },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) throw new Error(`Gemini generateContent failed: ${await readError(res)}`);

    const body = await res.json();
    const candidate = body.candidates?.[0];
    // 2.5 Pro interleaves reasoning parts; only the answer parts carry output.
    const text = (candidate?.content?.parts || [])
      .filter((p: any) => typeof p.text === "string" && !p.thought)
      .map((p: any) => p.text)
      .join("");

    if (!text.trim()) {
      throw new Error(
        `Gemini returned no text (finishReason: ${candidate?.finishReason || "unknown"})`
      );
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}
