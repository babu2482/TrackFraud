-- CreateTable
CREATE TABLE "CharityProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "ein" TEXT NOT NULL,
    "subName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipcode" TEXT,
    "subsectionCode" INTEGER,
    "foundationCode" INTEGER,
    "nteeCode" TEXT,
    "guidestarUrl" TEXT,
    "nccsUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharityProfile_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CanonicalEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CharityFiling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "sourceSystemId" TEXT,
    "taxPeriod" INTEGER NOT NULL,
    "filingYear" INTEGER NOT NULL,
    "formType" INTEGER,
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "sourceUpdatedAt" DATETIME,
    "totalRevenue" INTEGER,
    "contributionsRevenue" INTEGER,
    "programServiceRevenue" INTEGER,
    "otherRevenue" INTEGER,
    "totalExpenses" INTEGER,
    "programExpenses" INTEGER,
    "managementExpenses" INTEGER,
    "fundraisingExpenses" INTEGER,
    "programExpenseRatio" REAL,
    "overheadRatio" REAL,
    "fundraisingEfficiency" REAL,
    "compensationPct" REAL,
    "totalAssets" INTEGER,
    "totalLiabilities" INTEGER,
    "pdfUrl" TEXT,
    "rawSourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharityFiling_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CanonicalEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CharityFiling_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CharityProfile_entityId_key" ON "CharityProfile"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CharityProfile_ein_key" ON "CharityProfile"("ein");

-- CreateIndex
CREATE INDEX "CharityProfile_state_city_idx" ON "CharityProfile"("state", "city");

-- CreateIndex
CREATE INDEX "CharityProfile_nteeCode_idx" ON "CharityProfile"("nteeCode");

-- CreateIndex
CREATE INDEX "CharityProfile_subsectionCode_idx" ON "CharityProfile"("subsectionCode");

-- CreateIndex
CREATE INDEX "CharityFiling_entityId_isLatest_idx" ON "CharityFiling"("entityId", "isLatest");

-- CreateIndex
CREATE INDEX "CharityFiling_filingYear_idx" ON "CharityFiling"("filingYear");

-- CreateIndex
CREATE INDEX "CharityFiling_sourceSystemId_idx" ON "CharityFiling"("sourceSystemId");

-- CreateIndex
CREATE UNIQUE INDEX "CharityFiling_entityId_taxPeriod_key" ON "CharityFiling"("entityId", "taxPeriod");
