import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/redis";
import { cameraIdFromFilename, highlightFilenameFor } from "@/lib/camera-recordings";
import { AUDIO_BUCKET, VIDEO_BUCKET, TRANSCRIPTS_BUCKET, TTS_AUDIO_BUCKET, SPEAKER_REFERENCE_BUCKET, deleteObject, minioClient } from "@/lib/minio";
import { withFlowCleanup } from "@/lib/flow-lifecycle";

/** Promote only a complete saved take. seq, not upload completion order, wins. */
export async function reconcileSavedFlow(): Promise<string | null> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71402931)`;
    const sessions = await tx.broadcastSession.findMany({
      where: { retiredAt: null }, orderBy: { seq: "desc" },
      include: { videoRecordings: { select: { filename: true, size: true } }, audioFiles: { select: { size: true } } },
    });
    const latest = sessions.find(session => session.recordingSavedAt || (session.retentionManaged &&
      [1, 2, 3].every(camera => session.videoRecordings.some(record => record.size > 0 && cameraIdFromFilename(record.filename) === camera)) &&
      session.audioFiles.some(audio => audio.size > 0)
    ));
    if (!latest) return null;
    if (!latest.recordingSavedAt) await tx.broadcastSession.update({
      where: { id: latest.id }, data: { recordingSavedAt: new Date(), endedAt: new Date(), ...(latest.status === "recording" ? { status: "processing" } : {}) },
    });
    await tx.broadcastSession.updateMany({
      where: { seq: { lt: latest.seq }, retiredAt: null }, data: { retiredAt: new Date() },
    });

    // Pre-session recordings have no FK. Give only older media a durable
    // cleanup owner; never touch campaigns, shared assets or settings tables.
    const legacyWhere = { sessionId: null, createdAt: { lt: latest.startedAt } };
    const legacyGeneration = { generationId: null, createdAt: { lt: latest.startedAt } };
    const legacyCount = await tx.videoRecording.count({ where: legacyWhere }) +
      await tx.audioFile.count({ where: legacyWhere }) +
      await tx.transcript.count({ where: legacyGeneration }) +
      await tx.transcriptTranslation.count({ where: legacyGeneration }) +
      await tx.translationAudio.count({ where: legacyGeneration }) +
      await tx.videoJob.count({ where: legacyGeneration });
    if (legacyCount) {
      const legacy = await tx.broadcastSession.create({ data: { status: "retired", retiredAt: new Date() } });
      await tx.videoRecording.updateMany({ where: legacyWhere, data: { sessionId: legacy.id } });
      await tx.audioFile.updateMany({ where: legacyWhere, data: { sessionId: legacy.id } });
      await tx.transcript.updateMany({ where: legacyGeneration, data: { generationId: legacy.id } });
      await tx.transcriptTranslation.updateMany({ where: legacyGeneration, data: { generationId: legacy.id } });
      await tx.translationAudio.updateMany({ where: legacyGeneration, data: { generationId: legacy.id } });
      await tx.videoJob.updateMany({ where: legacyGeneration, data: { generationId: legacy.id } });
    }
    const retired = { retiredAt: { not: null } };
    await tx.screenPublication.updateMany({ where: { currentGeneration: retired }, data: { currentGenerationId: null, currentParams: Prisma.DbNull } });
    await tx.screenPublication.updateMany({ where: { pendingGeneration: retired }, data: {
      pendingGenerationId: null, pendingParams: Prisma.DbNull, pendingStatus: "idle", pendingFailureReason: null,
    } });
    await tx.generationTask.updateMany({ where: { generation: retired, status: { in: ["pending", "waiting-for-cosyvoice"] } }, data: { status: "cancelled", errorMessage: "Replaced by latest saved recording" } });
    return latest.id;
  }, { timeout: 30000, maxWait: 30000 });
}

export async function cleanupSupersededGenerations(): Promise<{ deleted: string[]; kept: string[] }> {
  await reconcileSavedFlow();
  const sessions = await prisma.broadcastSession.findMany({ select: { id: true, retiredAt: true } });
  // Also catches jobs which finished failing after their session was deleted.
  await pruneRetiredJobs(new Set(sessions.filter(s => !s.retiredAt).map(s => s.id)));
  const deleted: string[] = [], kept: string[] = [];
  for (const session of sessions) {
    if (!session.retiredAt) { kept.push(session.id); continue; }
    try {
      const done = await withFlowCleanup(session.id, async () => {
        const flow = await prisma.broadcastSession.findUnique({ where: { id: session.id } });
        if (!flow) return true;
        if (!flow.retiredAt) return false;
        await removeFlowJobs(session.id);
        await deleteGenerationAssets(session.id);
        return true;
      });
      (done ? deleted : kept).push(session.id);
    } catch (error) {
      kept.push(session.id);
      console.error(`[flow-cleanup] ${session.id}: deletion will retry`, error);
    }
  }
  return { deleted, kept };
}

async function pruneRetiredJobs(live: Set<string>) {
  const { flowQueues } = await import("@/lib/queue");
  for (const queue of flowQueues()) {
    const jobs = await queue.getJobs(["wait", "paused", "delayed", "prioritized", "waiting-children", "completed", "failed"]);
    for (const job of jobs) {
      if (!job.data.generationId || live.has(job.data.generationId)) continue;
      // A new session may have been created after the sweep's snapshot.
      const owner = await prisma.broadcastSession.findUnique({ where: { id: job.data.generationId }, select: { retiredAt: true } });
      if (owner && !owner.retiredAt) continue;
      try { await job.remove(); } catch (error) {
        if (await job.getState() !== "active") throw error;
      }
    }
  }
}

async function removeFlowJobs(generationId: string) {
  const { flowQueues } = await import("@/lib/queue");
  for (const queue of flowQueues()) {
    const jobs = await queue.getJobs(["wait", "paused", "delayed", "prioritized", "waiting-children", "completed", "failed", "active"]);
    for (const job of jobs) {
      if (job.data.generationId !== generationId) continue;
      // A processor waiting for our exclusive lock cannot write: it checks
      // retiredAt after acquiring its shared lock and fails without retry.
      if (await job.getState() === "active") { job.discard(); continue; }
      try { await job.remove(); } catch (error) {
        if (await job.getState() !== "active") throw error;
      }
    }
  }
}

async function deleteGenerationAssets(generationId: string) {
  const assets = new Map<string, { bucket: string; objectKey: string }>();
  const add = (bucket: string, objectKey: string | null | undefined) => {
    if (objectKey) assets.set(`${bucket}\0${objectKey}`, { bucket, objectKey });
  };
  for (const asset of await prisma.flowAsset.findMany({ where: { generationId } })) add(asset.bucket, asset.objectKey);
  const recordings = await prisma.videoRecording.findMany({ where: { sessionId: generationId } });
  const reels = new Set<string>();
  for (const record of recordings) {
    add(record.bucket, record.objectKey);
    if (record.filename.startsWith("highlight-")) reels.add(record.filename);
    if (cameraIdFromFilename(record.filename) === 1) reels.add(highlightFilenameFor(record.filename));
  }
  for (const reel of reels) {
    add(VIDEO_BUCKET, reel);
    add(TRANSCRIPTS_BUCKET, `${reel}.json`);
  }
  // Include old matting versions and every background variant, scoped to
  // this flow's exact reel stamp. No shared background file is selected.
  const stamps = new Set([...reels].map(reel => reel.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_")));
  if (stamps.size) for (const prefix of ["rvm/", "composites/"]) {
    for await (const object of minioClient.listObjectsV2(VIDEO_BUCKET, prefix, true)) {
      const parts = object.name?.split("/");
      if (parts?.length === 4 && stamps.has(parts[2])) add(VIDEO_BUCKET, object.name);
    }
  }
  const audioFiles = await prisma.audioFile.findMany({ where: { sessionId: generationId }, include: { speakerProfile: true } });
  for (const audio of audioFiles) {
    add(audio.bucket || AUDIO_BUCKET, audio.objectKey || audio.filename);
    add(TRANSCRIPTS_BUCKET, `${audio.filename}.txt`);
    for (const lang of ["de", "hi", "fr", "es"]) add(TRANSCRIPTS_BUCKET, `${audio.filename}.${lang}.txt`);
    add(SPEAKER_REFERENCE_BUCKET, `${audio.filename}.voice-reference.v1.wav`);
    if (audio.speakerProfile) add(audio.speakerProfile.referenceBucket, audio.speakerProfile.referenceObjectKey);
  }
  const transcripts = await prisma.transcript.findMany({ where: { generationId } });
  for (const transcript of transcripts) {
    const filename = decodeURIComponent(transcript.sourceAudio.split("/").pop() || "");
    if (filename) add(TRANSCRIPTS_BUCKET, `${filename}.txt`);
  }
  // Include descendants even when old rows didn't copy generationId.
  const translations = await prisma.transcriptTranslation.findMany({ where: { OR: [{ generationId }, { transcript: { generationId } }] } });
  const audios = await prisma.translationAudio.findMany({ where: { OR: [{ generationId }, { translationId: { in: translations.map(t => t.id) } }] } });
  for (const file of [...translations, ...audios]) add(file.bucket, file.objectKey);
  for (const job of await prisma.videoJob.findMany({ where: { generationId } })) {
    add(VIDEO_BUCKET, job.outputFilename);
    add(TTS_AUDIO_BUCKET, job.dubAudioKey);
    add(VIDEO_BUCKET, job.dubManifestKey);
  }
  // Persist the whole deletion manifest before touching storage. No swallowed
  // errors: DB ownership survives outages and the watchdog retries the sweep.
  for (const asset of assets.values()) {
    await prisma.flowAsset.upsert({ where: { bucket_objectKey: asset }, create: { ...asset, generationId }, update: {} });
  }
  for (const asset of assets.values()) {
    const owner = await prisma.flowAsset.findUnique({ where: { bucket_objectKey: asset } });
    if (owner?.generationId === generationId) await deleteObject(asset.bucket, asset.objectKey);
  }
  let cursor = "0";
  do {
    const result = await redisConnection.scan(cursor, "MATCH", `broadcast:session:${generationId}:*`, "COUNT", 100);
    cursor = result[0];
    if (result[1].length) await redisConnection.del(...result[1]);
  } while (cursor !== "0");
  await redisConnection.del(`broadcast:workflow:lock:${generationId}`);
  await prisma.$transaction([
    prisma.screenPublication.updateMany({ where: { currentGenerationId: generationId }, data: { currentGenerationId: null, currentParams: Prisma.DbNull } }),
    prisma.screenPublication.updateMany({ where: { pendingGenerationId: generationId }, data: { pendingGenerationId: null, pendingParams: Prisma.DbNull, pendingStatus: "idle", pendingFailureReason: null } }),
    prisma.videoJob.deleteMany({ where: { generationId } }),
    prisma.translationAudio.deleteMany({ where: { generationId } }),
    prisma.transcriptTranslation.deleteMany({ where: { generationId } }),
    prisma.transcript.deleteMany({ where: { generationId } }),
    prisma.videoRecording.deleteMany({ where: { sessionId: generationId } }),
    prisma.audioFile.deleteMany({ where: { sessionId: generationId } }),
    prisma.broadcastSession.delete({ where: { id: generationId } }),
  ]);
}
