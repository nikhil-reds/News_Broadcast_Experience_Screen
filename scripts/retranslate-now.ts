/**
 * Translate a generation's transcript in-process, then queue the TTS takes
 * ------------------------------------------------------------------------
 *     npx tsx scripts/retranslate-now.ts              # latest generation
 *     npx tsx scripts/retranslate-now.ts <generationId>
 *
 * Unlike scripts/requeue-translations.ts (which hands the work to the
 * translation workers), this does the Gemini call in THIS process and writes
 * the result itself. Use it when the queue path is ambiguous — e.g. more than
 * one `npm run worker:all` is running, so you cannot tell which process
 * consumed a job or read its logs.
 *
 * It verifies the output actually differs from the English source before
 * persisting, so a silent fallback in lib/translation.ts (every failure path
 * there returns the SOURCE text) can no longer be mistaken for success.
 *
 * TTS is still queued, since the audio has to be synthesized by a worker — the
 * TTS job payload carries the text, so it must be queued AFTER the translation
 * is stored.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { translateSegmentTexts } from "@/lib/translation";
import { persistTranslation } from "@/lib/transcript-language";
import { enqueueAudioConversion, TRANSLATION_LANGUAGES } from "@/lib/queue";
import { GEMINI_MODEL } from "@/lib/gemini";

async function main() {
  const requested = process.argv[2];

  const generationId =
    requested ??
    (await prisma.broadcastSession.findFirst({ orderBy: { seq: "desc" }, select: { id: true } }))
      ?.id;

  if (!generationId) {
    console.error("[retranslate] no generation found");
    process.exitCode = 1;
    return;
  }

  const transcript = await prisma.transcript.findFirst({
    where: { generationId },
    orderBy: { createdAt: "desc" },
    include: { segments: { orderBy: { segmentIndex: "asc" } } },
  });

  if (!transcript || transcript.segments.length === 0) {
    console.error(`[retranslate] generation ${generationId} has no transcript segments`);
    process.exitCode = 1;
    return;
  }

  // Same derivation as filenameFromSourceAudio in app/api/audio-language/route.ts —
  // the bare filename is the MinIO object-key prefix.
  const filename = decodeURIComponent(transcript.sourceAudio.split("/").pop() || "");
  const sourceTexts = transcript.segments.map((s) => s.text);

  console.log(`[retranslate] model: ${GEMINI_MODEL}`);
  console.log(
    `[retranslate] generation ${generationId} — ${sourceTexts.length} segment(s) of "${filename}"`
  );

  let ok = 0;
  let queuedAudio = 0;

  for (const { language, langCode } of TRANSLATION_LANGUAGES) {
    const translated = await translateSegmentTexts(sourceTexts, language);

    const changed = translated.filter((t, i) => t !== sourceTexts[i]).length;
    if (changed === 0) {
      console.error(
        `[retranslate] ${language}: ✗ came back identical to the English source — Gemini call failed and lib/translation.ts fell back. NOT persisting.`
      );
      continue;
    }

    const translation = await persistTranslation({
      transcriptId: transcript.id,
      language,
      langCode,
      filename,
      segments: transcript.segments.map((s) => ({ start: s.start, end: s.end })),
      translatedTexts: translated,
      generationId,
    });

    await prisma.generationTask.updateMany({
      where: { generationId, taskType: `translation-${langCode}` },
      data: { status: "completed", attempt: 0, recoveryAttempt: 0, errorMessage: null },
    });

    ok += 1;
    console.log(`[retranslate] ${language}: ✓ ${changed}/${translated.length} segment(s) translated`);
    console.log(`[retranslate]   ${translated[0].slice(0, 90)}`);

    await prisma.generationTask.updateMany({
      where: { generationId, taskType: `tts-${langCode}` },
      data: { attempt: 0, recoveryAttempt: 0, errorMessage: null },
    });
    await enqueueAudioConversion(langCode, translation.id, filename, translation.text, generationId);
    queuedAudio += 1;
  }

  console.log(
    `[retranslate] ${ok}/${TRANSLATION_LANGUAGES.length} language(s) written, ${queuedAudio} TTS job(s) queued`
  );
  if (ok < TRANSLATION_LANGUAGES.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[retranslate] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
