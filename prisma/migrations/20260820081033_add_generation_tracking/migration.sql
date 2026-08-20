/*
  Warnings:

  - A unique constraint covering the columns `[seq]` on the table `broadcast_sessions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "broadcast_sessions" ADD COLUMN     "pipelineStatus" TEXT NOT NULL DEFAULT 'processing',
ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "transcript_translations" ADD COLUMN     "generationId" TEXT;

-- AlterTable
ALTER TABLE "transcripts" ADD COLUMN     "generationId" TEXT;

-- AlterTable
ALTER TABLE "translation_audio" ADD COLUMN     "generationId" TEXT;

-- AlterTable
ALTER TABLE "video_jobs" ADD COLUMN     "generationId" TEXT;

-- CreateTable
CREATE TABLE "generation_tasks" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "jobId" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screen_publications" (
    "id" TEXT NOT NULL,
    "screenId" INTEGER NOT NULL,
    "currentGenerationId" TEXT,
    "currentParams" JSONB,
    "pendingGenerationId" TEXT,
    "pendingParams" JSONB,
    "pendingStatus" TEXT NOT NULL DEFAULT 'idle',
    "pendingFailureReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screen_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generation_tasks_generationId_idx" ON "generation_tasks"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "generation_tasks_generationId_taskType_key" ON "generation_tasks"("generationId", "taskType");

-- CreateIndex
CREATE UNIQUE INDEX "screen_publications_screenId_key" ON "screen_publications"("screenId");

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_sessions_seq_key" ON "broadcast_sessions"("seq");

-- CreateIndex
CREATE INDEX "transcript_translations_generationId_idx" ON "transcript_translations"("generationId");

-- CreateIndex
CREATE INDEX "transcripts_generationId_idx" ON "transcripts"("generationId");

-- CreateIndex
CREATE INDEX "translation_audio_generationId_idx" ON "translation_audio"("generationId");

-- CreateIndex
CREATE INDEX "video_jobs_generationId_idx" ON "video_jobs"("generationId");

-- AddForeignKey
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "broadcast_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_publications" ADD CONSTRAINT "screen_publications_currentGenerationId_fkey" FOREIGN KEY ("currentGenerationId") REFERENCES "broadcast_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_publications" ADD CONSTRAINT "screen_publications_pendingGenerationId_fkey" FOREIGN KEY ("pendingGenerationId") REFERENCES "broadcast_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "broadcast_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_translations" ADD CONSTRAINT "transcript_translations_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "broadcast_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translation_audio" ADD CONSTRAINT "translation_audio_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "broadcast_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "broadcast_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
