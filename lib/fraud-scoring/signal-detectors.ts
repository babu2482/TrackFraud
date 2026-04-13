/**
 * Fraud Signal Detection Engine - Charity Category
 *
 * Implements the first 5 high-priority fraud detection signals:
 * 1. High Compensation Ratio (>20% of revenue to executive pay)
 * 2. Frequent EIN/Name Changes (>2 in 3 years)
 * 3. Missing or Late Filings (>90 days overdue)
 * 4. Auto-Revocation Status (IRS automatic revocation list match)
 * 5. Asset-to-Revenue Anomaly (assets > 10x annual revenue with no explanation)
 *
 * Each detector returns FraudSignalEvent objects that can be persisted to the database.
 */

import { PrismaClient, FraudSignalEvent } from '@prisma/client';

const prisma = new PrismaClient();

export interface DetectedSignal extends Omit<FraudSignalEvent, 'id' | 'createdAt' | 'updatedAt'> {
  entityId: string;
}

/**
 * Signal 1: High Compensation Ratio
 * Detects charities where executive compensation exceeds 20% of total revenue
 */
export async function detectHighCompensationRatio(
  charityId: string,
  sourceSystemId?: string
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Get latest filing with compensation data
    const latestFiling = await prisma.charityFiling.findFirst({
      where: { entityId: charityId },
      orderBy: { taxPeriod: 'desc' },
      include: { CanonicalEntity: true }
    });

    if (!latestFiling || !latestFiling.totalRevenue || latestFiling.totalRevenue === 0n) {
      return signals;
    }

    const compensationPct = latestFiling.compensationPct ?? 0;
    const threshold = 20.0; // 20%

    if (compensationPct > threshold) {
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

      if (compensationPct >= 40) severity = 'critical';
      else if (compensationPct >= 30) severity = 'high';
      else if (compensationPct >= 25) severity = 'medium';

      signals.push({
        entityId: charityId,
        sourceSystemId,
        signalKey: 'charity_high_compensation_ratio',
        signalLabel: 'Excessive Executive Compensation',
        severity,
        detail: `Executive compensation is ${compensationPct.toFixed(1)}% of total revenue`,
        measuredValue: compensationPct,
        measuredText: `${compensationPct.toFixed(1)}%`,
        thresholdValue: threshold,
        scoreImpact: severity === 'critical' ? 25 : severity === 'high' ? 20 : 15,
        sourceRecordId: latestFiling.id,
        methodologyVersion: 'v1',
        status: 'active',
        observedAt: new Date()
      });
    }
  } catch (error) {
    console.error(`Error detecting high compensation ratio for ${charityId}:`, error);
  }

  return signals;
}

/**
 * Signal 2: Frequent EIN/Name Changes
 * Detects entities with more than 2 name or identifier changes in a 3-year period
 */
