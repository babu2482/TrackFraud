/**
 * Unit tests for lib/fraud-scoring/healthcare-detectors.ts
 *
 * Tests each healthcare fraud signal detector in isolation with a mocked PrismaClient.
 * Covers threshold logic, severity escalation, edge cases, and error handling.
 *
 * Mocking strategy:
 * - Override the @prisma/client module at the module level so the PrismaClient
 *   constructor yields our controlled mock instance.
 * - Use vi.resetModules() in beforeEach to get a fresh module (and therefore a
 *   fresh PrismaClient instance) for every test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mock factory
// ---------------------------------------------------------------------------

function mockFn<T = any>(impl?: (...args: any[]) => T): any {
  return vi.fn(impl);
}

function createPrismaMock() {
  const self: any = {
    healthcareRecipientProfile: {
      findUnique: mockFn().mockResolvedValue(null),
    },
    canonicalEntity: {
      findUnique: mockFn().mockResolvedValue(null),
    },
    hHSExclusion: {
      findMany: mockFn().mockResolvedValue([]),
    },
    cMSProgramSafeguardExclusion: {
      findMany: mockFn().mockResolvedValue([]),
    },
    healthcarePaymentRecord: {
      findMany: mockFn().mockResolvedValue([]),
      count: mockFn().mockResolvedValue(0),
    },
    fraudSignalEvent: {
      upsert: mockFn().mockResolvedValue({ id: "mock-id" }),
      create: mockFn().mockResolvedValue({ id: "mock-id" }),
    },
    entity: {
      count: mockFn().mockResolvedValue(0),
      findMany: mockFn().mockResolvedValue([]),
    },
    $queryRawUnsafe: mockFn().mockResolvedValue([]),
    $queryRaw: mockFn().mockResolvedValue([]),
    $executeRaw: mockFn().mockResolvedValue(0),
  };
  return self;
}

// ---------------------------------------------------------------------------
// Module-level mock: intercept @prisma/client constructor
// ---------------------------------------------------------------------------

vi.mock("@prisma/client", async () => {
  const actual =
    await vi.importActual<typeof import("@prisma/client")>("@prisma/client");

  class MockPrismaClient {
    constructor() {
      Object.setPrototypeOf(this, (_globalPrismaMock ?? createPrismaMock()) as any);
    }
  }

  return {
    ...actual,
    PrismaClient: MockPrismaClient as any,
  };
});

let _globalPrismaMock: ReturnType<typeof createPrismaMock> | null = null;

// ---------------------------------------------------------------------------
// Helper: import the module fresh after resetting + configuring mock
// ---------------------------------------------------------------------------

async function importHealthcareDetectors(
  prismaMock?: ReturnType<typeof createPrismaMock>,
) {
  vi.resetModules();

  if (prismaMock) {
    _globalPrismaMock = prismaMock;
  }

  const mod = await import("../../lib/fraud-scoring/healthcare-detectors");
  return {
    ...mod,
    prisma: _globalPrismaMock ?? createPrismaMock(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Healthcare Fraud Signal Detectors", () => {
  beforeEach(() => {
    _globalPrismaMock = null;
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Signal 1: detectExcludedProviderBilling
  // -----------------------------------------------------------------------

  describe("detectExcludedProviderBilling", () => {
    it("returns [] when no healthcare profile exists", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue(null);
      const { detectExcludedProviderBilling } = await importHealthcareDetectors(p);

      const signals = await detectExcludedProviderBilling("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns [] when profile has no name fields", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-1",
        lastName: null,
        firstName: null,
      });
      const { detectExcludedProviderBilling } = await importHealthcareDetectors(p);

      const signals = await detectExcludedProviderBilling("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns [] when no HHS exclusion matches found", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-1",
        lastName: "SMITH",
        firstName: "JOHN",
      });
      p.hHSExclusion.findMany.mockResolvedValue([]);
      const { detectExcludedProviderBilling } = await importHealthcareDetectors(p);

      const signals = await detectExcludedProviderBilling("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns [] when exclusion match exists but no payment records", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-1",
        lastName: "SMITH",
        firstName: "JOHN",
      });
      p.hHSExclusion.findMany.mockResolvedValue([
        {
          id: "excl-1",
          uiEProviderId: "ABC123",
          lastName: "SMITH",
          firstName: "JOHN",
          exclusionReasons: ["UPPI"],
          effectiveDate: new Date("2020-01-01"),
        },
      ]);
      p.healthcarePaymentRecord.count.mockResolvedValue(0);
      const { detectExcludedProviderBilling } = await importHealthcareDetectors(p);

      const signals = await detectExcludedProviderBilling("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns critical-severity signal when entity is on HHS exclusion list with payments", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-1",
        lastName: "SMITH",
        firstName: "JOHN",
      });
      p.canonicalEntity.findUnique.mockResolvedValue({
        displayName: "Smith Medical LLC",
      });
      p.hHSExclusion.findMany.mockResolvedValue([
        {
          id: "excl-1",
          uiEProviderId: "ABC123",
          lastName: "SMITH",
          firstName: "JOHN",
          organizationName: null,
          exclusionReasons: ["UPPI", "FKS"],
          effectiveDate: new Date("2020-06-15"),
        },
      ]);
      p.healthcarePaymentRecord.count.mockResolvedValue(12);
      const { detectExcludedProviderBilling } = await importHealthcareDetectors(p);

      const signals = await detectExcludedProviderBilling("entity-1");
      expect(signals).toHaveLength(1);
      const s = signals[0];
      expect(s.signalKey).toBe("excluded_provider_billing");
      expect(s.signalLabel).toBe("Excluded Provider with Active Payments");
      expect(s.severity).toBe("critical");
      expect(s.scoreImpact).toBe(50);
      expect(s.measuredValue).toBe(12);
      expect(s.sourceRecordId).toBe("excl-1");
      expect(s.detail).toContain("ABC123");
      expect(s.detail).toContain("2020-06-15");
    });

    it("matches by organization name when available", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-2",
        lastName: "ACME",
        firstName: null,
      });
      p.canonicalEntity.findUnique.mockResolvedValue({
        displayName: "ACME Health Systems",
      });
      p.hHSExclusion.findMany.mockResolvedValue([
        {
          id: "excl-2",
          uiEProviderId: "XYZ789",
          lastName: null,
          firstName: null,
          organizationName: "ACME Health Systems",
          exclusionReasons: ["OE"],
          effectiveDate: new Date("2021-03-01"),
        },
      ]);
      p.healthcarePaymentRecord.count.mockResolvedValue(5);
      const { detectExcludedProviderBilling } = await importHealthcareDetectors(p);

      const signals = await detectExcludedProviderBilling("entity-2");
      expect(signals).toHaveLength(1);
      expect(signals[0].signalKey).toBe("excluded_provider_billing");
      expect(signals[0].severity).toBe("critical");
    });

    it("returns multiple signals for multiple exclusion matches", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-3",
        lastName: "JOHNSON",
        firstName: null,
      });
      p.hHSExclusion.findMany.mockResolvedValue([
        {
          id: "excl-a",
          uiEProviderId: "A1",
          lastName: "JOHNSON",
          firstName: null,
          organizationName: null,
          exclusionReasons: ["UPPI"],
          effectiveDate: new Date("2019-01-01"),
        },
        {
          id: "excl-b",
          uiEProviderId: "A2",
          lastName: "JOHNSON",
          firstName: null,
          organizationName: null,
          exclusionReasons: ["FKS"],
          effectiveDate: new Date("2020-01-01"),
        },
      ]);
      p.healthcarePaymentRecord.count.mockResolvedValue(8);
      const { detectExcludedProviderBilling } = await importHealthcareDetectors(p);

      const signals = await detectExcludedProviderBilling("entity-3");
      expect(signals).toHaveLength(2);
      expect(signals[0].sourceRecordId).toBe("excl-a");
      expect(signals[1].sourceRecordId).toBe("excl-b");
    });

    it("returns [] on DB error", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockRejectedValue(
        new Error("DB connection failed"),
      );
      const { detectExcludedProviderBilling } = await importHealthcareDetectors(p);

      const signals = await detectExcludedProviderBilling("entity-err");
      expect(signals).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Signal 2: detectPaymentConcentration
  // -----------------------------------------------------------------------

  describe("detectPaymentConcentration", () => {
    it("returns [] when no payments exist", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockResolvedValue([]);
      const { detectPaymentConcentration } = await importHealthcareDetectors(p);

      const signals = await detectPaymentConcentration("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns [] when concentration is <= 50%", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockResolvedValue([
        { id: "p1", companyEntityId: "co-1", amountUsd: 5000, manufacturerName: "PharmaCo" },
        { id: "p2", companyEntityId: "co-2", amountUsd: 5000, manufacturerName: "MedSupply" },
      ]);
      const { detectPaymentConcentration } = await importHealthcareDetectors(p);

      const signals = await detectPaymentConcentration("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns high-severity signal when >50% from single payer", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockResolvedValue([
        { id: "p1", companyEntityId: "co-1", amountUsd: 9000, manufacturerName: "BigPharma" },
        { id: "p2", companyEntityId: "co-2", amountUsd: 1000, manufacturerName: "SmallMed" },
      ]);
      const { detectPaymentConcentration } = await importHealthcareDetectors(p);

      const signals = await detectPaymentConcentration("entity-1");
      expect(signals).toHaveLength(1);
      const s = signals[0];
      expect(s.signalKey).toBe("payment_concentration");
      expect(s.severity).toBe("high");
      expect(s.scoreImpact).toBe(20);
      expect(s.measuredValue).toBe(90);
      expect(s.detail).toContain("BigPharma");
    });

    it("returns signal when 100% from single payer (only one company)", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockResolvedValue([
        { id: "p1", companyEntityId: "co-1", amountUsd: 5000, manufacturerName: "SinglePharma" },
        { id: "p2", companyEntityId: "co-1", amountUsd: 3000, manufacturerName: "SinglePharma" },
      ]);
      const { detectPaymentConcentration } = await importHealthcareDetectors(p);

      const signals = await detectPaymentConcentration("entity-1");
      expect(signals).toHaveLength(1);
      expect(signals[0].measuredValue).toBe(100);
    });

    it("returns [] on DB error", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockRejectedValue(
        new Error("DB connection failed"),
      );
      const { detectPaymentConcentration } = await importHealthcareDetectors(p);

      const signals = await detectPaymentConcentration("entity-err");
      expect(signals).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Signal 3: detectStructuredPayments
  // -----------------------------------------------------------------------

  describe("detectStructuredPayments", () => {
    it("returns [] when no small payments exist", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockResolvedValue([]);
      const { detectStructuredPayments } = await importHealthcareDetectors(p);

      const signals = await detectStructuredPayments("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns [] when small payments are below threshold (<= 50)", async () => {
      const p = createPrismaMock();
      const payments = Array.from({ length: 40 }, (_, i) => ({
        id: `p-${i}`,
        amountUsd: 50,
        programYear: 2023,
        manufacturerName: "PharmaCo",
      }));
      p.healthcarePaymentRecord.findMany.mockResolvedValue(payments);
      const { detectStructuredPayments } = await importHealthcareDetectors(p);

      const signals = await detectStructuredPayments("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns medium-severity signal when >50 small payments in a year", async () => {
      const p = createPrismaMock();
      const payments = Array.from({ length: 60 }, (_, i) => ({
        id: `p-${i}`,
        amountUsd: 75,
        programYear: 2023,
        manufacturerName: "PharmaCo",
      }));
      p.healthcarePaymentRecord.findMany.mockResolvedValue(payments);
      const { detectStructuredPayments } = await importHealthcareDetectors(p);

      const signals = await detectStructuredPayments("entity-1");
      expect(signals).toHaveLength(1);
      const s = signals[0];
      expect(s.signalKey).toBe("structured_payments");
      expect(s.severity).toBe("medium");
      expect(s.scoreImpact).toBe(15);
      expect(s.measuredValue).toBe(60);
      expect(s.detail).toContain("2023");
    });

    it("only flags years that exceed threshold", async () => {
      const p = createPrismaMock();
      const payments = [
        ...Array.from({ length: 30 }, (_, i) => ({
          id: `p-y1-${i}`,
          amountUsd: 50,
          programYear: 2022,
          manufacturerName: "PharmaCo",
        })),
        ...Array.from({ length: 55 }, (_, i) => ({
          id: `p-y2-${i}`,
          amountUsd: 60,
          programYear: 2023,
          manufacturerName: "PharmaCo",
        })),
      ];
      p.healthcarePaymentRecord.findMany.mockResolvedValue(payments);
      const { detectStructuredPayments } = await importHealthcareDetectors(p);

      const signals = await detectStructuredPayments("entity-1");
      expect(signals).toHaveLength(1);
      expect(signals[0].detail).toContain("2023");
      expect(signals[0].detail).not.toContain("2022");
    });

    it("returns [] on DB error", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockRejectedValue(
        new Error("DB connection failed"),
      );
      const { detectStructuredPayments } = await importHealthcareDetectors(p);

      const signals = await detectStructuredPayments("entity-err");
      expect(signals).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Signal 4: detectRapidVolumeGrowth
  // -----------------------------------------------------------------------

  describe("detectRapidVolumeGrowth", () => {
    it("returns [] when no payments exist", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockResolvedValue([]);
      const { detectRapidVolumeGrowth } = await importHealthcareDetectors(p);

      const signals = await detectRapidVolumeGrowth("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns [] when growth is <= 2x year-over-year", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockResolvedValue([
        { id: "p1", amountUsd: 10000, programYear: 2022 },
        { id: "p2", amountUsd: 15000, programYear: 2023 },
      ]);
      const { detectRapidVolumeGrowth } = await importHealthcareDetectors(p);

      const signals = await detectRapidVolumeGrowth("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns medium-severity signal when >2x YoY growth", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockResolvedValue([
        { id: "p1", amountUsd: 5000, programYear: 2022 },
        { id: "p2", amountUsd: 20000, programYear: 2023 },
      ]);
      const { detectRapidVolumeGrowth } = await importHealthcareDetectors(p);

      const signals = await detectRapidVolumeGrowth("entity-1");
      expect(signals).toHaveLength(1);
      const s = signals[0];
      expect(s.signalKey).toBe("rapid_volume_growth");
      expect(s.severity).toBe("medium");
      expect(s.scoreImpact).toBe(10);
      expect(s.measuredValue).toBe(4); // 20000/5000 = 4x
      expect(s.detail).toContain("2022");
      expect(s.detail).toContain("2023");
    });

    it("skips non-consecutive years", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockResolvedValue([
        { id: "p1", amountUsd: 1000, programYear: 2020 },
        { id: "p2", amountUsd: 50000, programYear: 2023 },
      ]);
      const { detectRapidVolumeGrowth } = await importHealthcareDetectors(p);

      const signals = await detectRapidVolumeGrowth("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("detects max growth across multiple consecutive years", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockResolvedValue([
        { id: "p1", amountUsd: 10000, programYear: 2021 },
        { id: "p2", amountUsd: 12000, programYear: 2022 },
        { id: "p3", amountUsd: 36000, programYear: 2023 },
      ]);
      const { detectRapidVolumeGrowth } = await importHealthcareDetectors(p);

      const signals = await detectRapidVolumeGrowth("entity-1");
      expect(signals).toHaveLength(1);
      expect(signals[0].measuredValue).toBe(3); // 36000/12000 = 3x
    });

    it("returns [] on DB error", async () => {
      const p = createPrismaMock();
      p.healthcarePaymentRecord.findMany.mockRejectedValue(
        new Error("DB connection failed"),
      );
      const { detectRapidVolumeGrowth } = await importHealthcareDetectors(p);

      const signals = await detectRapidVolumeGrowth("entity-err");
      expect(signals).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Signal 5: detectCMSProgramSafeguardExclusion
  // -----------------------------------------------------------------------

  describe("detectCMSProgramSafeguardExclusion", () => {
    it("returns [] when no healthcare profile exists", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue(null);
      const { detectCMSProgramSafeguardExclusion } = await importHealthcareDetectors(p);

      const signals = await detectCMSProgramSafeguardExclusion("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns [] when profile has no name fields", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-1",
        lastName: null,
        firstName: null,
      });
      const { detectCMSProgramSafeguardExclusion } = await importHealthcareDetectors(p);

      const signals = await detectCMSProgramSafeguardExclusion("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns [] when no CMS safeguard matches found", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-1",
        lastName: "DOE",
        firstName: "JANE",
      });
      p.cMSProgramSafeguardExclusion.findMany.mockResolvedValue([]);
      const { detectCMSProgramSafeguardExclusion } = await importHealthcareDetectors(p);

      const signals = await detectCMSProgramSafeguardExclusion("entity-1");
      expect(signals).toHaveLength(0);
    });

    it("returns high-severity signal when entity is on CMS safeguard list", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-1",
        lastName: "DOE",
        firstName: "JANE",
      });
      p.canonicalEntity.findUnique.mockResolvedValue({
        displayName: "Doe Medical Group",
      });
      p.cMSProgramSafeguardExclusion.findMany.mockResolvedValue([
        {
          id: "cms-1",
          cmsId: "CMS-456",
          lastName: "DOE",
          firstName: "JANE",
          organizationName: null,
          exclusionType: "AKS",
          effectiveDate: new Date("2021-05-01"),
          state: "CA",
        },
      ]);
      const { detectCMSProgramSafeguardExclusion } = await importHealthcareDetectors(p);

      const signals = await detectCMSProgramSafeguardExclusion("entity-1");
      expect(signals).toHaveLength(1);
      const s = signals[0];
      expect(s.signalKey).toBe("cms_safeguard_exclusion");
      expect(s.signalLabel).toBe("CMS Program Safeguard Exclusion Match");
      expect(s.severity).toBe("high");
      expect(s.scoreImpact).toBe(40);
      expect(s.sourceRecordId).toBe("cms-1");
      expect(s.detail).toContain("CMS-456");
      expect(s.detail).toContain("AKS");
    });

    it("matches by organization name", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-2",
        lastName: "MEDCARE",
        firstName: null,
      });
      p.canonicalEntity.findUnique.mockResolvedValue({
        displayName: "MedCare Inc",
      });
      p.cMSProgramSafeguardExclusion.findMany.mockResolvedValue([
        {
          id: "cms-2",
          cmsId: "CMS-789",
          lastName: null,
          firstName: null,
          organizationName: "MedCare Inc",
          exclusionType: "TK",
          effectiveDate: new Date("2022-01-15"),
          state: "TX",
        },
      ]);
      const { detectCMSProgramSafeguardExclusion } = await importHealthcareDetectors(p);

      const signals = await detectCMSProgramSafeguardExclusion("entity-2");
      expect(signals).toHaveLength(1);
      expect(signals[0].detail).toContain("MedCare Inc");
    });

    it("returns multiple signals for multiple CMS matches", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-3",
        lastName: "WILLIAMS",
        firstName: "BOB",
      });
      p.cMSProgramSafeguardExclusion.findMany.mockResolvedValue([
        {
          id: "cms-a",
          cmsId: "CMS-A",
          lastName: "WILLIAMS",
          firstName: "BOB",
          organizationName: null,
          exclusionType: "AKS",
          effectiveDate: new Date("2020-01-01"),
          state: "NY",
        },
        {
          id: "cms-b",
          cmsId: "CMS-B",
          lastName: "WILLIAMS",
          firstName: "BOB",
          organizationName: null,
          exclusionType: "FKA",
          effectiveDate: new Date("2021-06-01"),
          state: "FL",
        },
      ]);
      const { detectCMSProgramSafeguardExclusion } = await importHealthcareDetectors(p);

      const signals = await detectCMSProgramSafeguardExclusion("entity-3");
      expect(signals).toHaveLength(2);
      expect(signals[0].sourceRecordId).toBe("cms-a");
      expect(signals[1].sourceRecordId).toBe("cms-b");
    });

    it("returns [] on DB error", async () => {
      const p = createPrismaMock();
      p.healthcareRecipientProfile.findUnique.mockRejectedValue(
        new Error("DB connection failed"),
      );
      const { detectCMSProgramSafeguardExclusion } = await importHealthcareDetectors(p);

      const signals = await detectCMSProgramSafeguardExclusion("entity-err");
      expect(signals).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // detectAllHealthcareSignals aggregate
  // -----------------------------------------------------------------------

  describe("detectAllHealthcareSignals", () => {
    it("returns combined signals from all detectors", async () => {
      const p = createPrismaMock();

      // Setup profile
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-1",
        lastName: "SMITH",
        firstName: "JOHN",
      });
      p.canonicalEntity.findUnique.mockResolvedValue({
        displayName: "Smith Medical",
      });

      // HHS exclusion match
      p.hHSExclusion.findMany.mockResolvedValue([
        {
          id: "excl-1",
          uiEProviderId: "E1",
          lastName: "SMITH",
          firstName: "JOHN",
          organizationName: null,
          exclusionReasons: ["UPPI"],
          effectiveDate: new Date("2020-01-01"),
        },
      ]);
      p.healthcarePaymentRecord.count.mockResolvedValue(10);

      // Payment concentration: >50% from single payer
      p.healthcarePaymentRecord.findMany.mockResolvedValue([
        { id: "p1", companyEntityId: "co-1", amountUsd: 9000, manufacturerName: "BigPharma", programYear: 2023 },
        { id: "p2", companyEntityId: "co-2", amountUsd: 1000, manufacturerName: "SmallMed", programYear: 2023 },
      ]);

      // No CMS matches
      p.cMSProgramSafeguardExclusion.findMany.mockResolvedValue([]);

      const { detectAllHealthcareSignals } = await importHealthcareDetectors(p);

      const signals = await detectAllHealthcareSignals("entity-1");
      // excluded_provider_billing + payment_concentration
      expect(signals.length).toBeGreaterThanOrEqual(2);
      const keys = signals.map((s) => s.signalKey);
      expect(keys).toContain("excluded_provider_billing");
      expect(keys).toContain("payment_concentration");
    });

    it("continues even if one detector throws an error", async () => {
      const p = createPrismaMock();

      // Setup profile with minimal data
      p.healthcareRecipientProfile.findUnique.mockResolvedValue({
        entityId: "entity-1",
        lastName: "SMITH",
        firstName: null,
      });
      p.canonicalEntity.findUnique.mockResolvedValue(null);

      // HHS exclusion fails
      p.hHSExclusion.findMany.mockRejectedValue(new Error("HHS query failed"));

      // Payment concentration succeeds
      p.healthcarePaymentRecord.findMany.mockResolvedValue([
        { id: "p1", companyEntityId: "co-1", amountUsd: 9000, manufacturerName: "BigPharma", programYear: 2023 },
        { id: "p2", companyEntityId: "co-2", amountUsd: 1000, manufacturerName: "SmallMed", programYear: 2023 },
      ]);
      p.healthcarePaymentRecord.count.mockResolvedValue(2);

      // CMS safeguard fails
      p.cMSProgramSafeguardExclusion.findMany.mockRejectedValue(
        new Error("CMS query failed"),
      );

      const { detectAllHealthcareSignals } = await importHealthcareDetectors(p);

      const signals = await detectAllHealthcareSignals("entity-1");
      // At minimum the payment_concentration should still be returned
      const keys = signals.map((s) => s.signalKey);
      expect(keys).toContain("payment_concentration");
    });
  });
});
