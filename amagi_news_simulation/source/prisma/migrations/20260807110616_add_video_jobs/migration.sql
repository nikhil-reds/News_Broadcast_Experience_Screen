-- CreateTable
CREATE TABLE "video_jobs" (
    "id" TEXT NOT NULL,
    "reelFilename" TEXT NOT NULL,
    "sourceAudio" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "outputFilename" TEXT,
    "outputUrl" TEXT,
    "size" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_jobs_reelFilename_language_aspect_key" ON "video_jobs"("reelFilename", "language", "aspect");
