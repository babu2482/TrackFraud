-- CreateTable
CREATE TABLE "SourceSystem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "ingestionMode" TEXT NOT NULL DEFAULT 'api',
    "baseUrl" TEXT,
    "refreshCadence" TEXT,
    "freshnessSlaHours" INTEGER,
    "supportsIncremental" BOOLEAN NOT NULL DEFAULT false,
    "lastAttemptedSyncAt" DATETIME,
    "lastSuccessfulSyncAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SourceSystem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FraudCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSystemId" TEXT NOT NULL,
    "runType" TEXT NOT NULL DEFAULT 'incremental',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cursor" TEXT,
    "windowStart" DATETIME,
    "windowEnd" DATETIME,
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsInserted" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsFailed" INTEGER NOT NULL DEFAULT 0,
    "bytesDownloaded" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "errorSummary" TEXT,
    "triggeredBy" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IngestionRun_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CanonicalEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "primaryJurisdiction" TEXT,
    "stateCode" TEXT,
    "countryCode" TEXT,
    "summary" TEXT,
    "homepageUrl" TEXT,
    "latestSourceUpdatedAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CanonicalEntity_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FraudCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntityIdentifier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "sourceSystemId" TEXT,
    "identifierType" TEXT NOT NULL,
    "identifierValue" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "confidence" REAL,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EntityIdentifier_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CanonicalEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EntityIdentifier_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntityAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "sourceSystemId" TEXT,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "aliasType" TEXT NOT NULL DEFAULT 'alternate_name',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "confidence" REAL,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EntityAlias_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CanonicalEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EntityAlias_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FraudSignalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "sourceSystemId" TEXT,
    "signalKey" TEXT NOT NULL,
    "signalLabel" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "measuredValue" REAL,
    "measuredText" TEXT,
    "thresholdValue" REAL,
    "scoreImpact" INTEGER,
    "sourceRecordId" TEXT,
    "methodologyVersion" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'active',
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FraudSignalEvent_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CanonicalEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FraudSignalEvent_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FraudSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "bandLabel" TEXT,
    "baseScore" INTEGER,
    "corroborationCount" INTEGER NOT NULL DEFAULT 0,
    "activeSignalCount" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "methodologyVersion" TEXT NOT NULL DEFAULT 'v1',
    "sourceFreshnessAt" DATETIME,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FraudSnapshot_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CanonicalEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RawArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSystemId" TEXT NOT NULL,
    "ingestionRunId" TEXT,
    "entityId" TEXT,
    "artifactType" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storageKey" TEXT NOT NULL,
    "originalUrl" TEXT,
    "checksum" TEXT,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "sourcePublishedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsedAt" DATETIME,
    "parserVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'fetched',
    "errorSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RawArtifact_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RawArtifact_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RawArtifact_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CanonicalEntity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceSystem_slug_key" ON "SourceSystem"("slug");

-- CreateIndex
CREATE INDEX "SourceSystem_categoryId_idx" ON "SourceSystem"("categoryId");

-- CreateIndex
CREATE INDEX "SourceSystem_lastSuccessfulSyncAt_idx" ON "SourceSystem"("lastSuccessfulSyncAt");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceSystemId_startedAt_idx" ON "IngestionRun"("sourceSystemId", "startedAt");

-- CreateIndex
CREATE INDEX "IngestionRun_status_startedAt_idx" ON "IngestionRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "CanonicalEntity_categoryId_normalizedName_idx" ON "CanonicalEntity"("categoryId", "normalizedName");

-- CreateIndex
CREATE INDEX "CanonicalEntity_entityType_idx" ON "CanonicalEntity"("entityType");

-- CreateIndex
CREATE INDEX "CanonicalEntity_lastSeenAt_idx" ON "CanonicalEntity"("lastSeenAt");

-- CreateIndex
CREATE INDEX "EntityIdentifier_identifierType_identifierValue_idx" ON "EntityIdentifier"("identifierType", "identifierValue");

-- CreateIndex
CREATE INDEX "EntityIdentifier_sourceSystemId_idx" ON "EntityIdentifier"("sourceSystemId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityIdentifier_entityId_identifierType_identifierValue_key" ON "EntityIdentifier"("entityId", "identifierType", "identifierValue");

-- CreateIndex
CREATE INDEX "EntityAlias_normalizedAlias_idx" ON "EntityAlias"("normalizedAlias");

-- CreateIndex
CREATE INDEX "EntityAlias_sourceSystemId_idx" ON "EntityAlias"("sourceSystemId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAlias_entityId_normalizedAlias_aliasType_key" ON "EntityAlias"("entityId", "normalizedAlias", "aliasType");

-- CreateIndex
CREATE INDEX "FraudSignalEvent_entityId_status_observedAt_idx" ON "FraudSignalEvent"("entityId", "status", "observedAt");

-- CreateIndex
CREATE INDEX "FraudSignalEvent_signalKey_observedAt_idx" ON "FraudSignalEvent"("signalKey", "observedAt");

-- CreateIndex
CREATE INDEX "FraudSignalEvent_sourceSystemId_idx" ON "FraudSignalEvent"("sourceSystemId");

-- CreateIndex
CREATE INDEX "FraudSnapshot_entityId_isCurrent_idx" ON "FraudSnapshot"("entityId", "isCurrent");

-- CreateIndex
CREATE INDEX "FraudSnapshot_score_idx" ON "FraudSnapshot"("score");

-- CreateIndex
CREATE INDEX "FraudSnapshot_computedAt_idx" ON "FraudSnapshot"("computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RawArtifact_storageKey_key" ON "RawArtifact"("storageKey");

-- CreateIndex
CREATE INDEX "RawArtifact_sourceSystemId_sourcePublishedAt_idx" ON "RawArtifact"("sourceSystemId", "sourcePublishedAt");

-- CreateIndex
CREATE INDEX "RawArtifact_ingestionRunId_idx" ON "RawArtifact"("ingestionRunId");

-- CreateIndex
CREATE INDEX "RawArtifact_entityId_idx" ON "RawArtifact"("entityId");

-- CreateIndex
CREATE INDEX "RawArtifact_status_fetchedAt_idx" ON "RawArtifact"("status", "fetchedAt");
