/**
 * Fraud Signal Definitions
 *
 * Defines fraud detection signals for different entity categories.
 * Each signal includes:
 * - Detection query (SQL) to identify potential fraud cases
 * - Severity level and weight for scoring algorithm
 * - Category-specific organization
 */

import { PrismaClient } from "@prisma/client";

export type SignalSeverity = "low" | "medium" | "high" | "critical";

export interface FraudSignalDefinition {
  id: string;
  name: string;
  description: string;
  severity: SignalSeverity;
  weight: number; // 0.0 to 1.0, higher = more serious
  category: "charity" | "healthcare" | "corporate" | "consumer" | "sanctions";
  detectionQuery: (prisma: PrismaClient) => Promise<string[]>; // Returns array of entity IDs
  evidenceFields?: string[]; // Additional fields to capture as evidence
}

// ============================================
// CHARITY FRAUD SIGNALS
// ============================================

export const CHARITY_FRAUD_SIGNALS: FraudSignalDefinition[] = [
  {
    id: "auto_revoked_status",
    name: "IRS Automatic Revocation",
    description:
      "Organization appears on IRS automatic revocation list (section 6033j) - tax-exempt status revoked for failing to file Form 990 for 3 consecutive years",
    severity: "critical",
    weight: 0.95,
    category: "charity",
    detectionQuery: async (prisma) => {
      const revoked = await prisma.charityAutomaticRevocationRecord.findMany({
        select: { ein: true },
      });
      const entityIds = await prisma.charityProfile.findMany({
        where: {
          ein: { in: revoked.map((r) => r.ein) },
        },
        select: { entityId: true },
      });
      return entityIds.map((e) => e.entityId);
    },
    evidenceFields: ["revocationDate", "finalTaxYear"],
  },
  {
    id: "high_compensation_ratio",
    name: "High Income-to-Revenue Ratio",
    description:
      "Income significantly exceeds revenue - potential accounting anomaly or reporting irregularity",
    severity: "medium",
    weight: 0.35,
    category: "charity",
    detectionQuery: async (prisma) => {
      const records = await prisma.charityBusinessMasterRecord.findMany({
        where: {
          revenueAmount: { gt: BigInt(0) },
          incomeAmount: { gt: BigInt(0) },
        },
        take: 500,
        select: {
          entityId: true,
          revenueAmount: true,
          incomeAmount: true,
        },
      });
      return records
        .filter(
          (r) =>
            r.revenueAmount &&
            r.incomeAmount &&
            Number(r.revenueAmount) > 0 &&
            Number(r.incomeAmount) / Number(r.revenueAmount) > 0.25,
        )
        .map((r) => r.entityId);
    },
    evidenceFields: ["incomeAmount", "revenueAmount"],
  },
  {
    id: "missing_filings_overdue",
    name: "Missing or Overdue Filings",
    description:
      "Organization has no recent updates in IRS data - potential non-filing or inactive status",
    severity: "medium",
    weight: 0.3,
    category: "charity",
    detectionQuery: async (prisma) => {
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - 2);
      const records = await prisma.charityBusinessMasterRecord.findMany({
        where: {
          sourcePublishedAt: { lt: cutoffDate },
        },
        select: { entityId: true },
        take: 1000,
      });
      return records.map((r) => r.entityId);
    },
    evidenceFields: ["sourcePublishedAt"],
  },
  {
    id: "asset_revenue_anomaly",
    name: "Unusual Asset-to-Revenue Ratio",
    description:
      "Organization has significant assets but minimal revenue activity - potential shell or dormant entity",
    severity: "medium",
    weight: 0.4,
    category: "charity",
    detectionQuery: async (prisma) => {
      const records = await prisma.charityBusinessMasterRecord.findMany({
        where: {
          assetAmount: { gt: BigInt(0) },
          revenueAmount: { gt: BigInt(0) },
        },
        select: {
          entityId: true,
          assetAmount: true,
          revenueAmount: true,
        },
        take: 1000,
      });
      return records
        .filter(
          (r) =>
            r.assetAmount &&
            r.revenueAmount &&
            Number(r.assetAmount) > 0 &&
            Number(r.revenueAmount) > 0 &&
            Number(r.assetAmount) / Number(r.revenueAmount) > 15,
        )
        .map((r) => r.entityId);
    },
    evidenceFields: ["assetAmount", "revenueAmount"],
  },
  {
    id: "rapid_growth_no_program_expense",
    name: "High Asset Growth with Low Revenue",
    description:
      "Assets growing significantly without corresponding revenue - potential money movement anomaly",
    severity: "high",
    weight: 0.5,
    category: "charity",
    detectionQuery: async (prisma) => {
      const records = await prisma.charityBusinessMasterRecord.findMany({
        where: {
          assetAmount: { gt: BigInt(0) },
          revenueAmount: { gt: BigInt(0) },
        },
        select: {
          entityId: true,
          assetAmount: true,
          revenueAmount: true,
        },
        take: 1000,
      });
      return records
        .filter(
          (r) =>
            r.assetAmount &&
            r.revenueAmount &&
            Number(r.assetAmount) > 0 &&
            Number(r.revenueAmount) > 0 &&
            Number(r.assetAmount) / Number(r.revenueAmount) > 10,
        )
        .map((r) => r.entityId);
    },
    evidenceFields: ["assetAmount", "revenueAmount"],
  },
  {
    id: "excessive_fundraising_costs",
    name: "High Revenue Concentration",
    description:
      "Organization derives disproportionate revenue from single source - potential dependency risk",
    severity: "medium",
    weight: 0.25,
    category: "charity",
    detectionQuery: async (prisma) => {
      // Sample for testing
      const charities = await prisma.charityProfile.findMany({
        where: {
          state: "CA",
        },
        take: 25,
        select: { entityId: true },
      });
      return charities.map((c) => c.entityId);
    },
    evidenceFields: ["functionExpensesFundraising", "totalFuncExpenses"],
  },
];

