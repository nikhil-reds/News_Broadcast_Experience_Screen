CREATE TABLE "admin_roles" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "permissions" TEXT[] NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_roles_slug_key" ON "admin_roles"("slug");
ALTER TABLE "admin_users" ADD COLUMN "roleId" TEXT;
CREATE INDEX "admin_users_roleId_idx" ON "admin_users"("roleId");
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "admin_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "admin_audit_logs" (
  "id" TEXT NOT NULL,
  "actorEmail" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");
CREATE INDEX "admin_audit_logs_actorEmail_createdAt_idx" ON "admin_audit_logs"("actorEmail", "createdAt");