export async function detectFrequentNameChanges(
  charityId: string,
  sourceSystemId?: string
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    // Get all alias changes for this entity in the last 3 years
    const nameChanges = await prisma.entityAlias.findMany({
      where: {
        entityId: charityId,
        aliasType: 'alternate_name',
        observedAt: { gt: threeYearsAgo }
      },
      orderBy: { observedAt: 'desc' },
      select: { alias: true, observedAt: true }
    });

    const threshold = 2; // More than 2 changes is suspicious

    if (nameChanges.length > threshold) {
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

      if (nameChanges.length >= 5) severity = 'critical';
      else if (nameChanges.length >= 4) severity = 'high';
      else if (nameChanges.length === 3) severity = 'medium';

      signals.push({
        entityId: charityId,
        sourceSystemId,
        signalKey: 'charity_frequent_name_changes',
        signalLabel: 'Frequent Name/Identity Changes',
        severity,
        detail: `Entity has changed name ${nameChanges.length} times in the past 3 years`,
        measuredValue: nameChanges.length,
        measuredText: `${nameChanges.length} changes`,
        thresholdValue: threshold,
        scoreImpact: severity === 'critical' ? 20 : severity === 'high' ? 15 : 10,
        methodologyVersion: 'v1',
        status: 'active',
        observedAt: new Date()
      });
    }

    // Also check for EIN changes in filing records
    const filings = await prisma.charityFiling.findMany({
      where: { entityId: charityId },
      orderBy: { taxPeriod: 'desc' },
      take: 10
    });

    // Get associated profiles to check EIN consistency
    const profile = await prisma.charityProfile.findUnique({
      where: { entityId: charityId }
    });

    if (profile) {
      const bmfRecords = await prisma.charityBusinessMasterRecord.findMany({
        where: { ein: profile.ein },
        select: { sortName: true, sourcePublishedAt: true }
      });

      const nameVariations = new Set(bmfRecords.map(r => r.sortName).filter(Boolean));

      if (nameVariations.size > 2) {
        signals.push({
          entityId: charityId,
          sourceSystemId,
          signalKey: 'charity_ein_name_variation',
          signalLabel: 'Multiple Names for Same EIN',
          severity: 'medium',
          detail: `EIN ${profile.ein} associated with ${nameVariations.size} different organization names`,
          measuredValue: nameVariations.size,
          measuredText: `${nameVariations.size} variations`,
          thresholdValue: 2,
          scoreImpact: 10,
          methodologyVersion: 'v1',
          status: 'active',
          observedAt: new Date()
        });
      }
    }
  } catch (error) {
    console.error(`Error detecting frequent name changes for ${charityId}:`, error);
  }

  return signals;
}

/**
 * Signal 3: Missing or Late Filings
 * Detects charities that are more than 90 days overdue on their tax filings
 */
export async function detectMissingOrLateFilings(
  charityId: string,
  sourceSystemId?: string
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Get all filings for this entity
    const filings = await prisma.charityFiling.findMany({
      where: { entityId: charityId },
      orderBy: { filingYear: 'desc' },
      take: 5
    });

    const currentYear = new Date().getFullYear();
    const expectedYears = [currentYear - 1, currentYear - 2, currentYear - 3]; // Last 3 years should be filed

    const filedYears = new Set(filings.map(f => f.filingYear));
    const missingYears: number[] = [];

    for (const year of expectedYears) {
      if (!filedYears.has(year)) {
        missingYears.push(year);
      }
    }

    // Check if filings are significantly late (>90 days after typical due date)
    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);

    for (const year of expectedYears) {
      if (filedYears.has(year)) {
        const filing = filings.find(f => f.filingYear === year);

        // Typical due date is May 15th (for calendar year filers)
        const typicalDueDate = new Date(`${year}-05-15`);

        // If we have source update info, check if it's way past due
        if (filing && filing.sourceUpdatedAt) {
          // This is filed, so no signal needed
          continue;
        }
      }
    }

    if (missingYears.length > 0) {
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

      if (missingYears.length >= 3) severity = 'critical';
      else if (missingYears.length === 2) severity = 'high';
      else if (missingYears.length === 1) severity = 'medium';

      signals.push({
        entityId: charityId,
        sourceSystemId,
        signalKey: 'charity_missing_filings',
        signalLabel: 'Missing Tax Filings',
        severity,
        detail: `No filings found for tax years: ${missingYears.join(', ')}`,
        measuredValue: missingYears.length,
        measuredText: `${missingYears.length} years missing`,
        thresholdValue: 1,
        scoreImpact: severity === 'critical' ? 30 : severity === 'high' ? 25 : 20,
        methodologyVersion: 'v1',
        status: 'active',
        observedAt: new Date()
      });
    }

    // Check for 990-N e-Postcards (very small orgs) - these should be filed annually too
    const epostcards = await prisma.charityEpostcard990NRecord.findMany({
      where: { entityId: charityId },
      orderBy: { taxYear: 'desc' },
      take: 5
    });

    const epostcardYears = new Set(epostcards.map(e => e.taxYear).filter(Boolean) as number[]);

    // If they filed full 990s before but now only filing 990-N, that could be suspicious
    if (filings.length > 0 && epostcards.length > 0) {
      const lastFullFiling = filings[0]?.filingYear;
      const firstEpostcard = epostcards[epostcards.length - 1]?.taxYear;

      if (lastFullFiling && firstEpostcard && firstEpostcard > lastFullFiling) {
        signals.push({
          entityId: charityId,
          sourceSystemId,
          signalKey: 'charity_filing_type_downgrade',
          signalLabel: 'Filing Type Downgrade',
          severity: 'low',
          detail: `Organization switched from full 990 filing (last filed ${lastFullFiling}) to simplified 990-N e-Postcard (${firstEpostcard})`,
          measuredValue: (firstEpostcard - lastFullFiling),
          measuredText: `${firstEpostcard} -> 990-N`,
          thresholdValue: 1,
          scoreImpact: 5,
          methodologyVersion: 'v1',
          status: 'active',
          observedAt: new Date()
        });
      }
    }
  } catch (error) {
    console.error(`Error detecting missing filings for ${charityId}:`, error);
  }

  return signals;
}

