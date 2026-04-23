-- CreateTable
CREATE TABLE "CharityBusinessMasterRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "sourceFileCode" TEXT,
    "sourceFileUrl" TEXT,
    "careOfName" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "groupCode" TEXT,
    "subsectionCodeRaw" TEXT,
    "affiliationCode" TEXT,
    "classificationCode" TEXT,
    "rulingDateRaw" TEXT,
    "deductibilityCode" TEXT,
    "foundationCodeRaw" TEXT,
    "activityCode" TEXT,
    "organizationCode" TEXT,
    "statusCode" TEXT,
    "taxPeriodRaw" TEXT,
    "assetCode" TEXT,
    "incomeCode" TEXT,
    "filingRequirementCode" TEXT,
    "pfFilingRequirementCode" TEXT,
    "accountingPeriod" TEXT,
    "assetAmount" BIGINT,
    "incomeAmount" BIGINT,
    "revenueAmount" BIGINT,
    "nteeCode" TEXT,
    "sortName" TEXT,
    "sourcePublishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharityBusinessMasterRecord_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CanonicalEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CharityBusinessMasterRecord_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CharityBusinessMasterRecord_entityId_key" ON "CharityBusinessMasterRecord"("entityId");

-- CreateIndex
CREATE INDEX "CharityBusinessMasterRecord_sourceSystemId_sourcePublishedAt_idx" ON "CharityBusinessMasterRecord"("sourceSystemId", "sourcePublishedAt");

-- CreateIndex
CREATE INDEX "CharityBusinessMasterRecord_state_city_idx" ON "CharityBusinessMasterRecord"("state", "city");

-- CreateIndex
CREATE INDEX "CharityBusinessMasterRecord_subsectionCodeRaw_idx" ON "CharityBusinessMasterRecord"("subsectionCodeRaw");

-- CreateIndex
CREATE INDEX "CharityBusinessMasterRecord_nteeCode_idx" ON "CharityBusinessMasterRecord"("nteeCode");
