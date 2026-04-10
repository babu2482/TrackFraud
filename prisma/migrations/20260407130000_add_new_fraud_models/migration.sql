-- CreateTable
CREATE TABLE "SECEnforcementAction" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "releaseNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "respondents" TEXT[],
    "summary" TEXT,
    "violations" TEXT[],
    "penaltyAmount" DOUBLE PRECISION,
    "orderType" TEXT NOT NULL,
    "settled" BOOLEAN NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SECEnforcementAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FINRADisclosure" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "finraId" TEXT,
    "brokerOrFirm" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "disclosureType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "description" TEXT,
    "amount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FINRADisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HHSExclusion" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "uiEProviderId" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT,
    "middleName" TEXT,
    "organizationName" TEXT,
    "exclusionReasons" TEXT[],
    "programInvolvement" TEXT[],
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "stateLicenseInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HHSExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMSProgramSafeguardExclusion" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "cmsId" TEXT NOT NULL,
    "lastName" TEXT,
    "firstName" TEXT,
    "organizationName" TEXT,
    "exclusionType" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMSProgramSafeguardExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OFACSanction" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "ofacId" TEXT NOT NULL,
    "programs" TEXT[],
    "name" TEXT,
    "entityType" TEXT NOT NULL,
    "addresses" JSONB NOT NULL,
    "ids" JSONB NOT NULL,
    "datesOfBirth" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "placesOfBirth" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "citizenCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OFACSanction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SAMExclusion" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "uei" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "exclusionReasons" TEXT[],
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "issuingAgency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SAMExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FTCDataBreach" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "industry" TEXT,
    "breachDate" TIMESTAMP(3),
    "notificationDate" TIMESTAMP(3) NOT NULL,
    "recordsAffected" INTEGER,
    "dataTypesExposed" TEXT[],
    "settlementAmount" DOUBLE PRECISION,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FTCDataBreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FTCConsumerProtectionAction" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "docketNumber" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "respondentName" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "summary" TEXT,
    "settlementAmount" DOUBLE PRECISION,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FTCConsumerProtectionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FDAWarningLetter" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientAddress" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "violationTypes" TEXT[],
    "productCategory" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FDAWarningLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DOJCivilFraud" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "caseNumber" TEXT,
    "dateAnnounced" TIMESTAMP(3) NOT NULL,
    "defendantName" TEXT NOT NULL,
    "recoveryAmount" DOUBLE PRECISION,
    "falseClaimsAct" BOOLEAN NOT NULL,
    "summary" TEXT,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DOJCivilFraud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProPublicaNonprofit" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "ein" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "subsectionCode" TEXT,
    "foundationCode" INTEGER,
    "nteeCodes" TEXT[],
    "assetAmount" DOUBLE PRECISION,
    "incomeAmount" DOUBLE PRECISION,
    "latestFiling" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProPublicaNonprofit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SECEnforcementAction_releaseNumber_key" ON "SECEnforcementAction"("releaseNumber");

-- CreateIndex
CREATE INDEX "SECEnforcementAction_date_idx" ON "SECEnforcementAction"("date");

-- CreateIndex
CREATE INDEX "SECEnforcementAction_orderType_idx" ON "SECEnforcementAction"("orderType");

-- CreateIndex
CREATE INDEX "FINRADisclosure_brokerOrFirm_idx" ON "FINRADisclosure"("brokerOrFirm");

-- CreateIndex
CREATE INDEX "FINRADisclosure_entityType_idx" ON "FINRADisclosure"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "HHSExclusion_uiEProviderId_key" ON "HHSExclusion"("uiEProviderId");

-- CreateIndex
CREATE INDEX "HHSExclusion_lastName_firstName_idx" ON "HHSExclusion"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "HHSExclusion_effectiveDate_idx" ON "HHSExclusion"("effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "CMSProgramSafeguardExclusion_cmsId_key" ON "CMSProgramSafeguardExclusion"("cmsId");

-- CreateIndex
CREATE INDEX "CMSProgramSafeguardExclusion_lastName_firstName_idx" ON "CMSProgramSafeguardExclusion"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "CMSProgramSafeguardExclusion_effectiveDate_idx" ON "CMSProgramSafeguardExclusion"("effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "OFACSanction_ofacId_key" ON "OFACSanction"("ofacId");

-- CreateIndex
CREATE INDEX "OFACSanction_name_idx" ON "OFACSanction"("name");

-- CreateIndex
CREATE INDEX "OFACSanction_entityType_idx" ON "OFACSanction"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "SAMExclusion_uei_key" ON "SAMExclusion"("uei");

-- CreateIndex
CREATE INDEX "SAMExclusion_legalName_idx" ON "SAMExclusion"("legalName");

-- CreateIndex
CREATE INDEX "SAMExclusion_effectiveDate_idx" ON "SAMExclusion"("effectiveDate");

-- CreateIndex
CREATE INDEX "FTCDataBreach_company_idx" ON "FTCDataBreach"("company");

-- CreateIndex
CREATE INDEX "FTCDataBreach_notificationDate_idx" ON "FTCDataBreach"("notificationDate");

-- CreateIndex
CREATE INDEX "FTCConsumerProtectionAction_date_idx" ON "FTCConsumerProtectionAction"("date");

-- CreateIndex
CREATE INDEX "FTCConsumerProtectionAction_respondentName_idx" ON "FTCConsumerProtectionAction"("respondentName");

-- CreateIndex
CREATE INDEX "FDAWarningLetter_recipientName_idx" ON "FDAWarningLetter"("recipientName");

-- CreateIndex
CREATE INDEX "FDAWarningLetter_issueDate_idx" ON "FDAWarningLetter"("issueDate");

-- CreateIndex
CREATE INDEX "DOJCivilFraud_dateAnnounced_idx" ON "DOJCivilFraud"("dateAnnounced");

-- CreateIndex
CREATE INDEX "DOJCivilFraud_defendantName_idx" ON "DOJCivilFraud"("defendantName");

-- CreateIndex
CREATE UNIQUE INDEX "ProPublicaNonprofit_ein_key" ON "ProPublicaNonprofit"("ein");

-- CreateIndex
CREATE INDEX "ProPublicaNonprofit_state_city_idx" ON "ProPublicaNonprofit"("state", "city");

-- CreateIndex
CREATE INDEX "ProPublicaNonprofit_subsectionCode_idx" ON "ProPublicaNonprofit"("subsectionCode");

-- AddForeignKey
ALTER TABLE "SECEnforcementAction" ADD CONSTRAINT "SECEnforcementAction_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FINRADisclosure" ADD CONSTRAINT "FINRADisclosure_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HHSExclusion" ADD CONSTRAINT "HHSExclusion_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMSProgramSafeguardExclusion" ADD CONSTRAINT "CMSProgramSafeguardExclusion_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OFACSanction" ADD CONSTRAINT "OFACSanction_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SAMExclusion" ADD CONSTRAINT "SAMExclusion_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FTCDataBreach" ADD CONSTRAINT "FTCDataBreach_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FTCConsumerProtectionAction" ADD CONSTRAINT "FTCConsumerProtectionAction_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FDAWarningLetter" ADD CONSTRAINT "FDAWarningLetter_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DOJCivilFraud" ADD CONSTRAINT "DOJCivilFraud_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProPublicaNonprofit" ADD CONSTRAINT "ProPublicaNonprofit_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "SourceSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

