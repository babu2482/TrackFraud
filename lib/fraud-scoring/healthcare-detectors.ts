/**
 * Healthcare Fraud Signal Detection Engine
 *
 * Implements healthcare-specific fraud detection signals focused on CMS Open Payments
 * data, HHS exclusion lists, and CMS Program Safeguard exclusions.
 *
 * Signals implemented:
 * 1. excluded_provider_billing      - Provider on HHS exclusion list with active payments (50 pts, critical)
 * 2. payment_concentration          - >50% of payments from a single company (20 pts, high)
 * 3. structured_payments            - >50 small payments (<$100) in a year (15 pts, medium)
 * 4. rapid_volume_growth            - >2x year-over-year payment increase (10 pts, medium)
 * 5. cms_safeguard_exclusion        - Entity on CMS Program Safeguard list (40 pts, high)
 *
 * Each detector returns DetectedSignal[] objects that can be persisted via
 * the shared persistSignals() function from signal-detectors.ts.
 */

import { PrismaClient } from "@prisma/client";
import { persistSignals, DetectedSignal } from "./signal-detectors";

const prisma = new PrismaClient();

const METHODOLOGY_VERSION = "v2";

// ---------------------------------------------------------------------------
// Signal 1: Excluded Provider Billing
// ---------------------------------------------------------------------------

/**
 * Detect if a healthcare entity appears on the HHS OIG exclusion list
 * but has active CMS Open Payments records — a strong indicator of
 * illegal billing to federal healthcare programs.
 *
 * Score Impact: 50 points (critical severity)
 */