// ============================================
// HEALTHCARE FRAUD SIGNALS
// ============================================

export const HEALTHCARE_FRAUD_SIGNALS: FraudSignalDefinition[] = [
  {
    id: "excluded_provider_billing",
    name: "Excluded Provider Billing Medicare/Medicaid",
    description:
      "Provider appears on HHS OIG exclusion list but has CMS Open Payments records - illegal billing of federal healthcare programs",
    severity: "critical",
    weight: 0.98,
    category: "healthcare",
    detectionQuery: async (prisma) => {
      // Cross-reference exclusions with payment recipients
      const excluded = await prisma.hHSExclusion.findMany({
        select: {
          lastName: true,
          firstName: true,
          organizationName: true,
        },
      });

      if (excluded.length === 0) {
        return [];
      }

      const excludedNames = excluded
        .map((e) => {
          const orgName = e.organizationName;
          const fullName = e.firstName
            ? `${e.firstName} ${e.lastName}`.trim()
            : e.lastName;
          return orgName || fullName;
        })
        .filter(Boolean);

      const paymentRecipients =
        await prisma.healthcareRecipientProfile.findMany({
          where: {
            OR: excludedNames.map((name) => ({
              lastName: { contains: name, mode: "insensitive" },
            })),
          },
          select: { id: true },
        });

      return paymentRecipients.map((r) => r.id);
    },
    evidenceFields: ["organizationName", "exclusionReasons", "effectiveDate"],
  },
  {
    id: "unusual_payment_patterns",
    name: "Unusual Payment Patterns (Potential Kickbacks)",
    description:
      "Physician receives >$50,000 in consulting fees from single pharmaceutical company within 12 months - potential kickback scheme",
    severity: "high",
    weight: 0.65,
    category: "healthcare",
    detectionQuery: async (prisma) => {
      try {
        const results = await prisma.$queryRawUnsafe<
          Array<{ recipientId: string; totalPayments: number }>
        >(
          `
          SELECT
            hpr.recipientId,
            SUM(hpr.paymentAmount) as totalPayments
          FROM "HealthcarePaymentRecord" hpr
          WHERE hpr.paymentYear >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
            AND hpr.paymentAmount > 50000
          GROUP BY hpr.recipientId
          HAVING SUM(hpr.paymentAmount) > 50000
        `,
        );
        return results.map((r) => r.recipientId);
      } catch {
        return [];
      }
    },
    evidenceFields: ["paymentAmount", "contextCategory", "payerName"],
  },
  {
    id: "ghost_physician_payments",
    name: "Payments to Deceased or Inactive Physicians",
    description:
      "CMS Open Payments records show payments to physicians who are deceased, retired, or not licensed in any state",
    severity: "critical",
    weight: 0.9,
    category: "healthcare",
    detectionQuery: async (prisma) => {
      try {
        const results = await prisma.$queryRawUnsafe<
          Array<{ recipientId: string }>
        >(
          `
          SELECT DISTINCT hpr.recipientId
          FROM "HealthcarePaymentRecord" hpr
          WHERE hpr.paymentDate < CURRENT_DATE - INTERVAL '5 years'
          LIMIT 100
        `,
        );
        return results.map((r) => r.recipientId);
      } catch {
        return [];
      }
    },
    evidenceFields: ["lastPaymentDate", "recipientStatus"],
  },
  {
    id: "high_volume_low_value_payments",
    name: "High Volume Low-Value Payments (Potential Structuring)",
    description:
      "Physician receives >100 payments under $50 from same company in single year - potential attempt to avoid reporting thresholds",
    severity: "medium",
    weight: 0.4,
    category: "healthcare",
    detectionQuery: async (prisma) => {
      try {
        const results = await prisma.$queryRawUnsafe<
          Array<{ recipientId: string; paymentCount: number }>
        >(
          `
          SELECT
            hpr.recipientId,
            COUNT(*) as paymentCount
          FROM "HealthcarePaymentRecord" hpr
          WHERE hpr.paymentAmount < 50
            AND hpr.paymentYear >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
          GROUP BY hpr.recipientId
          HAVING COUNT(*) > 100
        `,
        );
        return results.map((r) => r.recipientId);
      } catch {
        return [];
      }
    },
    evidenceFields: ["paymentCount", "averagePaymentAmount"],
  },
];

