-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "participantEmail" TEXT,
    "consentType" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "documentVersion" TEXT NOT NULL,
    "referenceId" TEXT,
    "notes" TEXT,
    "grantedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_events" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consents_status_createdAt_idx" ON "consents"("status", "createdAt");
CREATE INDEX "consents_consentType_idx" ON "consents"("consentType");
CREATE INDEX "consents_participantEmail_idx" ON "consents"("participantEmail");
CREATE INDEX "consent_events_consentId_createdAt_idx" ON "consent_events"("consentId", "createdAt");

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "consents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
