-- AlterTable
ALTER TABLE "generation_tasks" ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "processId" INTEGER,
ADD COLUMN     "progressMessage" TEXT,
ADD COLUMN     "progressPercent" INTEGER,
ADD COLUMN     "recoveryAttempt" INTEGER NOT NULL DEFAULT 0;