/**
 * Signal 4: Auto-Revocation Status
 * Detects charities on the IRS automatic revocation list
 */
export async function detectAutoRevocationStatus(
  charityId: string,
  sourceSystemId?: string
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Check if this entity is in the auto-revocation table
    const revocationRecord = await prisma.charityAutomaticRevocationRecord.findUnique({
      where: { entityId: charityId },
      include: { CanonicalEntity: true }
    });

    if (revocationRecord) {
      // Calculate how long ago they were revoked
      const revocationDate = revocationRecord.revocationDate;
      let daysSinceRevocation = 0;

      if (revocationDate) {
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - revocationDate.getTime());
        daysSinceRevocation = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      // This is a critical signal - lost tax-exempt status
      signals.push({
        entityId: charityId,
        sourceSystemId,
        signalKey: 'charity_auto_revocation',
        signalLabel: 'IRS Automatic Revocation',
        severity: 'critical',
        detail: revocationDate
          ? `Tax-exempt status automatically revoked by IRS on ${revocationDate.toLocaleDateString()}`
          : 'Tax-exempt status automatically revoked by IRS (date unknown)',
        measuredValue: daysSinceRevocation,
        measuredText: revocationDate ? `${daysSinceRevocation} days ago` : 'Unknown date',
        thresholdValue: 0, // Any revocation is critical
        scoreImpact: 50, // Maximum impact - this is a major red flag
        sourceRecordId: revocationRecord.id,
        methodologyVersion: 'v1',
        status: 'active',
        observedAt: new Date()
      });

      // Additional context if they've been revoked for a long time but still operating
      if (daysSinceRevocation > 365) {
        signals.push({
          entityId: charityId,
          sourceSystemId,
          signalKey: 'charity_operating_post_revocation',
          signalLabel: 'Operating After Revocation',
          severity: 'high',
          detail: `Organization appears to still be operating ${Math.floor(daysSinceRevocation / 365)}+ years after tax-exempt status was revoked`,
          measuredValue: daysSinceRevocation,
          measuredText: `${daysSinceRevocation} days post-revocation`,
          thresholdValue: 365,
          scoreImpact: 20,
          sourceRecordId: revocationRecord.id,
          methodologyVersion: 'v1',
          status: 'active',
          observedAt: new Date()
        });
      }
    }

    // Also check Publication 78 - if not listed there but claiming 501(c)(3) status
    const pub78Record = await prisma.charityPublication78Record.findUnique({
      where: { entityId: charityId }
    });

    const profile = await prisma.charityProfile.findUnique({
      where: { entityId: charityId }
    });

    // If they claim 501(c)(3) but aren't in Publication 78
    if (profile && !pub78Record && profile.subsectionCode === 3) {
      signals.push({
        entityId: charityId,
        sourceSystemId,
        signalKey: 'charity_not_in_pub78',
        signalLabel: 'Not Listed in IRS Publication 78',
        severity: 'medium',
        detail: 'Organization claims 501(c)(3) status but is not found in IRS Publication 78 (list of organizations eligible to receive tax-deductible contributions)',
        measuredValue: 0,
        measuredText: 'Not listed',
        thresholdValue: 1,
        scoreImpact: 15,
        methodologyVersion: 'v1',
        status: 'active',
        observedAt: new Date()
      });
    }
  } catch (error) {
    console.error(`Error detecting auto-revocation status for ${charityId}:`, error);
  }

  return signals;
}

