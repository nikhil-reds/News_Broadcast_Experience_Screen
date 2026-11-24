-- Keep the migration safe for databases that received the documented
-- emergency ALTER TABLE command before this migration was packaged.
ALTER TABLE "broadcast_sessions"
  ADD COLUMN IF NOT EXISTS "selectedAudioLanguage" TEXT NOT NULL DEFAULT 'English',
  ADD COLUMN IF NOT EXISTS "selectedBrightness" INTEGER NOT NULL DEFAULT 100;
