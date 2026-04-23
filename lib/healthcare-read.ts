import { prisma } from "@/lib/db";
import type { CMSPayment } from "@/lib/cms";
import {
  buildHealthcareSignals,
  computeHealthcareMetrics,
} from "@/lib/healthcare-analysis";
import { compositeScore } from "@/lib/fraud-signals";
import { assessHealthcareMirror } from "@/lib/mirror-readiness";
import { getSourceSystemFreshness, resolveMirrorFreshness } from "@/lib/mirror-metadata";
import { normalizeEntityName, withMirrorMetadata } from "@/lib/warehouse";

const CMS_SOURCE_SYSTEM_ID = "cms_open_payments";

type HealthcarePaymentRow = {
  recordId: string;
  physicianFirstName: string | null;
  physicianLastName: string | null;
  recipientCity: string | null;
  recipientState: string | null;
  physicianSpecialty: string | null;
  manufacturerName: string | null;
  amountUsd: number | null;
  natureOfPayment: string | null;
  dateOfPayment: Date | null;
  programYear: number | null;
  recipientEntity?: {
    healthcareRecipientProfile?: { physicianProfileId: string | null } | null;
  } | null;
};

function toPayment(row: HealthcarePaymentRow): CMSPayment {
  return {
    record_id: row.recordId,
    physician_first_name: row.physicianFirstName ?? undefined,
    physician_last_name: row.physicianLastName ?? undefined,
    physician_profile_id:
      row.recipientEntity?.healthcareRecipientProfile?.physicianProfileId ??
      undefined,
    recipient_city: row.recipientCity ?? undefined,
    recipient_state: row.recipientState ?? undefined,
    physician_specialty: row.physicianSpecialty ?? undefined,
    applicable_manufacturer_or_applicable_gpo_making_payment_name:
      row.manufacturerName ?? undefined,
    total_amount_of_payment_usdollars:
      row.amountUsd != null ? String(row.amountUsd) : undefined,
    nature_of_payment_or_transfer_of_value: row.natureOfPayment ?? undefined,
    date_of_payment: row.dateOfPayment?.toISOString().slice(0, 10) ?? undefined,
    program_year: row.programYear != null ? String(row.programYear) : undefined,
  };
}

async function currentHealthcareCoverage(): Promise<string> {
  return (await getLocalHealthcareMirrorStatus()).coverage;
}

export async function getLocalHealthcareMirrorStatus() {
  const [payments, recipients] = await Promise.all([
    prisma.healthcarePaymentRecord.count(),
    prisma.healthcareRecipientProfile.count(),
  ]);
  return assessHealthcareMirror({ payments, recipients });
}

export async function hasLocalHealthcareMirror(): Promise<boolean> {
  return (await getLocalHealthcareMirrorStatus()).ready;
}

export async function searchStoredHealthcarePayments(params: {
  q: string;
  type: "doctor" | "company";
}) {
  let rows: Awaited<ReturnType<typeof prisma.healthcarePaymentRecord.findMany>> = [];

  if (params.type === "company") {
    const normalizedQuery = normalizeEntityName(params.q);
    const companies = await prisma.canonicalEntity.findMany({
      where: {
        categoryId: "healthcare",
        entityType: "payer",
        OR: [
          { normalizedName: { contains: normalizedQuery } },
          {
            EntityIdentifier: {
              some: {
                identifierType: "cms_payer_name",
                identifierValue: { contains: normalizedQuery },
              },
            },
          },
        ],
      },
      select: { id: true },
      take: 25,
    });
    rows = await prisma.healthcarePaymentRecord.findMany({
      where: { companyEntityId: { in: companies.map((company) => company.id) } },
      orderBy: [{ amountUsd: "desc" }, { dateOfPayment: "desc" }],
      take: 500,
      include: {
        CanonicalEntity_HealthcarePaymentRecord_recipientEntityIdToCanonicalEntity: {
          include: {
            HealthcareRecipientProfile: true,
          },
        },
      },
    });
  } else {
    const parts = params.q.trim().split(/\s+/);
    const lastName = parts.length >= 2 ? parts[parts.length - 1] : parts[0];
    const firstName = parts.length >= 2 ? parts[0] : null;
    const matchingRecipients = await prisma.healthcareRecipientProfile.findMany({
      where: {
        lastName: { contains: lastName, mode: "insensitive" },
        ...(firstName
          ? { firstName: { contains: firstName, mode: "insensitive" } }
          : {}),
      },
      select: { entityId: true },
      take: 25,
    });
    rows = await prisma.healthcarePaymentRecord.findMany({
      where: {
        recipientEntityId: { in: matchingRecipients.map((row) => row.entityId) },
      },
      orderBy: [{ dateOfPayment: "desc" }, { amountUsd: "desc" }],
      take: 500,
      include: {
        CanonicalEntity_HealthcarePaymentRecord_recipientEntityIdToCanonicalEntity: {
          include: {
            HealthcareRecipientProfile: true,
          },
        },
      },
    });
  }

  const results = rows.map(toPayment);
  const metrics = computeHealthcareMetrics(results);
  const riskSignals = buildHealthcareSignals(results);
  const riskScore = compositeScore(riskSignals);

  return withMirrorMetadata(
    { type: params.type, results, metrics, riskSignals, riskScore },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: CMS_SOURCE_SYSTEM_ID,
        observedDates: rows.flatMap((row) => [
          row.sourceRecordUpdatedAt,
          row.dateOfPayment,
        ]),
      }),
      mirrorCoverage: await currentHealthcareCoverage(),
    }
  );
}
