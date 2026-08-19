-- AlterTable
ALTER TABLE "audio_files" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "video_recordings" ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "broadcast_sessions" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recording',
    "selectedBackgroundId" TEXT,
    "selectedSubtitleLanguage" TEXT NOT NULL DEFAULT 'English',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audio_files_sessionId_idx" ON "audio_files"("sessionId");

-- CreateIndex
CREATE INDEX "video_recordings_sessionId_idx" ON "video_recordings"("sessionId");

-- AddForeignKey
ALTER TABLE "audio_files" ADD CONSTRAINT "audio_files_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "broadcast_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_recordings" ADD CONSTRAINT "video_recordings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "broadcast_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