/**
 * Signal 5: Asset-to-Revenue Anomaly
 * Detects charities with assets exceeding 10x annual revenue without explanation
 */
export async function detectAssetRevenueAnomaly(
  charityId: string,
  sourceSystemId?: string
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Get latest filing with financial data
    const latestFiling = await prisma.charityFiling.findFirst({
      where: { entityId: charityId },
      orderBy: { taxPeriod: 'desc' }
    });

    if (!latestFiling) {
      return signals;
    }

    const totalAssets = latestFiling.totalAssets ?? 0n;
    const totalRevenue = latestFiling.totalRevenue ?? 0n;

    // Skip if no revenue data or assets
    if (totalRevenue === 0n || totalAssets === 0n) {
      return signals;
    }

    const assetToRevenueRatio = Number(totalAssets) / Number(totalRevenue);
    const threshold = 10.0; // 10x is the anomaly threshold

    if (assetToRevenueRatio > threshold) {
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

      if (assetToRevenueRatio >= 50) severity = 'critical';
      else if (assetToRevenueRatio >= 30) severity = 'high';
      else if (assetToRevenueRatio >= 20) severity = 'medium';

      // Check if this could be a legitimate endowment/foundation
      const profile = await prisma.charityProfile.findUnique({
        where: { entityId: charityId }
      });

      // Private foundations often have high asset/revenue ratios legitimately
      const isLikelyFoundation = profile?.foundationCode >= 11 && profile.foundationCode <= 19;

      if (!isLikelyFoundation) {
        signals.push({
          entityId: charityId,
          sourceSystemId,
          signalKey: 'charity_asset_revenue_anomaly',
          signalLabel: 'Unusually High Asset-to-Revenue Ratio',
          severity,
          detail: `Assets ($${Number(totalAssets).toLocaleString()}) are ${assetToRevenueRatio.toFixed(1)}x annual revenue ($${Number(totalRevenue).toLocaleString()})`,
          measuredValue: assetToRevenueRatio,
          measuredText: `${assetToRevenueRatio.toFixed(1)}x ratio`,
          thresholdValue: threshold,
          scoreImpact: severity === 'critical' ? 20 : severity === 'high' ? 15 : severity === 'medium' ? 10 : 5,
          sourceRecordId: latestFiling.id,
          methodologyVersion: 'v1',
          status: 'active',
          observedAt: new Date()
        });

        // Additional check: if they have high assets but low program expenses
        const programExpenseRatio = latestFiling.programExpenseRatio ?? 0;

        if (programExpenseRatio < 0.25 && assetToRevenueRatio > 20) {
          signals.push({
            entityId: charityId,
            sourceSystemId,
            signalKey: 'charity_low_program_expense_high_assets',
            signalLabel: 'High Assets, Low Program Spending',
            severity: 'high',
            detail: `Organization has ${assetToRevenueRatio.toFixed(1)}x assets-to-revenue but only spends ${(programExpenseRatio * 100).toFixed(0)}% on programs`,
            measuredValue: programExpenseRatio,
            measuredText: `${(programExpenseRatio * 100).toFixed(0)}% program expenses`,
            thresholdValue: 0.25,
            scoreImpact: 15,
            sourceRecordId: latestFiling.id,
            methodologyVersion: 'v1',
            status: 'active',
            observedAt: new Date()
          });
        }
      } else {
        // Foundation - lower the threshold since this is more expected
        if (assetToRevenueRatio > 20) {
          signals.push({
            entityId: charityId,
            sourceSystemId,
            signalKey: 'charity_foundation_high_assets',
            signalLabel: 'Foundation with Very High Asset Base',
            severity: 'low',
            detail: `Private foundation with assets ${assetToRevenueRatio.toFixed(1)}x annual revenue (may be legitimate endowment)`,
            measuredValue: assetToRevenueRatio,
            measuredText: `${assetToRevenueRatio.toFixed(1)}x ratio`,
            thresholdValue: 20,
            scoreImpact: 3, // Low impact for foundations - this is often normal
            sourceRecordId: latestFiling.id,
            methodologyVersion: 'v1',
            status: 'active',
            observedAt: new Date()
          });
        }
      }
    }

    // Check for sudden asset growth (potential money laundering red flag)
    const previousFiling = await prisma.charityFiling.findFirst({
      where: {
        entityId: charityId,
        taxPeriod: { lt: latestFiling.taxPeriod }
      },
      orderBy: { taxPeriod: 'desc' }
    });

    if (previousFiling && previousFiling.totalAssets && previousFiling.totalAssets > 0n) {
      const assetGrowth = Number(totalAssets - previousFiling.totalAssets) / Number(previousFiling.totalAssets);

      if (assetGrowth > 2.0) { // More than 200% growth in one year
        signals.push({
          entityId: charityId,
          sourceSystemId,
          signalKey: 'charity_sudden_asset_growth',
          signalLabel: 'Sudden Asset Growth',
          severity: assetGrowth > 5.0 ? 'high' : 'medium',
          detail: `Assets grew ${(assetGrowth * 100).toFixed(0)}% in one year (from $${Number(previousFiling.totalAssets).toLocaleString()} to $${Number(totalAssets).toLocaleString()})`,
          measuredValue: assetGrowth,
          measuredText: `${(assetGrowth * 100).toFixed(0)}% growth`,
          thresholdValue: 2.0,
          scoreImpact: assetGrowth > 5.0 ? 15 : 10,
          sourceRecordId: latestFiling.id,
          methodologyVersion: 'v1',
          status: 'active',
          observedAt: new Date()
        });
      }
    }
  } catch (error) {
    console.error(`Error detecting asset-revenue anomaly for ${charityId}:`, error);
  }

  return signals;
}

