import { prisma } from "../lib/db";
import {
  isValidEin,
  loadCharityComputation,
  normalizeEin,
} from "../lib/charity-detail";
import { persistCharityComputation } from "../lib/charity-storage";

async function main() {
  const rawEin = process.argv[2];
  if (!rawEin) {
    throw new Error("Usage: npm run ingest:charity -- <ein>");
  }

  const ein = normalizeEin(rawEin);
  if (!isValidEin(ein)) {
    throw new Error(
      "Employer Identification Number must resolve to a non-zero 9-digit identifier."
    );
  }

  const startedAt = new Date();
  const run = await prisma.ingestionRun.create({
    data: {
      id: `charity_${Date.now()}`,
      sourceSystemId: "propublica_nonprofit_explorer",
      runType: "manual",
      status: "running",
      triggeredBy: "cli",
      startedAt,
    },
  });

  await prisma.sourceSystem.update({
    where: { id: "propublica_nonprofit_explorer" },
    data: {
      lastAttemptedSyncAt: startedAt,
      lastError: null,
    },
  });

  try {
    const record = await loadCharityComputation(ein);
    const persisted = await persistCharityComputation(record, {
      ingestionRunId: run.id,
    });

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        rowsRead: 1,
        rowsInserted: persisted.createdEntity ? 1 : 0,
        rowsUpdated: persisted.createdEntity ? persisted.filingCount : persisted.filingCount + 1,
        completedAt: new Date(),
      },
    });

    await prisma.sourceSystem.update({
      where: { id: "propublica_nonprofit_explorer" },
      data: {
        lastSuccessfulSyncAt: new Date(),
        lastError: null,
      },
    });

    console.log(
      JSON.stringify(
        {
          ein,
          entityId: persisted.entityId,
          createdEntity: persisted.createdEntity,
          filingCount: persisted.filingCount,
          signalCount: persisted.signalCount,
          fraudScore: record.detail.fraudMeter?.score ?? 0,
          latestFilingYear: record.detail.latest?.filingYear ?? null,
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        errorSummary: message,
        completedAt: new Date(),
      },
    });
    await prisma.sourceSystem.update({
      where: { id: "propublica_nonprofit_explorer" },
      data: {
        lastError: message,
      },
    });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
