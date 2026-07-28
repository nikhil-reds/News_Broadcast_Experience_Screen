-- CreateTable
CREATE TABLE "audio_files" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "duration" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "sourceAudio" TEXT NOT NULL,
    "audioFileId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "duration" DOUBLE PRECISION NOT NULL,
    "sttEngine" TEXT NOT NULL DEFAULT 'Docker Faster-Whisper',
    "text" TEXT NOT NULL,
    "srtContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "start" DOUBLE PRECISION NOT NULL,
    "end" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "speaker" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_screens" (
    "id" TEXT NOT NULL,
    "screenNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "activeView" TEXT NOT NULL DEFAULT 'teleprompter',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_screens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camera_feeds" (
    "id" TEXT NOT NULL,
    "cameraNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "streamUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camera_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audio_files_filename_key" ON "audio_files"("filename");

-- CreateIndex
CREATE INDEX "transcript_segments_transcriptId_idx" ON "transcript_segments"("transcriptId");

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_screens_screenNumber_key" ON "broadcast_screens"("screenNumber");

-- CreateIndex
CREATE UNIQUE INDEX "camera_feeds_cameraNumber_key" ON "camera_feeds"("cameraNumber");

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_audioFileId_fkey" FOREIGN KEY ("audioFileId") REFERENCES "audio_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
