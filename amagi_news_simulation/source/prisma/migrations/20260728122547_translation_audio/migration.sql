-- CreateTable
CREATE TABLE "translation_audio" (
    "id" TEXT NOT NULL,
    "translationId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "langCode" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'tts-audio',
    "objectKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'CosyVoice2-0.5B',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translation_audio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "translation_audio_translationId_key" ON "translation_audio"("translationId");

-- AddForeignKey
ALTER TABLE "translation_audio" ADD CONSTRAINT "translation_audio_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "transcript_translations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
