import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { withFlowWork } from "@/lib/flow-lifecycle";
import { cleanupSupersededGenerations, reconcileSavedFlow } from "@/lib/generation-cleanup";
import { uploadObject, minioClient, VIDEO_BUCKET, AUDIO_BUCKET, TRANSCRIPTS_BUCKET, TTS_AUDIO_BUCKET, SPEAKER_REFERENCE_BUCKET, objectExists, ensureBucket } from "@/lib/minio";
import { transcriptionQueue, flowQueues } from "@/lib/queue";
import { redisConnection } from "@/lib/redis";

// The harness MUST supply a separate database, Redis server and test buckets.
assert(new URL(process.env.DATABASE_URL!).pathname.startsWith("/flow_retention_test_"));
assert.equal(process.env.REDIS_PORT, "16379");
const buckets = [VIDEO_BUCKET, AUDIO_BUCKET, TRANSCRIPTS_BUCKET, TTS_AUDIO_BUCKET, SPEAKER_REFERENCE_BUCKET];
assert(buckets.every(bucket => bucket.startsWith("flow-retention-test-")));
const bytes = Buffer.from("test recording bytes");
let checks = 0;
const pass = (message: string) => { checks++; console.log(`PASS ${message}`); };

async function save(id: string, cameras: number[], audio = false) {
  await withFlowWork(id, async () => {
    for (const camera of cameras) {
      const filename = `${camera === 1 ? "camera" : `camera${camera}`}-recording-${id}.mp4`;
      await uploadObject(VIDEO_BUCKET, filename, bytes);
      await prisma.videoRecording.create({ data: { sessionId: id, filename, objectKey: filename, bucket: VIDEO_BUCKET, url: filename, size: bytes.length } });
    }
    if (audio) {
      const filename = `master-audio-${id}.wav`;
      await uploadObject(AUDIO_BUCKET, filename, bytes);
      await prisma.audioFile.create({ data: { sessionId: id, filename, objectKey: filename, bucket: AUDIO_BUCKET, url: filename, size: bytes.length } });
    }
  });
}

