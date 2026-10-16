import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { AUDIO_BUCKET, uploadObject } from "@/lib/minio";
import { enqueueHighlightAnalysis, enqueueTranscription } from "@/lib/queue";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function latestSession() {
  const session = await prisma.broadcastSession.findFirst({
    orderBy: { seq: "desc" },
  });

  if (session) return session;

  return prisma.broadcastSession.create({
    data: { status: "processing", pipelineStatus: "processing" },
  });
}

async function maybeQueueHighlight(generationId: string) {
  const recordings = await prisma.videoRecording.findMany({
    where: { sessionId: generationId, filename: { not: { startsWith: "highlight-" } } },
    orderBy: { createdAt: "desc" },
  });

  const cam1 = recordings.find((r) => r.filename.startsWith("camera-recording-"));
  const cam2 = recordings.find((r) => r.filename.startsWith("camera2-recording-"));
  const cam3 = recordings.find((r) => r.filename.startsWith("camera3-recording-"));

  if (!cam1 || !cam2 || !cam3) {
    console.log("[demo-audio] skipped highlight queue: latest session does not have all 3 camera recordings");
    return;
  }

  await enqueueHighlightAnalysis(cam1.filename, cam2.filename, cam3.filename, generationId);
  console.log(`[demo-audio] queued highlight analysis for ${cam1.filename}`);
}

async function main() {
  const sourcePath = path.resolve(process.cwd(), "public/demo/demo-audio.wav");
  const buffer = await readFile(sourcePath);
  if (buffer.length === 0) {
    throw new Error(`Demo audio is empty: ${sourcePath}`);
  }

  const session = await latestSession();
  const filename = `master-audio-demo-${stamp()}.wav`;
  const url = `/api/asset/${AUDIO_BUCKET}/${encodeURIComponent(filename)}`;

  await uploadObject(AUDIO_BUCKET, filename, buffer, "audio/wav");
  await prisma.audioFile.create({
    data: {
      filename,
      url,
      bucket: AUDIO_BUCKET,
      objectKey: filename,
      contentType: "audio/wav",
      size: buffer.length,
      sessionId: session.id,
    },
  });

  await prisma.broadcastSession.update({
    where: { id: session.id },
    data: { status: "processing", pipelineStatus: "processing", endedAt: session.endedAt ?? new Date() },
  });

  await enqueueTranscription(filename, session.id);
  await maybeQueueHighlight(session.id);

  console.log(`[demo-audio] uploaded ${filename}`);
  console.log(`[demo-audio] generation ${session.seq} (${session.id})`);
  console.log("[demo-audio] queued transcription; translation and TTS will fan out after Whisper returns speech segments");
}

main()
  .catch((err) => {
    console.error("[demo-audio] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
