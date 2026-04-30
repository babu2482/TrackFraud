/**
 * Entity Lookup API
 *
 * Resolves a UUID entity ID + type to its detail information,
 * including the lookup key (EIN for charities, CIK for corporations)
 * needed to navigate to the detail page.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface Params {
  id: string;
}

/**
 * GET /api/entity/[id]?type=charity
 *
 * Returns entity detail lookup info including the identifier
 * needed for the detail page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const entityType = searchParams.get("type");

    if (!entityType) {
      return NextResponse.json(
        {
          error:
            "Entity type is required. Use ?type=charity or ?type=corporation",
        },
        { status: 400 },
      );
    }

    let result: {
      entityId: string;
      entityType: string;
      name: string;
      lookupKey: string;
      detailUrl: string;
      state?: string;
      city?: string;
    } | null = null;

    switch (entityType) {
      case "charity": {
        // Look up charity by canonical entity UUID
        const charity = await prisma.charityProfile.findFirst({
          where: { CanonicalEntity: { id } },
          include: {
            CanonicalEntity: true,
          },
        });

        if (charity && charity.ein) {
          result = {
            entityId: id,
            entityType: "charity",
            name: charity.CanonicalEntity?.displayName || charity.ein,
            lookupKey: charity.ein,
            detailUrl: `/charities/${charity.ein}`,
            state:
              charity.state || charity.CanonicalEntity?.stateCode || undefined,
            city: charity.city || undefined,
          };
        }
        break;
      }

      case "corporation": {
        // Look up corporation by canonical entity UUID
        const corp = await prisma.corporateCompanyProfile.findFirst({
          where: { CanonicalEntity: { id } },
          include: {
            CanonicalEntity: true,
          },
        });

        if (corp && corp.cik) {
          result = {
            entityId: id,
            entityType: "corporation",
            name: corp.CanonicalEntity?.displayName || corp.cik,
            lookupKey: corp.cik,
            detailUrl: `/corporate/company/${corp.cik}`,
            state:
              corp.stateOfIncorporation ||
              corp.CanonicalEntity?.stateCode ||
              undefined,
          };
        }
        break;
      }

      default: {
        // For other entity types, return basic info
        const entity = await prisma.canonicalEntity.findUnique({
          where: { id },
        });

        if (entity) {
          result = {
            entityId: id,
            entityType,
            name: entity.displayName || id,
            lookupKey: id,
            detailUrl: `/search?q=${encodeURIComponent(entity.displayName || id)}&type=${entityType}`,
            state: entity.stateCode || undefined,
          };
        }
        break;
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: `Entity not found: ${id} (${entityType})` },
        { status: 404 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Entity lookup error:", error);
    return NextResponse.json(
      { error: "Failed to look up entity" },
      { status: 500 },
    );
  }
}
