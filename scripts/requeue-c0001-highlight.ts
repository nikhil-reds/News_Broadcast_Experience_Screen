import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { VIDEO_BUCKET, uploadObject } from "@/lib/minio";
import { CAMERA_FILENAME_PREFIX } from "@/lib/camera-recordings";
import { markTaskCompleted } from "@/lib/generation";
import { probeDurationSeconds } from "@/lib/ffmpeg";
import { enqueueHighlightReel } from "@/lib/queue";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const sourcePath = path.resolve(process.cwd(), "public/demo/demo001.mp4");
  const buffer = await readFile(sourcePath);
  if (buffer.length === 0) {
    throw new Error(`Demo video is empty: ${sourcePath}`);
  }

  const duration = await probeDurationSeconds(sourcePath);
  const end = Math.max(1, Math.min(20, Math.floor(duration || 20)));
  const runStamp = stamp();
  const session = await prisma.broadcastSession.create({
    data: { status: "processing", pipelineStatus: "processing", endedAt: new Date() },
  });

  const filenames = {
    1: `${CAMERA_FILENAME_PREFIX[1]}demo001-${runStamp}.mp4`,
    2: `${CAMERA_FILENAME_PREFIX[2]}demo001-${runStamp}.mp4`,
    3: `${CAMERA_FILENAME_PREFIX[3]}demo001-${runStamp}.mp4`,
  } as const;

  for (const filename of Object.values(filenames)) {
    const url = `/api/asset/${VIDEO_BUCKET}/${encodeURIComponent(filename)}`;
    await uploadObject(VIDEO_BUCKET, filename, buffer, "video/mp4");
    await prisma.videoRecording.create({
      data: {
        filename,
        url,
        bucket: VIDEO_BUCKET,
        objectKey: filename,
        contentType: "video/mp4",
        size: buffer.length,
        sessionId: session.id,
      },
    });
  }

  await prisma.generationTask.upsert({
    where: { generationId_taskType: { generationId: session.id, taskType: "highlight-analysis" } },
    create: {
      generationId: session.id,
      taskType: "highlight-analysis",
      status: "completed",
      jobId: `manual-demo001-analysis-${runStamp}`,
      completedAt: new Date(),
      payload: {
        sourcePath,
        note: "Manual demo001 replay; stage 2 was enqueued directly.",
      },
    },
    update: {
      status: "completed",
      errorMessage: null,
      completedAt: new Date(),
    },
  });

  const job = await enqueueHighlightReel(
    filenames[1],
    filenames[2],
    filenames[3],
    {
      title: "demo001 reel",
      segments: [{ camera: 1, start: 0, end, reason: "Manual demo reel replay from demo001.mp4" }],
      audio: { 1: true, 2: true, 3: true },
    },
    session.id
  );

  await markTaskCompleted(session.id, "highlight-analysis", { jobId: `manual-demo001-analysis-${runStamp}` });

  console.log(`[demo001-highlight] source ${sourcePath} (${buffer.length} bytes, ${duration.toFixed(2)}s)`);
  console.log(`[demo001-highlight] generation ${session.seq} (${session.id})`);
  console.log(`[demo001-highlight] queued job ${job.id}`);
  console.log(`[demo001-highlight] segment 0-${end}s`);
  console.log(`[demo001-highlight] cam1 ${filenames[1]}`);
}

main()
  .catch((err) => {
    console.error("[demo001-highlight] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
