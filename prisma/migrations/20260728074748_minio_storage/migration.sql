-- AlterTable
ALTER TABLE "audio_files" ADD COLUMN     "bucket" TEXT NOT NULL DEFAULT 'audio',
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "objectKey" TEXT;

-- CreateTable
CREATE TABLE "video_recordings" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'videos',
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_recordings_filename_key" ON "video_recordings"("filename");
