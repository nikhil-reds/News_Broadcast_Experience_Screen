-- Keep previous outputs as legacy exports, separate from selected-voice exports.
ALTER TABLE "video_jobs"
  ADD COLUMN "exportKey" TEXT,
  ADD COLUMN "audioLanguage" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN "voiceId" TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN "modelRevision" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "dubAudioKey" TEXT,
  ADD COLUMN "dubManifestKey" TEXT;
UPDATE "video_jobs" SET "exportKey" = 'legacy-' || "id";
ALTER TABLE "video_jobs" ALTER COLUMN "exportKey" SET NOT NULL;
DROP INDEX "video_jobs_reelFilename_language_aspect_backgroundId_key";
CREATE UNIQUE INDEX "video_jobs_exportKey_key" ON "video_jobs"("exportKey");
CREATE INDEX "video_jobs_reelFilename_language_aspect_backgroundId_idx" ON "video_jobs"("reelFilename", "language", "aspect", "backgroundId");
