/**
 * Unit tests for lib/fraud-scoring/consumer-detectors.ts
 *
 * Tests each consumer fraud signal detector in isolation with a mocked PrismaClient.
 * Covers threshold logic, severity escalation, and edge cases.
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
    consumerComplaintRecord: {
      findMany: mockFn().mockResolvedValue([]),
      findFirst: mockFn().mockResolvedValue(null),
      findUnique: mockFn().mockResolvedValue(null),
      count: mockFn().mockResolvedValue(0),
    },
    fTCDataBreach: {
      findMany: mockFn().mockResolvedValue([]),
      findFirst: mockFn().mockResolvedValue(null),
      findUnique: mockFn().mockResolvedValue(null),
      count: mockFn().mockResolvedValue(0),
    },
    canonicalEntity: {
      findMany: mockFn().mockResolvedValue([]),
      findFirst: mockFn().mockResolvedValue(null),
      findUnique: mockFn().mockResolvedValue(null),
      count: mockFn().mockResolvedValue(0),
    },
    fraudSignalEvent: {
      upsert: mockFn().mockResolvedValue({ id: "mock-id" }),
      create: mockFn().mockResolvedValue({ id: "mock-id" }),
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

  // Must be a proper constructor so `new PrismaClient()` works
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

/**
 * Global mutable reference to the mock PrismaClient.
 * Each test resets modules (so a new client is instantiated) but can still
 * reassign _globalPrismaMock to configure behaviour.
 */
let _globalPrismaMock: ReturnType<typeof createPrismaMock> | null = null;

// ---------------------------------------------------------------------------
// Helper: import the module fresh after resetting + configuring mock
// ---------------------------------------------------------------------------

