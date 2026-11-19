-- CreateTable
CREATE TABLE "speaker_profiles" (
    "id" TEXT NOT NULL,
    "audioFileId" TEXT NOT NULL,
    "generationId" TEXT,
    "gender" TEXT NOT NULL DEFAULT 'unknown',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pitchHz" DOUBLE PRECISION,
    "referenceBucket" TEXT NOT NULL DEFAULT 'speaker-reference',
    "referenceObjectKey" TEXT NOT NULL,
    "referenceUrl" TEXT NOT NULL,
    "analysisEngine" TEXT NOT NULL DEFAULT 'ffmpeg-autocorrelation-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speaker_profiles_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "translation_audio" ADD COLUMN "voiceMode" TEXT NOT NULL DEFAULT 'default-preset';
ALTER TABLE "translation_audio" ADD COLUMN "speakerGender" TEXT NOT NULL DEFAULT 'unknown';

-- CreateIndex
CREATE UNIQUE INDEX "speaker_profiles_audioFileId_key" ON "speaker_profiles"("audioFileId");
CREATE INDEX "speaker_profiles_generationId_idx" ON "speaker_profiles"("generationId");

-- AddForeignKey
ALTER TABLE "speaker_profiles" ADD CONSTRAINT "speaker_profiles_audioFileId_fkey" FOREIGN KEY ("audioFileId") REFERENCES "audio_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