export async function detectExcludedProviderBilling(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Fetch the recipient profile to get name fields for matching
    const profile = await prisma.healthcareRecipientProfile.findUnique({
      where: { entityId },
    });

    if (!profile) {
      return signals;
    }

    // Build search terms from the recipient's profile
    const lastName = profile.lastName?.trim();
    const firstName = profile.firstName?.trim();

    if (!lastName && !firstName) {
      return signals;
    }

    // Also fetch the CanonicalEntity displayName as a potential org name
    const canonical = await prisma.canonicalEntity.findUnique({
      where: { id: entityId },
      select: { displayName: true },
    });
    const orgName = canonical?.displayName?.trim();

    // Query HHS exclusion list for matching names
    const exclusionMatches = await prisma.hHSExclusion.findMany({
      where: {
        AND: [
          {
            OR: [
              ...(lastName
                ? [{ lastName: { equals: lastName, mode: "insensitive" as const } }]
                : []),
              ...(firstName && lastName
                ? [
                    {
                      firstName: { equals: firstName, mode: "insensitive" as const },
                      lastName: { equals: lastName, mode: "insensitive" as const },
                    },
                  ]
                : []),
              ...(orgName
                ? [
                    {
                      organizationName: { equals: orgName, mode: "insensitive" as const },
                    },
                  ]
                : []),
            ],
          },
          // Only active exclusions (no termination date or future termination)
          {
            OR: [
              { terminationDate: null },
              { terminationDate: { gt: new Date() } },
            ],
          },
        ],
      },
      select: {
        id: true,
        uiEProviderId: true,
        lastName: true,
        firstName: true,
        organizationName: true,
        exclusionReasons: true,
        effectiveDate: true,
      },
    });

    if (exclusionMatches.length === 0) {
      return signals;
    }

    // Verify the entity actually has active payment records
    const paymentCount = await prisma.healthcarePaymentRecord.count({
      where: { recipientEntityId: entityId },
    });

    if (paymentCount === 0) {
      // No payments found — exclusion exists but no active billing detected
      return signals;
    }

    const exclusionReasons = exclusionMatches
      .flatMap((e) => e.exclusionReasons)
      .join(", ");

    for (const exclusion of exclusionMatches) {
      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "excluded_provider_billing",
        signalLabel: "Excluded Provider with Active Payments",
        severity: "critical",
        detail:
          `Provider matches HHS OIG exclusion (UI: ${exclusion.uiEProviderId}). ` +
          `Exclusion reasons: ${exclusionReasons || "not specified"}. ` +
          `Effective since: ${exclusion.effectiveDate.toISOString().split("T")[0]}.`,
        measuredValue: paymentCount,
        measuredText: `${paymentCount} payment record(s) found`,
        thresholdValue: 0,
        scoreImpact: 50,
        sourceRecordId: exclusion.id,
        methodologyVersion: METHODOLOGY_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(
      `Error detecting excluded provider billing for ${entityId}:`,
      error,
    );
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 2: Payment Concentration
// ---------------------------------------------------------------------------

/**
 * Detect if more than 50% of an entity's total payments originate
 * from a single company, which may indicate undue influence,
 * kickback arrangements, or lack of diverse payers.
 *
 * Score Impact: 20 points (high severity)
 */
export async function detectPaymentConcentration(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Fetch all payments for the entity grouped by company
    const payments = await prisma.healthcarePaymentRecord.findMany({
      where: { recipientEntityId: entityId },
      select: {
        id: true,
        companyEntityId: true,
        amountUsd: true,
        manufacturerName: true,
      },
    });

    if (payments.length === 0) {
      return signals;
    }

    // Aggregate by company
    const companyTotals = new Map<string, { total: number; count: number }>();
    let grandTotal = 0;

    for (const payment of payments) {
      const amount = payment.amountUsd ?? 0;
      grandTotal += amount;

      const existing = companyTotals.get(payment.companyEntityId) ?? {
        total: 0,
        count: 0,
      };
      existing.total += amount;
      existing.count += 1;
      companyTotals.set(payment.companyEntityId, existing);
    }

    if (grandTotal === 0) {
      return signals;
    }

    // Find the dominant payer
    let dominantCompanyId = "";
    let dominantTotal = 0;
    let dominantCount = 0;

    for (const [companyId, data] of companyTotals) {
      if (data.total > dominantTotal) {
        dominantTotal = data.total;
        dominantCount = data.count;
        dominantCompanyId = companyId;
      }
    }

    const concentrationPercent = (dominantTotal / grandTotal) * 100;
    const threshold = 50.0;

    if (concentrationPercent > threshold) {
      // Get company name for context
      const dominantPayment = payments.find(
        (p) => p.companyEntityId === dominantCompanyId,
      );

      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "payment_concentration",
        signalLabel: "High Payment Concentration from Single Payer",
        severity: "high",
        detail:
          `${concentrationPercent.toFixed(1)}% of total payments (` +
          `$${dominantTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}) ` +
          `come from a single company (${dominantPayment?.manufacturerName || dominantCompanyId}).`,
        measuredValue: concentrationPercent,
        measuredText: `${concentrationPercent.toFixed(1)}%`,
        thresholdValue: threshold,
        scoreImpact: 20,
        sourceRecordId: dominantPayment?.id,
        methodologyVersion: METHODOLOGY_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(
      `Error detecting payment concentration for ${entityId}:`,
      error,
    );
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 3: Structured Payments
// ---------------------------------------------------------------------------

/**
 * Detect if an entity received more than 50 small payments (each under
 * $100) within a single calendar year. This pattern may indicate
 * structuring — deliberately keeping individual payments below
 * reporting thresholds to avoid scrutiny.
 *
 * Score Impact: 15 points (medium severity)
 */
export async function detectStructuredPayments(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Fetch payments under $100 with program year
    const smallPayments = await prisma.healthcarePaymentRecord.findMany({
      where: {
        recipientEntityId: entityId,
        amountUsd: { lt: 100 },
        programYear: { not: null },
      },
      select: {
        id: true,
        amountUsd: true,
        programYear: true,
        manufacturerName: true,
      },
    });

    if (smallPayments.length === 0) {
      return signals;
    }

    // Group by program year
    const byYear = new Map<number, typeof smallPayments>();
    for (const payment of smallPayments) {
      const year = payment.programYear!;
      if (!byYear.has(year)) {
        byYear.set(year, []);
      }
      byYear.get(year)!.push(payment);
    }

    const threshold = 50;

    // Check each year independently
    for (const [year, yearPayments] of byYear) {
      if (yearPayments.length > threshold) {
        const totalSmallAmount = yearPayments.reduce(
          (sum, p) => sum + (p.amountUsd ?? 0),
          0,
        );
        const avgPayment = totalSmallAmount / yearPayments.length;

        signals.push({
          entityId,
          sourceSystemId,
          signalKey: "structured_payments",
          signalLabel: "Potential Structured Payments Detected",
          severity: "medium",
          detail:
            `${yearPayments.length} payments under $100 detected in ${year} ` +
            `(average: $${avgPayment.toFixed(2)}, total: $${totalSmallAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}).`,
          measuredValue: yearPayments.length,
          measuredText: `${yearPayments.length} payments in ${year}`,
          thresholdValue: threshold,
          scoreImpact: 15,
          methodologyVersion: METHODOLOGY_VERSION,
          status: "active",
          observedAt: new Date(),
        });
      }
    }
  } catch (error) {
    console.error(
      `Error detecting structured payments for ${entityId}:`,
      error,
    );
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 4: Rapid Volume Growth
// ---------------------------------------------------------------------------

/**
 * Detect if an entity experienced more than 2x year-over-year
 * growth in total payment volume, which may indicate sudden
 * spikes in activity worth further investigation.
 *
 * Score Impact: 10 points (medium severity)
 */
export async function detectRapidVolumeGrowth(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Fetch all payments grouped by program year
    const payments = await prisma.healthcarePaymentRecord.findMany({
      where: {
        recipientEntityId: entityId,
        programYear: { not: null },
      },
      select: {
        id: true,
        amountUsd: true,
        programYear: true,
      },
    });

    if (payments.length === 0) {
      return signals;
    }

    // Aggregate by year
    const yearlyTotals = new Map<number, number>();
    for (const payment of payments) {
      const year = payment.programYear!;
      const amount = payment.amountUsd ?? 0;
      yearlyTotals.set(year, (yearlyTotals.get(year) ?? 0) + amount);
    }

    // Sort years and compare consecutive years
    const sortedYears = Array.from(yearlyTotals.keys()).sort((a, b) => a - b);
    const threshold = 2.0;

    let maxGrowthRate = 0;
    let growthFromYear = 0;
    let growthToYear = 0;
    let previousTotal = 0;

    for (let i = 1; i < sortedYears.length; i++) {
      const prevYear = sortedYears[i - 1];
      const currYear = sortedYears[i];
      const prevTotal = yearlyTotals.get(prevYear)!;
      const currTotal = yearlyTotals.get(currYear)!;

      // Only compare consecutive calendar years
      if (currYear - prevYear !== 1) {
        previousTotal = currTotal;
        continue;
      }

      if (prevTotal > 0) {
        const growthRate = currTotal / prevTotal;

        if (growthRate > maxGrowthRate) {
          maxGrowthRate = growthRate;
          growthFromYear = prevYear;
          growthToYear = currYear;
        }
      }

      previousTotal = currTotal;
    }

    if (maxGrowthRate > threshold) {
      const fromTotal = yearlyTotals.get(growthFromYear)!;
      const toTotal = yearlyTotals.get(growthToYear)!;

      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "rapid_volume_growth",
        signalLabel: "Rapid Year-Over-Year Payment Growth",
        severity: "medium",
        detail:
          `Payment volume grew ${maxGrowthRate.toFixed(2)}x from ` +
          `$${fromTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} ` +
          `in ${growthFromYear} to ` +
          `$${toTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} ` +
          `in ${growthToYear}.`,
        measuredValue: maxGrowthRate,
        measuredText: `${maxGrowthRate.toFixed(2)}x growth`,
        thresholdValue: threshold,
        scoreImpact: 10,
        methodologyVersion: METHODOLOGY_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(
      `Error detecting rapid volume growth for ${entityId}:`,
      error,
    );
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 5: CMS Safeguard Exclusion
// ---------------------------------------------------------------------------

/**
 * Detect if a healthcare entity appears on the CMS Program Safeguard
 * Exclusion list. Entities on this list are barred from participating
 * in Medicare, Medicaid, and all other federal health care programs.
 *
 * Score Impact: 40 points (high severity)
 */
export async function detectCMSProgramSafeguardExclusion(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Fetch the recipient profile to get name fields
    const profile = await prisma.healthcareRecipientProfile.findUnique({
      where: { entityId },
    });

    if (!profile) {
      return signals;
    }

    const lastName = profile.lastName?.trim();
    const firstName = profile.firstName?.trim();

    if (!lastName && !firstName) {
      return signals;
    }

    // Also fetch the CanonicalEntity displayName as a potential org name
    const canonical = await prisma.canonicalEntity.findUnique({
      where: { id: entityId },
      select: { displayName: true },
    });
    const orgName = canonical?.displayName?.trim();

    // Query CMS safeguard exclusions
    const exclusionMatches = await prisma.cMSProgramSafeguardExclusion.findMany(
      {
        where: {
          AND: [
            {
              OR: [
                ...(lastName
                  ? [{ lastName: { equals: lastName, mode: "insensitive" as const } }]
                  : []),
                ...(firstName && lastName
                  ? [
                      {
                        firstName: { equals: firstName, mode: "insensitive" as const },
                      lastName: { equals: lastName, mode: "insensitive" as const },
                      },
                    ]
                  : []),
                ...(orgName
                  ? [
                      {
                        organizationName: { equals: orgName, mode: "insensitive" as const },
                      },
                    ]
                  : []),
              ],
            },
            // Active exclusion only
            {
              OR: [
                { terminationDate: null },
                { terminationDate: { gt: new Date() } },
              ],
            },
          ],
        },
        select: {
          id: true,
          cmsId: true,
          lastName: true,
          firstName: true,
          organizationName: true,
          exclusionType: true,
          effectiveDate: true,
          state: true,
        },
      },
    );

    if (exclusionMatches.length === 0) {
      return signals;
    }

    for (const exclusion of exclusionMatches) {
      const matchedName =
        exclusion.organizationName ||
        `${exclusion.firstName || ""} ${exclusion.lastName || ""}`.trim() ||
        "Unknown";

      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "cms_safeguard_exclusion",
        signalLabel: "CMS Program Safeguard Exclusion Match",
        severity: "high",
        detail:
          `Entity matches CMS Program Safeguard list entry (CMS ID: ${exclusion.cmsId}). ` +
          `Matched name: "${matchedName}". ` +
          `Exclusion type: ${exclusion.exclusionType}. ` +
          `Effective: ${exclusion.effectiveDate.toISOString().split("T")[0]}`,
        measuredValue: 1,
        measuredText: `Matched CMS safeguard exclusion: ${matchedName}`,
        thresholdValue: 0,
        scoreImpact: 40,
        sourceRecordId: exclusion.id,
        methodologyVersion: METHODOLOGY_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(
      `Error detecting CMS safeguard exclusion for ${entityId}:`,
      error,
    );
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Aggregate Detectors
// ---------------------------------------------------------------------------

/**
 * Run all healthcare fraud signal detectors for a given entity.
 *
 * Executes all 5 healthcare-specific detectors in parallel and
 * returns the combined list of detected signals.
 */
export async function detectAllHealthcareSignals(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const allSignals: DetectedSignal[] = [];

  console.log(
    `[healthcare] Running fraud signal detection for entity ${entityId}...`,
  );

  // Run all detectors in parallel
  const [
    exclusionSignals,
    concentrationSignals,
    structuredSignals,
    growthSignals,
    cmsSafeguardSignals,
  ] = await Promise.all([
    detectExcludedProviderBilling(entityId, sourceSystemId),
    detectPaymentConcentration(entityId, sourceSystemId),
    detectStructuredPayments(entityId, sourceSystemId),
    detectRapidVolumeGrowth(entityId, sourceSystemId),
    detectCMSProgramSafeguardExclusion(entityId, sourceSystemId),
  ]);

  allSignals.push(
    ...exclusionSignals,
    ...concentrationSignals,
    ...structuredSignals,
    ...growthSignals,
    ...cmsSafeguardSignals,
  );

  console.log(
    `[healthcare] Detected ${allSignals.length} fraud signals for entity ${entityId}`,
  );

  return allSignals;
}

/**
 * Batch detect and persist healthcare fraud signals for all
 * entities in the "healthcare" category.
 *
 * @param batchSize - Number of entities to process per iteration
 * @param limit - Optional upper bound on total entities to process
 * @returns Summary of processed entities and signals detected
 */
export async function batchDetectHealthcareSignals(
  batchSize: number = 100,
  limit?: number,
): Promise<{ processed: number; signalsDetected: number }> {
  console.log(
    "[healthcare] Starting batch fraud signal detection for all healthcare entities...",
  );

  let processed = 0;
  let totalSignals = 0;
  let offset = 0;

  // Get total count of healthcare entities
  const totalCount =
    limit ??
    (await prisma.canonicalEntity.count({
      where: { categoryId: "healthcare" },
    }));

  while (offset < totalCount) {
    const entities = await prisma.canonicalEntity.findMany({
      take: batchSize,
      skip: offset,
      where: { categoryId: "healthcare" },
      select: { id: true },
    });

    if (entities.length === 0) break;

    console.log(
      `[healthcare] Processing batch ${Math.floor(offset / batchSize) + 1} ` +
        `(${offset + 1}-${Math.min(offset + batchSize, totalCount)} of ${totalCount})`,
    );

    for (const entity of entities) {
      try {
        const signals = await detectAllHealthcareSignals(entity.id);

        if (signals.length > 0) {
          await persistSignals(signals);
          totalSignals += signals.length;
        }

        processed++;
      } catch (error) {
        console.error(
          `[healthcare] Error processing entity ${entity.id}:`,
          error,
        );
        processed++;
      }
    }

    offset += batchSize;

    // Progress update
    if (processed % 100 === 0) {
      console.log(
        `[healthcare] Progress: ${processed}/${totalCount} entities, ` +
          `${totalSignals} signals detected`,
      );
    }
  }

  console.log("\n=== [healthcare] Batch Detection Complete ===");
  console.log(`Entities Processed: ${processed}`);
  console.log(`Total Signals Detected: ${totalSignals}`);

  return { processed, signalsDetected: totalSignals };
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  const args = process.argv.slice(2);
  const entityId = args.find((a) => !a.startsWith("--")) ?? null;
  const limitStr = args.find((a) => a.startsWith("--limit="));
  const limit = limitStr ? parseInt(limitStr.split("=")[1], 10) : undefined;

  if (entityId) {
    // Single entity mode
    detectAllHealthcareSignals(entityId)
      .then((signals) => {
        console.log("\nDetected signals:");
        for (const signal of signals) {
          console.log(
            `  - [${signal.severity.toUpperCase()}] ${signal.signalKey}: ${signal.detail}`,
          );
          console.log(`    Score Impact: ${signal.scoreImpact} pts`);
        }

        if (signals.length > 0) {
          persistSignals(signals).then(() => {
            console.log("\nSignals persisted to database.");
            process.exit(0);
          });
        } else {
          console.log("\nNo healthcare fraud signals detected.");
          process.exit(0);
        }
      })
      .catch((error) => {
        console.error("Detection failed:", error);
        process.exit(1);
      });
  } else {
    // Batch mode
    batchDetectHealthcareSignals(100, limit)
      .then(() => {
        console.log("\nBatch detection completed successfully.");
        process.exit(0);
      })
      .catch((error) => {
        console.error("Batch detection failed:", error);
        process.exit(1);
      });
  }
}
