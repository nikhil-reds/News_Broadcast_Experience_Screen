-- CreateTable
CREATE TABLE "transcript_translations" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "langCode" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'transcripts',
    "objectKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'qwen2.5:3b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcript_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transcript_translations_transcriptId_language_key" ON "transcript_translations"("transcriptId", "language");

-- AddForeignKey
ALTER TABLE "transcript_translations" ADD CONSTRAINT "transcript_translations_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
