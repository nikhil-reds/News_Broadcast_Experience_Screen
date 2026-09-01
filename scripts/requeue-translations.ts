/**
 * Re-run translations (and the TTS takes built from them) for a generation
 * ------------------------------------------------------------------------
 *     npx tsx scripts/requeue-translations.ts              # latest generation
 *     npx tsx scripts/requeue-translations.ts <generationId>
 *
 * WHY this is needed: every failure path in lib/translation.ts falls back to
 * returning the SOURCE text (`catch -> return text`, and
 * `result.translation?.trim() || text`). So when GEMINI_MODEL pointed at a
 * retired model, all 4 "translations" were stored as the original English and
 * their tasks still reported `completed` — no retry would ever fix that on its
 * own, because nothing failed. The TTS takes were then synthesized from that
 * English text, which is why the German audio spoke English words.
 *
 * Two phases, because the TTS job payload carries the text to speak: the
 * translations must land in the DB before the audio can be re-queued from
 * them. Phase 2 waits for phase 1, then enqueues TTS per language.
 *
 * Workers must be running (npm run worker:all).
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  enqueueTranslations,
  enqueueAudioConversion,
  TRANSLATION_LANGUAGES,
} from "@/lib/queue";
import { GEMINI_MODEL } from "@/lib/gemini";

const POLL_MS = 4_000;
const TRANSLATION_WAIT_MS = 5 * 60 * 1000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function main() {
  const requested = process.argv[2];

  const generationId =
    requested ??
    (await prisma.broadcastSession.findFirst({ orderBy: { seq: "desc" }, select: { id: true } }))
      ?.id;

  if (!generationId) {
    console.error("[requeue] no generation found");
    process.exitCode = 1;
    return;
  }

  const transcript = await prisma.transcript.findFirst({
    where: { generationId },
    orderBy: { createdAt: "desc" },
    include: { segments: { orderBy: { segmentIndex: "asc" } } },
  });

  if (!transcript || transcript.segments.length === 0) {
    console.error(`[requeue] generation ${generationId} has no transcript segments`);
    process.exitCode = 1;
    return;
  }

  // The pipeline's `filename` is the BARE audio filename, not the
  // /api/asset/audio/... URL that Transcript.sourceAudio stores — it becomes the
  // MinIO object key prefix (`<filename>.<langCode>.txt` / `.wav`). Passing the
  // URL instead writes objects under a stray `api/asset/audio/` prefix. Same
  // derivation as filenameFromSourceAudio in app/api/audio-language/route.ts.
  const filename = decodeURIComponent(transcript.sourceAudio.split("/").pop() || "");
  // TranslationJobSegment.id is numeric; segmentIndex is the numeric identity
  // TranscriptSegment carries (its own id is a uuid) — same shape lib/
  // transcribe.ts enqueues with.
  const segments = transcript.segments.map((s) => ({
    id: s.segmentIndex,
    start: s.start,
    end: s.end,
    text: s.text,
  }));

  console.log(`[requeue] model in use: ${GEMINI_MODEL}`);
  console.log(
    `[requeue] generation ${generationId} — transcript ${transcript.id}, ${segments.length} segment(s) of "${filename}"`
  );

  // Snapshot the English source so phase 2 can tell a real translation from
  // another silent fallback.
  const englishByIndex = new Map(segments.map((s) => [s.id, s.text]));

  // --- Phase 1: translations -------------------------------------------------
  for (const { langCode } of TRANSLATION_LANGUAGES) {
    await prisma.generationTask.updateMany({
      where: { generationId, taskType: `translation-${langCode}` },
      data: { attempt: 0, recoveryAttempt: 0, errorMessage: null },
    });
  }

  await enqueueTranslations(filename, segments, transcript.id, generationId);
  console.log(`[requeue] queued ${TRANSLATION_LANGUAGES.length} translation job(s), waiting…`);

  const deadline = Date.now() + TRANSLATION_WAIT_MS;
  let translations: { id: string; language: string; langCode: string; text: string }[] = [];

  while (Date.now() < deadline) {
    await sleep(POLL_MS);

    const tasks = await prisma.generationTask.findMany({
      where: { generationId, taskType: { startsWith: "translation-" } },
      select: { taskType: true, status: true, errorMessage: true },
    });

    const done = tasks.filter((t) => t.status === "completed").length;
    const failed = tasks.filter((t) => t.status === "failed");
    console.log(`[requeue] translations: ${done}/${tasks.length} completed, ${failed.length} failed`);

    for (const f of failed) console.error(`[requeue]   ${f.taskType}: ${f.errorMessage}`);

    if (done + failed.length >= tasks.length && tasks.length > 0) break;
  }

  translations = await prisma.transcriptTranslation.findMany({
    where: { transcriptId: transcript.id },
    select: { id: true, language: true, langCode: true, text: true },
    orderBy: { language: "asc" },
  });

  // --- Phase 2: TTS from the freshly translated text -------------------------
  let queuedAudio = 0;
  for (const t of translations) {
    const segs = await prisma.transcriptTranslationSegment.findMany({
      where: { translationId: t.id },
      select: { segmentIndex: true, text: true },
      orderBy: { segmentIndex: "asc" },
    });

    const untouched = segs.filter((s) => englishByIndex.get(s.segmentIndex) === s.text).length;
    const verdict =
      segs.length > 0 && untouched === segs.length
        ? "STILL ENGLISH — not re-synthesizing"
        : `translated (${segs.length - untouched}/${segs.length} segment(s) changed)`;

    console.log(`[requeue] ${t.language}: ${verdict}`);
    console.log(`[requeue]   ${t.text.slice(0, 90)}`);

    if (segs.length > 0 && untouched === segs.length) continue;

    await prisma.generationTask.updateMany({
      where: { generationId, taskType: `tts-${t.langCode}` },
      data: { attempt: 0, recoveryAttempt: 0, errorMessage: null },
    });
    await enqueueAudioConversion(t.langCode, t.id, filename, t.text, generationId);
    queuedAudio += 1;
  }

  console.log(`[requeue] queued ${queuedAudio} TTS job(s) from the new translations`);
}

main()
  .catch((error) => {
    console.error("[requeue] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // lib/queue.ts holds open Redis connections; exit explicitly.
    process.exit(process.exitCode ?? 0);
  });