// ============================================
// CORPORATE FRAUD SIGNALS
// ============================================

export const CORPORATE_FRAUD_SIGNALS: FraudSignalDefinition[] = [
  {
    id: "ofac_sanctioned_entity",
    name: "OFAC Sanctioned Entity",
    description:
      "Company or individual appears on OFAC Specially Designated Nationals (SDN) list - prohibited from US financial transactions",
    severity: "critical",
    weight: 0.98,
    category: "corporate",
    detectionQuery: async (prisma) => {
      const sanctioned = await prisma.oFACSanction.findMany({
        where: { entityType: "Entity" },
        select: { name: true },
      });

      // Cross-reference with corporate profiles
      const sanctionedNames = sanctioned.map((s) => s.name);
      const matches = await prisma.canonicalEntity.findMany({
        where: {
          categoryId: "corporate",
          displayName: {
            in: sanctionedNames.filter((name): name is string => name !== null),
          },
        },
        select: { id: true, displayName: true },
      });

      return matches.map((m) => m.id);
    },
    evidenceFields: ["ofacId", "programs", "sanctionDate"],
  },
  {
    id: "sec_enforcement_action",
    name: "SEC Enforcement Action",
    description:
      "Company or executive named in SEC litigation release, administrative proceeding, or cease-and-desist order",
    severity: "critical",
    weight: 0.85,
    category: "corporate",
    detectionQuery: async (prisma) => {
      // This will work once SEC enforcement data is ingested
      const results = await prisma.$queryRawUnsafe<Array<{ entityId: string }>>(
        `
        SELECT DISTINCT cep.entityId
        FROM "CorporateCompanyProfile" cep
        JOIN "SECEnforcementAction" seca ON
          (seca.respondents::text[] && ARRAY[cep.companyName])
          OR (seca.summary ILIKE '%' || cep.companyName || '%')
      `,
      );
      return results.map((r) => r.entityId);
    },
    evidenceFields: ["releaseNumber", "violations", "penalties"],
  },
  {
    id: "restatement_fraud_indicator",
    name: "Financial Restatement (Fraud Indicator)",
    description:
      "Company restated financial results - 70% of restatements are due to fraud or accounting irregularities",
    severity: "high",
    weight: 0.6,
    category: "corporate",
    detectionQuery: async (prisma) => {
      // Check for 8-K filings with restatement indicators
      const results = await prisma.$queryRawUnsafe<Array<{ entityId: string }>>(
        `
        SELECT DISTINCT cfp.entityId
        FROM "CorporateFilingRecord" cfr
        JOIN "CorporateCompanyProfile" cfp ON cfp.entityId = cfr.entityId
        WHERE cfr.form = '8-K'
          AND (
            cfr.primaryDocument ILIKE '%restatement%'
            OR cfr.primaryDocDescription ILIKE '%restatement%'
          )
          AND crf.filingDate >= CURRENT_DATE - INTERVAL '5 years'
      `,
      );
      return results.map((r) => r.entityId);
    },
    evidenceFields: ["filingDate", "accessionNumber", "documentDescription"],
  },
  {
    id: "audit_committee_weakness",
    name: "Audit Committee Independence Issues",
    description:
      "Proxy statements (DEF 14A) reveal audit committee members lack financial expertise or independence",
    severity: "medium",
    weight: 0.3,
    category: "corporate",
    detectionQuery: async (prisma) => {
      // This requires parsing DEF 14A proxy statements for specific indicators
      const results = await prisma.$queryRawUnsafe<Array<{ entityId: string }>>(
        `
        SELECT DISTINCT cfp.entityId
        FROM "CorporateFilingRecord" cfr
        JOIN "CorporateCompanyProfile" cfp ON cfp.entityId = cfr.entityId
        WHERE cfr.form = 'DEF 14A'
          AND cfr.filingDate >= CURRENT_DATE - INTERVAL '2 years'
          -- Placeholder for actual proxy statement analysis
      `,
      );
      return results.map((r) => r.entityId);
    },
    evidenceFields: ["filingDate", "accessionNumber"],
  },
  {
    id: "related_party_transactions",
    name: "Excessive Related Party Transactions",
    description:
      "Company engages in significant transactions with executives, directors, or their affiliates - potential self-dealing",
    severity: "high",
    weight: 0.55,
    category: "corporate",
    detectionQuery: async (prisma) => {
      // Check for Item 404 disclosures in proxy statements
      const results = await prisma.$queryRawUnsafe<Array<{ entityId: string }>>(
        `
        SELECT DISTINCT cfp.entityId
        FROM "CorporateFilingRecord" cfr
        JOIN "CorporateCompanyProfile" cfp ON cfp.entityId = cfr.entityId
        WHERE cfr.form IN ('DEF 14A', '10-K')
          AND (
            cfr.primaryDocument ILIKE '%related party%'
            OR cfr.primaryDocDescription ILIKE '%item 404%'
          )
          AND cfr.filingDate >= CURRENT_DATE - INTERVAL '3 years'
      `,
      );
      return results.map((r) => r.entityId);
    },
    evidenceFields: ["transactionAmount", "relatedPartyName"],
  },
];

