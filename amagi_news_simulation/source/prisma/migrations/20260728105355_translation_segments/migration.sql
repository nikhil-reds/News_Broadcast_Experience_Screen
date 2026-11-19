-- CreateTable
CREATE TABLE "transcript_translation_segments" (
    "id" TEXT NOT NULL,
    "translationId" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "start" DOUBLE PRECISION NOT NULL,
    "end" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_translation_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transcript_translation_segments_translationId_idx" ON "transcript_translation_segments"("translationId");

-- AddForeignKey
ALTER TABLE "transcript_translation_segments" ADD CONSTRAINT "transcript_translation_segments_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "transcript_translations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