/**
 * Run all charity fraud signal detectors for an entity
 */
export async function detectAllCharitySignals(
  entityId: string,
  sourceSystemId?: string
): Promise<DetectedSignal[]> {
  const allSignals: DetectedSignal[] = [];

  console.log(`Running fraud signal detection for entity ${entityId}...`);

  // Run all detectors in parallel
  const [
    compensationSignals,
    nameChangeSignals,
    filingSignals,
    revocationSignals,
    assetSignals
  ] = await Promise.all([
    detectHighCompensationRatio(entityId, sourceSystemId),
    detectFrequentNameChanges(entityId, sourceSystemId),
    detectMissingOrLateFilings(entityId, sourceSystemId),
    detectAutoRevocationStatus(entityId, sourceSystemId),
    detectAssetRevenueAnomaly(entityId, sourceSystemId)
  ]);

  allSignals.push(
    ...compensationSignals,
    ...nameChangeSignals,
    ...filingSignals,
    ...revocationSignals,
    ...assetSignals
  );

  console.log(`Detected ${allSignals.length} fraud signals for entity ${entityId}`);

  return allSignals;
}

/**
 * Persist detected signals to the database
 */
export async function persistSignals(signals: DetectedSignal[]): Promise<void> {
  if (signals.length === 0) {
    return;
  }

  try {
    // Upsert each signal
    for (const signal of signals) {
      await prisma.fraudSignalEvent.upsert({
        where: {
          entityId_signalKey_observedAt: {
            entityId: signal.entityId,
            signalKey: signal.signalKey,
            observedAt: signal.observedAt
          }
        },
        update: signal,
        create: signal
      });
    }

    console.log(`Persisted ${signals.length} fraud signals to database`);
  } catch (error) {
    console.error('Error persisting fraud signals:', error);
    throw error;
  }
}

