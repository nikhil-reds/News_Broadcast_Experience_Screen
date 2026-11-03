-- Retain legacy audio and allow independently cached voice/model variants.
ALTER TABLE "translation_audio"
  ADD COLUMN "variantKey" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "voiceId" TEXT NOT NULL DEFAULT 'legacy-cloned',
  ADD COLUMN "modelRevision" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "referenceHash" TEXT NOT NULL DEFAULT '';
DROP INDEX "translation_audio_translationId_key";
CREATE UNIQUE INDEX "translation_audio_translationId_variantKey_key" ON "translation_audio"("translationId", "variantKey");
CREATE INDEX "translation_audio_translationId_voiceId_idx" ON "translation_audio"("translationId", "voiceId");
