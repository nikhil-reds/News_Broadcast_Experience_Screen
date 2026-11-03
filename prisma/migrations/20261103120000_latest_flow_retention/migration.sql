ALTER TABLE "broadcast_sessions" ADD COLUMN "recordingSavedAt" TIMESTAMP(3), ADD COLUMN "retiredAt" TIMESTAMP(3);
-- Historical takes remain available until the first new recording is saved.
ALTER TABLE "broadcast_sessions" ADD COLUMN "retentionManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "broadcast_sessions" ALTER COLUMN "retentionManaged" SET DEFAULT true;
CREATE TABLE "flow_assets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "generationId" TEXT NOT NULL REFERENCES "broadcast_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "bucket" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL
);
CREATE UNIQUE INDEX "flow_assets_bucket_objectKey_key" ON "flow_assets"("bucket", "objectKey");
CREATE INDEX "flow_assets_generationId_idx" ON "flow_assets"("generationId");