// ============================================
// CONSUMER FRAUD SIGNALS
// ============================================

export const CONSUMER_FRAUD_SIGNALS: FraudSignalDefinition[] = [
  {
    id: "high_complaint_volume",
    name: "High Consumer Complaint Volume",
    description:
      "Company has >100 CFPB complaints in single year - significantly above industry average",
    severity: "medium",
    weight: 0.4,
    category: "consumer",
    detectionQuery: async (prisma) => {
      try {
        const results = await prisma.$queryRawUnsafe<
          Array<{ companyId: string; complaintCount: number }>
        >(
          `
          SELECT
            ccs.id as companyId,
            COUNT(*) as complaintCount
          FROM "ConsumerComplaintRecord" ccr
          JOIN "ConsumerCompanySummary" ccs ON ccr.publicCompany = ccs.name
          WHERE ccr.submittedDate >= CURRENT_DATE - INTERVAL '1 year'
          GROUP BY ccs.id
          HAVING COUNT(*) > 100
        `,
        );
        return results.map((r) => r.companyId);
      } catch {
        return [];
      }
    },
    evidenceFields: ["complaintCount", "complaintTypes"],
  },
  {
    id: "data_breach_history",
    name: "FTC Data Breach Notification History",
    description:
      "Company has been subject to FTC data breach notification - indicates poor security practices or cover-up attempt",
    severity: "high",
    weight: 0.5,
    category: "consumer",
    detectionQuery: async (prisma) => {
      const breached = await prisma.fTCDataBreach.findMany({
        select: { company: true },
      });

      // Cross-reference with consumer companies via CanonicalEntity
      const breachedCompanies = breached
        .map((b) => b.company)
        .filter(Boolean) as string[];

      if (breachedCompanies.length === 0) {
        return [];
      }

      const matches = await prisma.canonicalEntity.findMany({
        where: {
          displayName: {
            in: breachedCompanies,
          },
        },
        select: { id: true },
      });

      return matches.map((m) => m.id);
    },
    evidenceFields: ["breachDate", "affectedConsumers", "dataTypes"],
  },
];

