/**
 * Seed one local audio or video file as the newest master audio, then queue it
 * for transcription.
 *
 *   node -r ./scripts/node-userinfo-shim.cjs ./node_modules/tsx/dist/cli.mjs \
 *     scripts/seed-audio-file.ts <path-to-wav>
 *
 * Companion to seed-demo-audio.ts, which is pinned to public/demo/demo-audio.wav.
 * This one takes any prepared WAV, so a new clip can be pushed through the
 * pipeline without editing a script. Extract the audio first if the source is a
 * video:  ffmpeg -i clip.mp4 -vn -acodec pcm_s16le -ar 44100 -ac 1 clip.wav
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { AUDIO_BUCKET, uploadObject } from "@/lib/minio";
import { enqueueTranscription } from "@/lib/queue";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function latestSession() {
  const session = await prisma.broadcastSession.findFirst({ orderBy: { seq: "desc" } });
  if (session) return session;

  return prisma.broadcastSession.create({
    data: { status: "processing", pipelineStatus: "processing" },
  });
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    throw new Error("Usage: seed-audio-file.ts <path-to-wav>");
  }

  const sourcePath = path.resolve(process.cwd(), arg);
  const buffer = await readFile(sourcePath);
  if (buffer.length === 0) {
    throw new Error(`Audio file is empty: ${sourcePath}`);
  }

  const session = await latestSession();
  const filename = `master-audio-${stamp()}.wav`;
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
    data: {
      status: "processing",
      pipelineStatus: "processing",
      endedAt: session.endedAt ?? new Date(),
    },
  });

  await enqueueTranscription(filename, session.id);

  console.log(`[seed-audio] source ${sourcePath} (${buffer.length} bytes)`);
  console.log(`[seed-audio] uploaded ${filename}`);
  console.log(`[seed-audio] generation ${session.seq} (${session.id})`);
  console.log("[seed-audio] queued transcription");
}

main()
  .catch((err) => {
    console.error("[seed-audio] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