async function main() {
  // Shared content deliberately sits in a media bucket: no bucket-wide purge.
  await ensureBucket(VIDEO_BUCKET);
  for (const key of ["backgrounds/shared.png", "ads/shared.mp4", "voice-models/model.bin"])
    await minioClient.putObject(VIDEO_BUCKET, key, bytes);
  await prisma.broadcastScreen.create({ data: { screenNumber: 1, name: "Keep settings", settings: '{"volume":0.7}' } });
  await prisma.adCampaign.create({ data: { sponsor: "Keep ad", text: "Keep", code: "test", endTime: new Date(Date.now() + 86400000) } });
  const legacyKey = "camera-recording-legacy.mp4";
  await minioClient.putObject(VIDEO_BUCKET, legacyKey, bytes);
  await prisma.videoRecording.create({ data: { filename: legacyKey, objectKey: legacyKey, bucket: VIDEO_BUCKET, url: legacyKey, size: bytes.length, createdAt: new Date("2000-01-01") } });
  const historical = await prisma.broadcastSession.create({ data: { retentionManaged: false } });
  await save(historical.id, [1, 2, 3], true);
  await cleanupSupersededGenerations();
  assert.equal((await prisma.broadcastSession.findUniqueOrThrow({ where: { id: historical.id } })).retiredAt, null);
  assert.equal(await objectExists(VIDEO_BUCKET, legacyKey), true);
  pass("startup alone preserves historical flows until a new recording is saved");
  const a = await prisma.broadcastSession.create({ data: {} });
  await save(a.id, [1, 2, 3], true);
  await cleanupSupersededGenerations();
  assert.equal(await objectExists(VIDEO_BUCKET, legacyKey), false);
  assert.equal(await prisma.videoRecording.count({ where: { sessionId: null } }), 0);
  pass("legacy recordings without a session are removed by explicit ownership");
  const sourceAudio = await prisma.audioFile.findFirstOrThrow({ where: { sessionId: a.id } });
  const transcript = await prisma.transcript.create({ data: { generationId: a.id, audioFileId: sourceAudio.id, sourceAudio: `/api/asset/${AUDIO_BUCKET}/${sourceAudio.filename}`, text: "old", duration: 1 } });
  const translation = await prisma.transcriptTranslation.create({ data: { generationId: a.id, transcriptId: transcript.id, language: "Hindi", langCode: "hi", text: "old", bucket: TRANSCRIPTS_BUCKET, objectKey: "old-translation.txt", url: "old" } });
  const generatedFiles = [
    [TRANSCRIPTS_BUCKET, `${sourceAudio.filename}.txt`],
    [TRANSCRIPTS_BUCKET, "old-translation.txt"],
    [TTS_AUDIO_BUCKET, "old-voice.wav"],
    [VIDEO_BUCKET, "old-export.mp4"],
    [SPEAKER_REFERENCE_BUCKET, "old-speaker.wav"],
    [TRANSCRIPTS_BUCKET, `highlight-${a.id}.mp4.json`],
    [VIDEO_BUCKET, `composites/older-version/highlight-${a.id}/background.mp4`],
  ];
  for (const [bucket, key] of generatedFiles) { await ensureBucket(bucket); await minioClient.putObject(bucket, key, bytes); }
  await prisma.translationAudio.create({ data: { generationId: a.id, translationId: translation.id, language: "Hindi", langCode: "hi", bucket: TTS_AUDIO_BUCKET, objectKey: "old-voice.wav", url: "old", size: bytes.length } });
  await prisma.speakerProfile.create({ data: { audioFileId: sourceAudio.id, generationId: a.id, referenceBucket: SPEAKER_REFERENCE_BUCKET, referenceObjectKey: "old-speaker.wav", referenceUrl: "old" } });
  await prisma.videoRecording.create({ data: { sessionId: a.id, filename: `highlight-${a.id}.mp4`, objectKey: `highlight-${a.id}.mp4`, bucket: VIDEO_BUCKET, url: "old", size: bytes.length } });
  await prisma.videoJob.create({ data: { generationId: a.id, reelFilename: `highlight-${a.id}.mp4`, sourceAudio: sourceAudio.filename, language: "Hindi", aspect: "portrait", outputFilename: "old-export.mp4" } });
  const b = await prisma.broadcastSession.create({ data: {} });
  await save(b.id, [1, 2], true);
  await cleanupSupersededGenerations();
  assert.equal((await prisma.broadcastSession.findUniqueOrThrow({ where: { id: a.id } })).retiredAt, null);
  pass("incomplete replacement keeps the existing flow");

  // Include unreferenced generated objects, as happens after metadata failure.
  await withFlowWork(a.id, () => uploadObject(TTS_AUDIO_BUCKET, "partial-render.wav", bytes));
  await transcriptionQueue.add("test", { generationId: a.id, filename: "old.wav" }, { jobId: "old-test", delay: 600000 });
  await prisma.screenPublication.create({ data: { screenId: 7, currentGenerationId: a.id, pendingGenerationId: a.id } });
  await redisConnection.set(`broadcast:session:${a.id}:screen-workflow`, "old");

  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const ready = new Promise<void>(r => { started = r; });
  const running = withFlowWork(a.id, async () => {
    started(); await gate;
    await assert.rejects(() => uploadObject(TTS_AUDIO_BUCKET, "late-old-write.wav", bytes), /replaced/);
  });
  await ready;
  await save(b.id, [3]);
  await cleanupSupersededGenerations();
  assert((await prisma.broadcastSession.findUniqueOrThrow({ where: { id: a.id } })).retiredAt);
  assert.equal((await prisma.screenPublication.findUniqueOrThrow({ where: { screenId: 7 } })).currentGenerationId, null);
  assert.equal(await objectExists(TTS_AUDIO_BUCKET, "partial-render.wav"), true);
  pass("retired workers hold cleanup until they stop; old screen references clear");
  release(); await running;
  pass("retired workers cannot upload late results");

  const originalRemove = minioClient.removeObject.bind(minioClient);
  let fail = true;
  minioClient.removeObject = (async (...args: Parameters<typeof originalRemove>) => {
    if (fail) { fail = false; throw new Error("Injected storage outage"); }
    return originalRemove(...args);
  }) as typeof minioClient.removeObject;
  await cleanupSupersededGenerations();
  assert(await prisma.broadcastSession.findUnique({ where: { id: a.id } }));
  assert(await prisma.flowAsset.count({ where: { generationId: a.id } }));
  minioClient.removeObject = originalRemove;
  await cleanupSupersededGenerations();
  assert.equal(await prisma.broadcastSession.findUnique({ where: { id: a.id } }), null);
  assert.equal(await objectExists(TTS_AUDIO_BUCKET, "partial-render.wav"), false);
  assert.equal(await objectExists(TTS_AUDIO_BUCKET, "late-old-write.wav"), false);
  assert.equal(await transcriptionQueue.getJob("old-test"), undefined);
  assert.equal(await redisConnection.get(`broadcast:session:${a.id}:screen-workflow`), null);
  for (const [bucket, key] of generatedFiles) assert.equal(await objectExists(bucket, key), false, key);
  assert.equal(await prisma.transcript.count(), 0);
  assert.equal(await prisma.translationAudio.count(), 0);
  assert.equal(await prisma.videoJob.count(), 0);
  assert.equal(await prisma.speakerProfile.count(), 0);
  pass("storage failure retains ownership; retry deletes files, DB rows, jobs and caches");

  await assert.rejects(() => withFlowWork(a.id, async () => {}), /replaced/);
  await assert.rejects(() => withFlowWork(null, async () => {}), /session is required/);
  pass("deleted and unscoped flows cannot restart work");
  const c = await prisma.broadcastSession.create({ data: {} });
  const d = await prisma.broadcastSession.create({ data: {} });
  await save(d.id, [1, 2, 3], true);
  await save(c.id, [1, 2, 3], true);
  await Promise.all([reconcileSavedFlow(), reconcileSavedFlow(), reconcileSavedFlow()]);
  await cleanupSupersededGenerations();
  assert.deepEqual((await prisma.broadcastSession.findMany()).map(s => s.id), [d.id]);
  pass("concurrent completion keeps the newest session, not the last upload to finish");

  for (const key of ["backgrounds/shared.png", "ads/shared.mp4", "voice-models/model.bin"])
    assert.equal(await objectExists(VIDEO_BUCKET, key), true);
  assert.equal(await prisma.adCampaign.count(), 1);
  assert.equal((await prisma.broadcastScreen.findFirstOrThrow()).settings, '{"volume":0.7}');
  assert.equal(await prisma.videoRecording.count(), 3);
  assert.equal(await prisma.audioFile.count(), 1);
  await cleanupSupersededGenerations();
  assert.equal(await prisma.broadcastSession.count(), 1);
  pass("only latest recordings remain; shared assets, ads and settings survive repeated cleanup");
  console.log(`${checks} retention scenarios passed`);
}

main().then(() => finish(0), error => { console.error(error); return finish(1); });
async function finish(code: number) {
  for (const bucket of buckets) {
    if (!await minioClient.bucketExists(bucket)) continue;
    for await (const object of minioClient.listObjectsV2(bucket, "", true)) if (object.name) await minioClient.removeObject(bucket, object.name);
    await minioClient.removeBucket(bucket);
  }
  await Promise.all(flowQueues().map(queue => queue.close()));
  await redisConnection.quit();
  await prisma.$disconnect();
  process.exit(code);
}
