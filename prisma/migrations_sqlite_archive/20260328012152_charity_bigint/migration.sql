/*
  Warnings:

  - You are about to alter the column `contributionsRevenue` on the `CharityFiling` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `fundraisingExpenses` on the `CharityFiling` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `managementExpenses` on the `CharityFiling` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `otherRevenue` on the `CharityFiling` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `programExpenses` on the `CharityFiling` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `programServiceRevenue` on the `CharityFiling` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `totalAssets` on the `CharityFiling` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `totalExpenses` on the `CharityFiling` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `totalLiabilities` on the `CharityFiling` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `totalRevenue` on the `CharityFiling` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CharityFiling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "sourceSystemId" TEXT,
    "taxPeriod" INTEGER NOT NULL,
    "filingYear" INTEGER NOT NULL,
    "formType" INTEGER,
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "sourceUpdatedAt" DATETIME,
    "totalRevenue" BIGINT,
    "contributionsRevenue" BIGINT,
    "programServiceRevenue" BIGINT,
    "otherRevenue" BIGINT,
    "totalExpenses" BIGINT,
    "programExpenses" BIGINT,
    "managementExpenses" BIGINT,
    "fundraisingExpenses" BIGINT,
    "programExpenseRatio" REAL,
    "overheadRatio" REAL,
    "fundraisingEfficiency" REAL,
    "compensationPct" REAL,
    "totalAssets" BIGINT,
    "totalLiabilities" BIGINT,
    "pdfUrl" TEXT,
    "rawSourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharityFiling_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CanonicalEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CharityFiling_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CharityFiling" ("compensationPct", "contributionsRevenue", "createdAt", "entityId", "filingYear", "formType", "fundraisingEfficiency", "fundraisingExpenses", "id", "isLatest", "managementExpenses", "otherRevenue", "overheadRatio", "pdfUrl", "programExpenseRatio", "programExpenses", "programServiceRevenue", "rawSourceUrl", "sourceSystemId", "sourceUpdatedAt", "taxPeriod", "totalAssets", "totalExpenses", "totalLiabilities", "totalRevenue", "updatedAt") SELECT "compensationPct", "contributionsRevenue", "createdAt", "entityId", "filingYear", "formType", "fundraisingEfficiency", "fundraisingExpenses", "id", "isLatest", "managementExpenses", "otherRevenue", "overheadRatio", "pdfUrl", "programExpenseRatio", "programExpenses", "programServiceRevenue", "rawSourceUrl", "sourceSystemId", "sourceUpdatedAt", "taxPeriod", "totalAssets", "totalExpenses", "totalLiabilities", "totalRevenue", "updatedAt" FROM "CharityFiling";
DROP TABLE "CharityFiling";
ALTER TABLE "new_CharityFiling" RENAME TO "CharityFiling";
CREATE INDEX "CharityFiling_entityId_isLatest_idx" ON "CharityFiling"("entityId", "isLatest");
CREATE INDEX "CharityFiling_filingYear_idx" ON "CharityFiling"("filingYear");
CREATE INDEX "CharityFiling_sourceSystemId_idx" ON "CharityFiling"("sourceSystemId");
CREATE UNIQUE INDEX "CharityFiling_entityId_taxPeriod_key" ON "CharityFiling"("entityId", "taxPeriod");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
