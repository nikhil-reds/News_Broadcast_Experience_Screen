import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { enqueueAllBackgroundsForSource } from "@/lib/queue";

async function main() {
  const latestReel = await prisma.videoRecording.findFirst({
    where: { filename: { startsWith: "highlight-" } },
    orderBy: { createdAt: "desc" },
    select: { filename: true, sessionId: true, createdAt: true },
  });

  if (!latestReel) {
    console.error("[requeue-highlight-greenscreen] no edited highlight reel found");
    process.exitCode = 1;
    return;
  }

  if (latestReel.sessionId) {
    await prisma.generationTask.updateMany({
      where: { generationId: latestReel.sessionId, taskType: { startsWith: "greenscreen-" } },
      data: { attempt: 0, recoveryAttempt: 0, errorMessage: null },
    });
  }

  const jobs = await enqueueAllBackgroundsForSource(latestReel.filename, latestReel.sessionId);
  console.log(
    `[requeue-highlight-greenscreen] queued ${jobs.length} background job(s) for ${latestReel.filename}` +
      ` (${latestReel.createdAt.toISOString()})`
  );
}

main()
  .catch((error) => {
    console.error("[requeue-highlight-greenscreen] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
