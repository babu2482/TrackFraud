-- CreateTable
CREATE TABLE "EPAEnforcementAction" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "facilityName" TEXT,
    "violationType" TEXT NOT NULL,
    "statute" TEXT NOT NULL,
    "penaltyAmount" DOUBLE PRECISION,
    "actionDate" TIMESTAMP(3) NOT NULL,
    "resolutionDate" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EPAEnforcementAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EPAEnforcementAction_actionId_key" ON "EPAEnforcementAction"("actionId");

-- CreateIndex
CREATE INDEX "EPAEnforcementAction_actionDate_idx" ON "EPAEnforcementAction"("actionDate");

-- CreateIndex
CREATE INDEX "EPAEnforcementAction_statute_idx" ON "EPAEnforcementAction"("statute");

-- AddForeignKey
ALTER TABLE "EPAEnforcementAction" ADD CONSTRAINT "EPAEnforcementAction_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