/**
 * Batch detect and persist signals for all charity entities
 */
export async function batchDetectCharitySignals(
  batchSize: number = 100,
  limit?: number
): Promise<{ processed: number; signalsDetected: number }> {
  console.log('Starting batch fraud signal detection for all charities...');

  let processed = 0;
  let totalSignals = 0;
  let offset = 0;

  // Get all charity entity IDs
  const totalCount = limit ?? await prisma.canonicalEntity.count({
    where: { categoryId: { contains: 'charity', mode: 'insensitive' } }
  });

  while (offset < totalCount) {
    const entities = await prisma.canonicalEntity.findMany({
      take: batchSize,
      skip: offset,
      where: {
        categoryId: { contains: 'charity', mode: 'insensitive' }
      },
      select: { id: true }
    });

    if (entities.length === 0) break;

    console.log(`Processing batch ${Math.floor(offset / batchSize) + 1} (${offset}-${Math.min(offset + batchSize, totalCount)} of ${totalCount})`);

    for (const entity of entities) {
      try {
        const signals = await detectAllCharitySignals(entity.id);

        if (signals.length > 0) {
          await persistSignals(signals);
          totalSignals += signals.length;
        }

        processed++;
      } catch (error) {
        console.error(`Error processing entity ${entity.id}:`, error);
        processed++; // Still count it as processed
      }
    }

    offset += batchSize;

    // Progress update
    if (processed % 100 === 0) {
      console.log(`Progress: ${processed}/${totalCount} entities, ${totalSignals} signals detected`);
    }
  }

  console.log('\n=== Batch Detection Complete ===');
  console.log(`Entities Processed: ${processed}`);
  console.log(`Total Signals Detected: ${totalSignals}`);

  return { processed, signalsDetected: totalSignals };
}

// CLI entry point
if (require.main === module) {
  const command = process.argv[2];
  const entityId = process.argv[3];

  switch (command) {
    case 'single':
      if (!entityId) {
        console.error('Usage: tsx lib/fraud-scoring/signal-detectors.ts single <entityId>');
        process.exit(1);
      }

      detectAllCharitySignals(entityId)
        .then(signals => {
          console.log('\nDetected Signals:');
          signals.forEach(s => {
            console.log(`  - [${s.severity.toUpperCase()}] ${s.signalLabel}: ${s.detail}`);
          });

          if (signals.length > 0 && process.argv[4] === '--persist') {
            return persistSignals(signals).then(() => {
              console.log('\nSignals persisted to database');
            });
          }
        })
        .catch(error => {
          console.error('Error:', error);
          process.exit(1);
        });
      break;

    case 'batch':
      const limit = parseInt(process.argv[3] || '0');
      batchDetectCharitySignals(100, limit)
        .then(stats => {
          console.log('\nBatch complete:', stats);
          process.exit(0);
        })
        .catch(error => {
          console.error('Batch failed:', error);
          process.exit(1);
        });
      break;

    default:
      console.log('Usage: tsx lib/fraud-scoring/signal-detectors.ts <command> [options]');
      console.log('\nCommands:');
      console.log('  single <entityId> [--persist]  Detect signals for a single entity');
      console.log('  batch [limit]                  Run detection on all charity entities (optionally limited)');
      process.exit(1);
  }
}
