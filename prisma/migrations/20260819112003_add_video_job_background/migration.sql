-- DropIndex
DROP INDEX "video_jobs_reelFilename_language_aspect_key";

-- AlterTable
ALTER TABLE "video_jobs" ADD COLUMN     "backgroundId" TEXT NOT NULL DEFAULT 'none';

-- CreateIndex
CREATE UNIQUE INDEX "video_jobs_reelFilename_language_aspect_backgroundId_key" ON "video_jobs"("reelFilename", "language", "aspect", "backgroundId");
