import { prisma } from "@/lib/prisma";
import { AUDIO_BUCKET, VIDEO_BUCKET, TRANSCRIPTS_BUCKET, deleteObject } from "@/lib/minio";
import { GREEN_SCREEN_BACKGROUNDS, composedFilename } from "@/lib/green-screen";
import { cameraIdFromFilename } from "@/lib/camera-recordings";
import { SCREEN_REQUIREMENTS, VARIANT_SCREENS, computeScreenBaseStatus, logTask } from "@/lib/generation";

/**
 * Deletes every asset (MinIO objects + DB rows) belonging to a generation
 * that NO screen is showing or waiting on anymore — "keep only the current
 * generation" per the operator's retention choice. Never deletes:
 *   - the single newest generation (it may still become someone's NEXT)
 *   - a generation any screen's live-computed base status still points to
 *   - a generation any variant screen's ScreenPublication current/pending still points to
 *   - a generation with any GenerationTask still `pending`/`processing`
 *     (something is actively being computed against it right now)
 *
 * Safe to call often and concurrently: it only ever acts on generations that
 * are unambiguously unreferenced at the moment it runs, and every deletion is
 * independently wrapped so one bad generation can't abort the sweep.
 */
export async function cleanupSupersededGenerations(): Promise<{ deleted: string[]; kept: string[] }> {
  const generations = await prisma.broadcastSession.findMany({ orderBy: { seq: "desc" } });
  if (generations.length <= 1) return { deleted: [], kept: generations.map((g) => g.id) };

  const keep = new Set<string>([generations[0].id]);

  for (const screenId of Object.keys(SCREEN_REQUIREMENTS).map(Number)) {
    const status = await computeScreenBaseStatus(screenId);
    if (status?.generationId) keep.add(status.generationId);
  }

  const publications = await prisma.screenPublication.findMany({
    where: { screenId: { in: Array.from(VARIANT_SCREENS) } },
  });
  for (const pub of publications) {
    if (pub.currentGenerationId) keep.add(pub.currentGenerationId);
    if (pub.pendingGenerationId) keep.add(pub.pendingGenerationId);
  }

  const deleted: string[] = [];
  const kept: string[] = [];

  for (const gen of generations) {
    if (keep.has(gen.id)) {
      kept.push(gen.id);
      continue;
    }
    const activeTasks = await prisma.generationTask.count({
      where: { generationId: gen.id, status: { in: ["pending", "processing"] } },
    });
    if (activeTasks > 0) {
      kept.push(gen.id);
      continue;
    }

    try {
      await deleteGenerationAssets(gen.id);
      deleted.push(gen.id);
      logTask({ generationId: gen.id, taskType: "cleanup", status: "completed" });
    } catch (err) {
      // Every markTaskCompleted/publishVariant fires this sweep — closely-
      // timed completions (e.g. 4 TTS jobs finishing seconds apart) can run
      // two sweeps concurrently against the same keep-set snapshot, both
      // deciding the same generation is safe to delete. The loser's delete
      // hits Prisma's "record not found" (P2025) because the winner already
      // removed it — that's a successful outcome, not a failure.
      const alreadyGone = (err as { code?: string })?.code === "P2025";
      logTask({
        generationId: gen.id,
        taskType: "cleanup",
        status: alreadyGone ? "completed" : "failed",
        error: alreadyGone ? "already deleted by a concurrent sweep" : err instanceof Error ? err.message : String(err),
      });
      if (alreadyGone) deleted.push(gen.id);
      else kept.push(gen.id);
    }
  }

  return { deleted, kept };
}

async function deleteGenerationAssets(generationId: string): Promise<void> {
  const recordings = await prisma.videoRecording.findMany({ where: { sessionId: generationId } });
  const cam1 = recordings.find((r) => cameraIdFromFilename(r.filename) === 1);

  for (const rec of recordings) {
    await deleteObject(rec.bucket, rec.objectKey).catch(() => {});
  }

  // Green-screen composites aren't tracked in any DB table (pure MinIO cache
  // keyed by background+source, see lib/green-screen.ts) — derive their keys
  // from camera 1's take rather than querying for them.
  if (cam1) {
    for (const bg of GREEN_SCREEN_BACKGROUNDS) {
      await deleteObject(VIDEO_BUCKET, composedFilename(bg.id, cam1.filename)).catch(() => {});
    }
  }

  const audioFiles = await prisma.audioFile.findMany({ where: { sessionId: generationId } });
  for (const audio of audioFiles) {
    await deleteObject(AUDIO_BUCKET, audio.objectKey || audio.filename).catch(() => {});
  }

  const transcripts = await prisma.transcript.findMany({
    where: { generationId },
    include: { translations: { include: { audio: true } } },
  });
  for (const transcript of transcripts) {
    await deleteObject(TRANSCRIPTS_BUCKET, `${transcript.sourceAudio}.txt`).catch(() => {});
    for (const translation of transcript.translations) {
      await deleteObject(translation.bucket, translation.objectKey).catch(() => {});
      if (translation.audio) {
        await deleteObject(translation.audio.bucket, translation.audio.objectKey).catch(() => {});
      }
    }
  }

  const videoJobs = await prisma.videoJob.findMany({ where: { generationId } });
  for (const job of videoJobs) {
    if (job.outputFilename) {
      await deleteObject(VIDEO_BUCKET, job.outputFilename).catch(() => {});
    }
  }

  // DB rows: delete children with no cascade from BroadcastSession first
  // (Transcript/TranscriptTranslation/TranslationAudio/VideoJob all use
  // onDelete: SetNull on their generationId FK, not Cascade — deleting the
  // BroadcastSession row alone would just orphan them, not remove them).
  await prisma.$transaction([
    prisma.videoJob.deleteMany({ where: { generationId } }),
    prisma.transcript.deleteMany({ where: { generationId } }), // cascades TranscriptSegment/TranscriptTranslation/TranscriptTranslationSegment/TranslationAudio
    prisma.videoRecording.deleteMany({ where: { sessionId: generationId } }),
    prisma.audioFile.deleteMany({ where: { sessionId: generationId } }),
    // No ScreenPublication row should ever reference `generationId` here —
    // the caller's `keep` set already excludes any generation referenced by
    // current/pendingGenerationId. GenerationTask rows cascade automatically
    // when the BroadcastSession row goes.
    prisma.broadcastSession.delete({ where: { id: generationId } }),
  ]);
}
