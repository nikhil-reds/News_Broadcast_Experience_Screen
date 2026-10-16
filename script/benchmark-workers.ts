import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { AUDIO_BUCKET, VIDEO_BUCKET, uploadObject } from "@/lib/minio";
import { enqueueHighlightAnalysis, enqueueTranscription } from "@/lib/queue";

async function main() {
  const video = await readFile(path.resolve("public/demo/C0001.MP4"));
  const audio = await readFile(path.resolve("public/demo/demo-audio.wav"));
  const session = await prisma.broadcastSession.create({ data: { status: "processing", pipelineStatus: "processing" } });
  const stamp = Date.now();
  const files = [
    `camera-recording-benchmark-${stamp}.mp4`,
    `camera2-recording-benchmark-${stamp}.mp4`,
    `camera3-recording-benchmark-${stamp}.mp4`,
  ];
  for (const filename of files) {
    await uploadObject(VIDEO_BUCKET, filename, video, "video/mp4");
    await prisma.videoRecording.create({ data: { filename, url: `/api/asset/${VIDEO_BUCKET}/${filename}`, bucket: VIDEO_BUCKET, objectKey: filename, contentType: "video/mp4", size: video.length, sessionId: session.id } });
  }
  const audioFilename = `benchmark-${stamp}.wav`;
  await uploadObject(AUDIO_BUCKET, audioFilename, audio, "audio/wav");
  await prisma.audioFile.create({ data: { filename: audioFilename, url: `/api/asset/${AUDIO_BUCKET}/${audioFilename}`, bucket: AUDIO_BUCKET, objectKey: audioFilename, contentType: "audio/wav", size: audio.length, sessionId: session.id } });
  await enqueueTranscription(audioFilename, session.id);
  await enqueueHighlightAnalysis(files[0], files[1], files[2], session.id);
  console.log(JSON.stringify({ generationId: session.id, seq: session.seq, startedAt: new Date().toISOString() }));
  await prisma.$disconnect();
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
