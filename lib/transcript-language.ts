import { prisma } from "@/lib/prisma";
import { TRANSCRIPTS_BUCKET, uploadObject } from "@/lib/minio";
import { TRANSLATION_MODEL, translateSegmentTexts } from "@/lib/translation";
import { generateSrt, type TranscriptSegment } from "@/lib/transcribe";
import { enqueueAudioConversion } from "@/lib/queue";

export interface LanguageOpts {
  language: string;
  langCode: string;
}

export interface TranscriptLanguagePayload {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptSegment[];
  createdAt: string;
  sourceAudio: string;
}

export interface TranscriptLanguageResult {
  exists: boolean;
  transcript?: TranscriptLanguagePayload;
  srtContent?: string;
}

function filenameFromSourceAudio(sourceAudio: string): string {
  const last = sourceAudio.split("/").pop() || "";
  return decodeURIComponent(last);
}

/**
 * Save the translated `.txt` to MinIO and upsert TranscriptTranslation +
 * replace its TranscriptTranslationSegment rows. Shared by the background
 * translation workers and the on-demand cache-fill path below, so both
 * produce identical, compatible data.
 */
export async function persistTranslation(params: {
  transcriptId: string;
  language: string;
  langCode: string;
  filename: string;
  segments: { start: number; end: number }[];
  translatedTexts: string[];
}) {
  const { transcriptId, language, langCode, filename, segments, translatedTexts } = params;
  const flatText = translatedTexts.join(" ");
  const objectKey = `${filename}.${langCode}.txt`;

  await uploadObject(
    TRANSCRIPTS_BUCKET,
    objectKey,
    Buffer.from(flatText, "utf-8"),
    "text/plain; charset=utf-8"
  );
  const url = `/api/asset/${TRANSCRIPTS_BUCKET}/${encodeURIComponent(objectKey)}`;

  const translation = await prisma.$transaction(async (tx) => {
    const translation = await tx.transcriptTranslation.upsert({
      where: { transcriptId_language: { transcriptId, language } },
      create: {
        transcriptId,
        language,
        langCode,
        text: flatText,
        bucket: TRANSCRIPTS_BUCKET,
        objectKey,
        url,
        model: TRANSLATION_MODEL,
      },
      update: { text: flatText, objectKey, url, model: TRANSLATION_MODEL },
    });

    await tx.transcriptTranslationSegment.deleteMany({
      where: { translationId: translation.id },
    });
    await tx.transcriptTranslationSegment.createMany({
      data: segments.map((s, i) => ({
        translationId: translation.id,
        segmentIndex: i,
        start: s.start,
        end: s.end,
        text: translatedTexts[i] || "",
      })),
    });

    return translation;
  });

  // A translation just became available — hand it off to that language's
  // dedicated Gemini TTS audio-conversion worker. Best-effort: a queue
  // outage must not fail the translation itself. Fires regardless of whether
  // this was called by a background worker or the on-demand cache-fill path.
  if (flatText.trim()) {
    try {
      await enqueueAudioConversion(langCode, translation.id, filename, flatText);
    } catch (err: any) {
      console.error(`Failed to enqueue audio conversion for "${filename}" (${language}): ${err.message}`);
    }
  }

  return translation;
}

/**
 * Resolve a transcript for a given audio + language, keyed strictly by
 * `sourceAudio` so an audio always maps to its own transcript/translation,
 * never a stale or unrelated one.
 *
 * - `opts === null` → English: returns the transcript's own segments.
 * - `opts` set → looks up an existing TranscriptTranslation (cache hit, e.g.
 *   already computed by the background worker). On a cache miss, translates
 *   the original segments via Gemini right now and persists the result so the
 *   next request for this audio+language is instant.
 */
export async function getTranscriptForLanguage(
  sourceAudio: string,
  opts: LanguageOpts | null
): Promise<TranscriptLanguageResult> {
  const row = await prisma.transcript.findFirst({
    where: { sourceAudio },
    orderBy: { createdAt: "desc" },
    include: { segments: { orderBy: { segmentIndex: "asc" } } },
  });
  if (!row) return { exists: false };

  if (!opts) {
    const segments: TranscriptSegment[] = row.segments.map((s) => ({
      id: s.segmentIndex,
      start: s.start,
      end: s.end,
      text: s.text,
    }));
    return {
      exists: true,
      transcript: {
        text: row.text,
        language: row.language,
        duration: row.duration,
        segments,
        createdAt: row.createdAt.toISOString(),
        sourceAudio: row.sourceAudio,
      },
      srtContent: row.srtContent || generateSrt(segments),
    };
  }

  // Cache hit: a previous computation (background worker or an earlier
  // request) already produced this transcript's translation.
  const cached = await prisma.transcriptTranslation.findUnique({
    where: { transcriptId_language: { transcriptId: row.id, language: opts.language } },
    include: { segments: { orderBy: { segmentIndex: "asc" } } },
  });

  if (cached && cached.segments.length > 0) {
    const segments: TranscriptSegment[] = cached.segments.map((s) => ({
      id: s.segmentIndex,
      start: s.start,
      end: s.end,
      text: s.text,
    }));
    return {
      exists: true,
      transcript: {
        text: cached.text,
        language: opts.language,
        duration: row.duration,
        segments,
        createdAt: cached.updatedAt.toISOString(),
        sourceAudio: row.sourceAudio,
      },
      srtContent: generateSrt(segments),
    };
  }

  // Cache miss: no speech to translate, or translate now and persist for next time.
  if (row.segments.length === 0) {
    return {
      exists: true,
      transcript: {
        text: "",
        language: opts.language,
        duration: row.duration,
        segments: [],
        createdAt: row.createdAt.toISOString(),
        sourceAudio: row.sourceAudio,
      },
    };
  }

  const texts = row.segments.map((s) => s.text);
  const translatedTexts = await translateSegmentTexts(texts, opts.language);
  const filename = filenameFromSourceAudio(row.sourceAudio);

  await persistTranslation({
    transcriptId: row.id,
    language: opts.language,
    langCode: opts.langCode,
    filename,
    segments: row.segments,
    translatedTexts,
  });

  const segments: TranscriptSegment[] = row.segments.map((s, i) => ({
    id: s.segmentIndex,
    start: s.start,
    end: s.end,
    text: translatedTexts[i] || s.text,
  }));

  return {
    exists: true,
    transcript: {
      text: translatedTexts.join(" "),
      language: opts.language,
      duration: row.duration,
      segments,
      createdAt: new Date().toISOString(),
      sourceAudio: row.sourceAudio,
    },
    srtContent: generateSrt(segments),
  };
}