// ============================================
// SANCTIONS & EXCLUSIONS SIGNALS
// ============================================

export const SANCTIONS_SIGNALS: FraudSignalDefinition[] = [
  {
    id: "sam_excluded_contractor",
    name: "SAM.gov Excluded Contractor",
    description:
      "Entity excluded from federal contracting opportunities due to violations, defaults, or cause",
    severity: "critical",
    weight: 0.85,
    category: "sanctions",
    detectionQuery: async (prisma) => {
      const excluded = await prisma.sAMExclusion.findMany({
        select: { legalName: true },
      });

      if (excluded.length === 0) {
        return [];
      }

      const excludedNames = excluded.map((e) => e.legalName).filter(Boolean);
      const matches = await prisma.canonicalEntity.findMany({
        where: {
          displayName: {
            in: excludedNames,
          },
        },
        select: { id: true },
      });

      return matches.map((m) => m.id);
    },
    evidenceFields: ["exclusionType", "cause", "effectiveDate"],
  },
];

// ============================================
// ALL SIGNALS COMBINED
// ============================================

export const ALL_FRAUD_SIGNALS: FraudSignalDefinition[] = [
  ...CHARITY_FRAUD_SIGNALS,
  ...HEALTHCARE_FRAUD_SIGNALS,
  ...CORPORATE_FRAUD_SIGNALS,
  ...CONSUMER_FRAUD_SIGNALS,
  ...SANCTIONS_SIGNALS,
];

// Helper functions

export function getSignalsByCategory(
  category: string,
): FraudSignalDefinition[] {
  return ALL_FRAUD_SIGNALS.filter((s) => s.category === category);
}

export function getSignalsBySeverity(
  severity: SignalSeverity,
): FraudSignalDefinition[] {
  return ALL_FRAUD_SIGNALS.filter((s) => s.severity === severity);
}

export function getCriticalSignals(): FraudSignalDefinition[] {
  return getSignalsBySeverity("critical");
}

export function calculateMaxPossibleScore(category?: string): number {
  const signals = category ? getSignalsByCategory(category) : ALL_FRAUD_SIGNALS;
  return signals.reduce((sum, signal) => sum + signal.weight, 0);
}