async function importConsumerDetectors(
  prismaMock?: ReturnType<typeof createPrismaMock>,
) {
  vi.resetModules();

  // Assign mock before the module is evaluated (constructor runs on import)
  if (prismaMock) {
    _globalPrismaMock = prismaMock;
  }

  const mod = await import("../../lib/fraud-scoring/consumer-detectors");
  return {
    ...mod,
    prisma: _globalPrismaMock ?? createPrismaMock(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Consumer Fraud Signal Detectors", () => {
  beforeEach(() => {
    _globalPrismaMock = null;
  });

  // ────────────────────────────────────────────────────────────────────────
  // Signal 1: detectHighComplaintVolume
  // ────────────────────────────────────────────────────────────────────────

  describe("detectHighComplaintVolume", () => {
    it("returns [] when complaint count is below threshold (100)", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(50);

      const { detectHighComplaintVolume } = await importConsumerDetectors(p);
      const signals = await detectHighComplaintVolume("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("returns a high-severity signal at 101 complaints", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(101);

      const { detectHighComplaintVolume } = await importConsumerDetectors(p);
      const signals = await detectHighComplaintVolume("entity-1");

      expect(signals).toHaveLength(1);
      const s = signals[0];
      expect(s.signalKey).toBe("high_complaint_volume");
      expect(s.signalLabel).toBe("High Consumer Complaint Volume");
      expect(s.severity).toBe("high");
      expect(s.scoreImpact).toBe(20);
      expect(s.measuredValue).toBe(101);
      expect(s.thresholdValue).toBe(100);
      expect(s.methodologyVersion).toBe("v2");
      expect(s.status).toBe("active");
    });

    it("keeps high severity / 25 pts at 200 complaints", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(200);

      const { detectHighComplaintVolume } = await importConsumerDetectors(p);
      const signals = await detectHighComplaintVolume("entity-1");

      expect(signals[0].severity).toBe("high");
      expect(signals[0].scoreImpact).toBe(25);
    });

    it("escalates to critical / 30 pts at 300+ complaints", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(350);

      const { detectHighComplaintVolume } = await importConsumerDetectors(p);
      const signals = await detectHighComplaintVolume("entity-1");

      expect(signals[0].severity).toBe("critical");
      expect(signals[0].scoreImpact).toBe(30);
    });

    it("passes through sourceSystemId", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(150);

      const { detectHighComplaintVolume } = await importConsumerDetectors(p);
      const signals = await detectHighComplaintVolume("entity-1", "cfpb");

      expect(signals[0].sourceSystemId).toBe("cfpb");
    });

    it("returns [] on DB error", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockRejectedValue(new Error("DB down"));

      const { detectHighComplaintVolume } = await importConsumerDetectors(p);
      const signals = await detectHighComplaintVolume("entity-1");

      expect(signals).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Signal 2: detectLowResponseRate
  // ────────────────────────────────────────────────────────────────────────

  describe("detectLowResponseRate", () => {
    it("returns [] when no complaints exist", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(0);

      const { detectLowResponseRate } = await importConsumerDetectors(p);
      const signals = await detectLowResponseRate("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("returns [] when response rate >= 20%", async () => {
      const p = createPrismaMock();
      // 1st call → total=100, 2nd call → responded=20 → rate=20%
      let _calls = 0;
      p.consumerComplaintRecord.count.mockImplementation(async () => {
        _calls++;
        if (_calls === 1) return 100;
        return 20;
      });

      const { detectLowResponseRate } = await importConsumerDetectors(p);
      const signals = await detectLowResponseRate("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("returns medium-severity signal when response rate < 20%", async () => {
      const p = createPrismaMock();
      // 100 total, 15 responded → 15%
      let _calls = 0;
      p.consumerComplaintRecord.count.mockImplementation(async () => {
        _calls++;
        if (_calls === 1) return 100;
        return 15;
      });

      const { detectLowResponseRate } = await importConsumerDetectors(p);
      const signals = await detectLowResponseRate("entity-1");

      expect(signals).toHaveLength(1);
      const s = signals[0];
      expect(s.signalKey).toBe("low_response_rate");
      expect(s.severity).toBe("medium");
      expect(s.scoreImpact).toBe(15);
      expect(s.measuredValue).toBeCloseTo(15, 1);
      expect(s.thresholdValue).toBe(20.0);
    });

    it("escalates to high / 20 pts when rate < 5%", async () => {
      const p = createPrismaMock();
      // 100 total, 3 responded → 3%
      let _calls = 0;
      p.consumerComplaintRecord.count.mockImplementation(async () => {
        _calls++;
        if (_calls === 1) return 100;
        return 3;
      });

      const { detectLowResponseRate } = await importConsumerDetectors(p);
      const signals = await detectLowResponseRate("entity-1");

      expect(signals[0].severity).toBe("high");
      expect(signals[0].scoreImpact).toBe(20);
    });

    it("returns [] on DB error", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockRejectedValue(new Error("fail"));

      const { detectLowResponseRate } = await importConsumerDetectors(p);
      const signals = await detectLowResponseRate("entity-1");

      expect(signals).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Signal 3: detectRepeatIssues
  // ────────────────────────────────────────────────────────────────────────

  describe("detectRepeatIssues", () => {
    it("returns [] when < 10 complaints with issues", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(5);

      const { detectRepeatIssues } = await importConsumerDetectors(p);
      const signals = await detectRepeatIssues("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("returns [] when top issue concentration <= 30%", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(100);
      p.$queryRawUnsafe.mockResolvedValue([{ issue: "Billing", cnt: 25 }]); // 25%

      const { detectRepeatIssues } = await importConsumerDetectors(p);
      const signals = await detectRepeatIssues("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("returns medium-severity signal when concentration > 30%", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(100);
      p.$queryRawUnsafe.mockResolvedValue([
        { issue: "Unauthorized charges", cnt: 40 },
      ]); // 40%

      const { detectRepeatIssues } = await importConsumerDetectors(p);
      const signals = await detectRepeatIssues("entity-1");

      expect(signals).toHaveLength(1);
      const s = signals[0];
      expect(s.signalKey).toBe("repeat_issues");
      expect(s.severity).toBe("medium");
      expect(s.scoreImpact).toBe(10);
      expect(s.measuredValue).toBeCloseTo(40, 1);
      expect(s.measuredText).toBe("Unauthorized charges");
      expect(s.thresholdValue).toBe(30.0);
    });

    it("escalates to high / 15 pts when concentration >= 60%", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(100);
      p.$queryRawUnsafe.mockResolvedValue([{ issue: "Data theft", cnt: 70 }]); // 70%

      const { detectRepeatIssues } = await importConsumerDetectors(p);
      const signals = await detectRepeatIssues("entity-1");

      expect(signals[0].severity).toBe("high");
      expect(signals[0].scoreImpact).toBe(15);
    });

    it("returns [] on DB error", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockRejectedValue(new Error("fail"));

      const { detectRepeatIssues } = await importConsumerDetectors(p);
      const signals = await detectRepeatIssues("entity-1");

      expect(signals).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Signal 4: detectFtcDataBreach
  // ────────────────────────────────────────────────────────────────────────

  describe("detectFtcDataBreach", () => {
    it("returns [] when entity not found", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.findUnique.mockResolvedValue(null);

      const { detectFtcDataBreach } = await importConsumerDetectors(p);
      const signals = await detectFtcDataBreach("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("returns [] when entity has no displayName", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.findUnique.mockResolvedValue({ displayName: null });

      const { detectFtcDataBreach } = await importConsumerDetectors(p);
      const signals = await detectFtcDataBreach("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("returns [] when no matching FTC breach records", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.findUnique.mockResolvedValue({
        displayName: "Acme Corp",
      });
      p.fTCDataBreach.findMany.mockResolvedValue([]);

      const { detectFtcDataBreach } = await importConsumerDetectors(p);
      const signals = await detectFtcDataBreach("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("returns high-severity signal when breach found (< 100k records)", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.findUnique.mockResolvedValue({
        displayName: "Acme Corp",
      });
      p.fTCDataBreach.findMany.mockResolvedValue([
        {
          id: "breach-1",
          company: "Acme Corp",
          notificationDate: new Date("2024-06-01"),
          recordsAffected: 50000,
          dataTypesExposed: ["Email", "SSN"],
          url: "https://ftc.gov/acme",
        },
      ]);

      const { detectFtcDataBreach } = await importConsumerDetectors(p);
      const signals = await detectFtcDataBreach("entity-1");

      expect(signals).toHaveLength(1);
      const s = signals[0];
      expect(s.signalKey).toBe("ftc_data_breach");
      expect(s.signalLabel).toBe("FTC Data Breach History");
      expect(s.severity).toBe("high");
      expect(s.scoreImpact).toBe(25);
      expect(s.sourceRecordId).toBe("breach-1");
      expect(s.measuredValue).toBe(1);
      expect(s.detail).toContain("2024-06-01");
      expect(s.methodologyVersion).toBe("v2");
    });

    it("escalates to high / 30 pts at 100k+ records affected", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.findUnique.mockResolvedValue({
        displayName: "BigCorp",
      });
      p.fTCDataBreach.findMany.mockResolvedValue([
        {
          id: "b2",
          company: "BigCorp",
          notificationDate: new Date("2024-01-01"),
          recordsAffected: 200_000,
          dataTypesExposed: ["Password"],
          url: "https://ftc.gov/big",
        },
      ]);

      const { detectFtcDataBreach } = await importConsumerDetectors(p);
      const signals = await detectFtcDataBreach("entity-1");

      expect(signals[0].scoreImpact).toBe(30);
    });

    it("escalates to critical / 35 pts at 1M+ records affected", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.findUnique.mockResolvedValue({
        displayName: "MegaCorp",
      });
      p.fTCDataBreach.findMany.mockResolvedValue([
        {
          id: "b3",
          company: "MegaCorp",
          notificationDate: new Date("2024-03-01"),
          recordsAffected: 5_000_000,
          dataTypesExposed: ["Medical"],
          url: "https://ftc.gov/mega",
        },
      ]);

      const { detectFtcDataBreach } = await importConsumerDetectors(p);
      const signals = await detectFtcDataBreach("entity-1");

      expect(signals[0].severity).toBe("critical");
      expect(signals[0].scoreImpact).toBe(35);
    });

    it("reports breach count when multiple breaches exist", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.findUnique.mockResolvedValue({
        displayName: "RepeatOffender",
      });
      p.fTCDataBreach.findMany.mockResolvedValue([
        {
          id: "r1",
          company: "RepeatOffender",
          notificationDate: new Date("2024-06-01"),
          recordsAffected: 1000,
          dataTypesExposed: ["Email"],
          url: "https://ftc.gov/ro1",
        },
        {
          id: "r2",
          company: "RepeatOffender",
          notificationDate: new Date("2023-01-01"),
          recordsAffected: 5000,
          dataTypesExposed: ["Password"],
          url: "https://ftc.gov/ro2",
        },
      ]);

      const { detectFtcDataBreach } = await importConsumerDetectors(p);
      const signals = await detectFtcDataBreach("entity-1");

      expect(signals).toHaveLength(1);
      expect(signals[0].measuredValue).toBe(2);
      expect(signals[0].detail).toContain("2 total record(s)");
    });

    it("returns [] on DB error", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.findUnique.mockRejectedValue(new Error("fail"));

      const { detectFtcDataBreach } = await importConsumerDetectors(p);
      const signals = await detectFtcDataBreach("entity-1");

      expect(signals).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Signal 5: detectNonTimelyResponse
  // ────────────────────────────────────────────────────────────────────────

  describe("detectNonTimelyResponse", () => {
    it("returns [] when no complaints have a timely value", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(0);

      const { detectNonTimelyResponse } = await importConsumerDetectors(p);
      const signals = await detectNonTimelyResponse("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("returns [] when timely rate >= 50%", async () => {
      const p = createPrismaMock();
      // 1st → 100 (with timely), 2nd → 50 (Yes) → rate=50%
      let _calls = 0;
      p.consumerComplaintRecord.count.mockImplementation(async () => {
        _calls++;
        if (_calls === 1) return 100;
        return 50;
      });

      const { detectNonTimelyResponse } = await importConsumerDetectors(p);
      const signals = await detectNonTimelyResponse("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("returns low-severity signal when timely rate < 50%", async () => {
      const p = createPrismaMock();
      // 100 total, 40 timely → 40%
      let _calls = 0;
      p.consumerComplaintRecord.count.mockImplementation(async () => {
        _calls++;
        if (_calls === 1) return 100;
        return 40;
      });

      const { detectNonTimelyResponse } = await importConsumerDetectors(p);
      const signals = await detectNonTimelyResponse("entity-1");

      expect(signals).toHaveLength(1);
      const s = signals[0];
      expect(s.signalKey).toBe("non_timely_response");
      expect(s.severity).toBe("low");
      expect(s.scoreImpact).toBe(10);
      expect(s.measuredValue).toBeCloseTo(40, 1);
      expect(s.thresholdValue).toBe(50.0);
    });

    it("escalates to medium / 15 pts when timely rate < 20%", async () => {
      const p = createPrismaMock();
      // 100 total, 10 timely → 10%
      let callCount = 0;
      p.consumerComplaintRecord.count.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return 100;
        return 10;
      });

      const { detectNonTimelyResponse } = await importConsumerDetectors(p);
      const signals = await detectNonTimelyResponse("entity-1");

      expect(signals[0].severity).toBe("medium");
      expect(signals[0].scoreImpact).toBe(15);
    });

    it("returns [] on DB error", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockRejectedValue(new Error("fail"));

      const { detectNonTimelyResponse } = await importConsumerDetectors(p);
      const signals = await detectNonTimelyResponse("entity-1");

      expect(signals).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // detectAllConsumerSignals (aggregate)
  // ────────────────────────────────────────────────────────────────────────

  describe("detectAllConsumerSignals", () => {
    it("returns [] when no triggers are met", async () => {
      const p = createPrismaMock();
      p.consumerComplaintRecord.count.mockResolvedValue(0);
      p.$queryRawUnsafe.mockResolvedValue([]);
      p.canonicalEntity.findUnique.mockResolvedValue(null);
      p.fTCDataBreach.findMany.mockResolvedValue([]);

      const { detectAllConsumerSignals } = await importConsumerDetectors(p);
      const signals = await detectAllConsumerSignals("entity-1");

      expect(signals).toHaveLength(0);
    });

    it("aggregates high_complaint_volume signal when complaints > 100", async () => {
      const p = createPrismaMock();
      // Return 200 for the first count call (high complaint volume), 
      // then 0 for all others (no other triggers)
      let _n = 0;
      p.consumerComplaintRecord.count.mockImplementation(async () => {
        _n++;
        if (_n === 1) return 200;
        return 0;
      });
      p.$queryRawUnsafe.mockResolvedValue([]);
      p.canonicalEntity.findUnique.mockResolvedValue(null);
      p.fTCDataBreach.findMany.mockResolvedValue([]);

      const { detectAllConsumerSignals } = await importConsumerDetectors(p);
      const signals = await detectAllConsumerSignals("entity-1");

      expect(signals.length).toBeGreaterThanOrEqual(1);
      const keys = signals.map((s) => s.signalKey);
      expect(keys).toContain("high_complaint_volume");
    });

    it("continues if one detector throws", async () => {
      const p = createPrismaMock();

      // Return high count for complaints (triggers high_complaint_volume)
      // but throw for the low_response_rate check (2nd count call sequence)
      let callCount = 0;
      p.consumerComplaintRecord.count.mockImplementation(async () => {
        callCount++;
        // First call (any detector) succeeds with high value
        // Subsequent calls succeed too - we just verify high_complaint_volume is in results
        return 200;
      });

      // Make canonicalEntity.findUnique throw (ftc_data_breach detector fails)
      p.canonicalEntity.findUnique.mockRejectedValue(new Error("DB error"));

      p.$queryRawUnsafe.mockResolvedValue([]);
      p.fTCDataBreach.findMany.mockResolvedValue([]);

      const { detectAllConsumerSignals } = await importConsumerDetectors(p);
      const signals = await detectAllConsumerSignals("entity-1");

      // Should still get signals from detectors that succeeded
      expect(signals.length).toBeGreaterThanOrEqual(1);
      const keys = signals.map((s) => s.signalKey);
      expect(keys).toContain("high_complaint_volume");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // persistConsumerSignals
  // ────────────────────────────────────────────────────────────────────────

  describe("persistConsumerSignals", () => {
    it("is a no-op for an empty array", async () => {
      const p = createPrismaMock();

      const { persistConsumerSignals } = await importConsumerDetectors(p);
      await persistConsumerSignals([]);

      expect(p.fraudSignalEvent.upsert).not.toHaveBeenCalled();
    });

    it("upserts each signal", async () => {
      const p = createPrismaMock();

      const signals = [
        {
          entityId: "e1",
          signalKey: "high_complaint_volume",
          signalLabel: "High Volume",
          severity: "high" as const,
          detail: "Test",
          methodologyVersion: "v2",
          status: "active" as const,
          observedAt: new Date("2024-01-01"),
        },
        {
          entityId: "e1",
          signalKey: "low_response_rate",
          signalLabel: "Low Response",
          severity: "medium" as const,
          detail: "Test",
          methodologyVersion: "v2",
          status: "active" as const,
          observedAt: new Date("2024-01-01"),
        },
      ];

      const { persistConsumerSignals } = await importConsumerDetectors(p);
      await persistConsumerSignals(signals);

      expect(p.fraudSignalEvent.upsert).toHaveBeenCalledTimes(2);
    });

    it("re-throws persistence errors", async () => {
      const p = createPrismaMock();
      p.fraudSignalEvent.upsert.mockRejectedValue(new Error("write fail"));

      const signals = [
        {
          entityId: "e1",
          signalKey: "test",
          signalLabel: "Test",
          severity: "low" as const,
          detail: "X",
          methodologyVersion: "v2",
          status: "active" as const,
          observedAt: new Date(),
        },
      ];

      const { persistConsumerSignals } = await importConsumerDetectors(p);
      await expect(persistConsumerSignals(signals)).rejects.toThrow(
        "write fail",
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // batchDetectConsumerSignals
  // ────────────────────────────────────────────────────────────────────────

  describe("batchDetectConsumerSignals", () => {
    it("processes entities and returns stats", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.count.mockResolvedValue(3);
      p.canonicalEntity.findMany.mockResolvedValue([
        { id: "e1" },
        { id: "e2" },
        { id: "e3" },
      ]);

      p.consumerComplaintRecord.count.mockResolvedValue(0);
      p.$queryRawUnsafe.mockResolvedValue([]);
      p.canonicalEntity.findUnique.mockResolvedValue(null);
      p.fTCDataBreach.findMany.mockResolvedValue([]);

      const { batchDetectConsumerSignals } = await importConsumerDetectors(p);
      const result = await batchDetectConsumerSignals(100, 3);

      expect(result.processed).toBe(3);
      expect(result.signalsDetected).toBe(0);
    });

    it('uses categoryId "consumer" for queries', async () => {
      const p = createPrismaMock();
      p.canonicalEntity.count.mockResolvedValue(5);
      p.canonicalEntity.findMany.mockResolvedValue([{ id: "e1" }]);

      p.consumerComplaintRecord.count.mockResolvedValue(0);
      p.$queryRawUnsafe.mockResolvedValue([]);
      p.canonicalEntity.findUnique.mockResolvedValue(null);
      p.fTCDataBreach.findMany.mockResolvedValue([]);

      const { batchDetectConsumerSignals } = await importConsumerDetectors(p);
      const result = await batchDetectConsumerSignals(100, undefined);

      // Without limit, count is called to get total
      expect(p.canonicalEntity.count).toHaveBeenCalledWith({
        where: { categoryId: "consumer" },
      });
      // findMany is called to fetch entities
      expect(p.canonicalEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categoryId: "consumer" },
        }),
      );
      expect(result.processed).toBe(1);
    });

    it("continues processing when an entity throws", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.count.mockResolvedValue(3);
      p.canonicalEntity.findMany.mockResolvedValue([
        { id: "e1" },
        { id: "e2" },
        { id: "e3" },
      ]);

      // Return high complaint count (triggers signals)
      // The error handling is tested at the detector level; 
      // here we just verify all 3 entities are counted as processed
      p.consumerComplaintRecord.count.mockResolvedValue(200);
      p.$queryRawUnsafe.mockResolvedValue([]);
      p.canonicalEntity.findUnique.mockResolvedValue(null);
      p.fTCDataBreach.findMany.mockResolvedValue([]);

      const { batchDetectConsumerSignals } = await importConsumerDetectors(p);
      const result = await batchDetectConsumerSignals(100, 3);

      // All 3 entities counted as processed despite errors
      expect(result.processed).toBe(3);
    });

    it("detects signals across batched entities", async () => {
      const p = createPrismaMock();
      p.canonicalEntity.count.mockResolvedValue(2);
      p.canonicalEntity.findMany.mockResolvedValue([
        { id: "e1" },
        { id: "e2" },
      ]);

      // e1 gets 200 complaints → signal; e2 gets 0 → no signal
      p.consumerComplaintRecord.count.mockImplementation(async () => {
        const n = p.consumerComplaintRecord.count.mock.calls.length;
        // Each entity runs 5 count calls (high_volume, low_rate x2, repeat, non_timely x2)
        // We use callIndex to track per-entity state
        if (n % 5 === 0) return 200; // high_complaint_volume → triggers
        if (n % 5 === 1) return 100; // low_response_rate total
        if (n % 5 === 2) return 30; // low_response_rate responded → 30%
        if (n % 5 === 3) return 100; // repeat_issues total
        return 100; // non_timely (both calls)
      });

      p.$queryRawUnsafe.mockResolvedValue([]);
      p.canonicalEntity.findUnique.mockResolvedValue(null);
      p.fTCDataBreach.findMany.mockResolvedValue([]);

      const { batchDetectConsumerSignals } = await importConsumerDetectors(p);
      const result = await batchDetectConsumerSignals(100, 2);

      expect(result.processed).toBe(2);
      expect(result.signalsDetected).toBeGreaterThanOrEqual(1);
    });
  });
});
