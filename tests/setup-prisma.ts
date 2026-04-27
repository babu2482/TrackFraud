/**
 * Shared Prisma mock for API route tests.
 * Import this file in test files to get a fully mocked prisma client.
 */

import { vi } from 'vitest';

const mockFn = vi.fn as any;
const allMockMethods = {
  findMany: mockFn(() => Promise.resolve([])),
  findFirst: mockFn(() => Promise.resolve(null)),
  findUnique: mockFn(() => Promise.resolve(null)),
  findRaw: mockFn(() => Promise.resolve([])),
  count: mockFn(() => Promise.resolve(0)),
  create: mockFn(() => Promise.resolve({ id: 'mock-id' })),
  createMany: mockFn(() => Promise.resolve({ count: 0 })),
  update: mockFn(() => Promise.resolve({ id: 'mock-id' })),
  updateMany: mockFn(() => Promise.resolve({ count: 0 })),
  delete: mockFn(() => Promise.resolve({ id: 'mock-id' })),
  deleteMany: mockFn(() => Promise.resolve({ count: 0 })),
  upsert: mockFn(() => Promise.resolve({ id: 'mock-id' })),
  aggregate: mockFn(() =>
    Promise.resolve({ _avg: { score: 0 }, _min: { score: 0 }, _max: { score: 100 }, _sum: { score: 0 }, _count: 0 })
  ),
  groupBy: mockFn(() => Promise.resolve([])),
  createManyAndReturn: mockFn(() => Promise.resolve([])),
};

const mockModel = () => ({
  ...allMockMethods,
  create: mockFn(() => Promise.resolve({ id: 'mock-id' })),
});

vi.mock('@/lib/db', () => ({
  prisma: {
    charityProfile: mockModel(),
    corporateCompanyProfile: mockModel(),
    governmentAwardRecord: mockModel(),
    healthcareRecipientProfile: mockModel(),
    politicalCandidateProfile: mockModel(),
    politicalCommitteeProfile: mockModel(),
    // BUG-021 fix: Use actual Prisma model names + keep legacy aliases for compat
    Bill: mockModel(),
    BillSponsor: mockModel(),
    BillVote: mockModel(),
    politicalBillRecord: mockModel(), // legacy alias
    ConsumerComplaintRecord: mockModel(),
    consumerComplaintRecord: mockModel(), // legacy alias
    FraudSnapshot: mockModel(),
    fraudSnapshot: mockModel(), // legacy alias
    FraudSignalEvent: mockModel(),
    fraudSignalEvent: mockModel(), // legacy alias
    regulatoryAction: mockModel(), // legacy alias (no matching Prisma model)
    IngestionRun: mockModel(),
    ingestionRun: mockModel(), // legacy alias
    job: mockModel(), // legacy alias (no matching Prisma model)
    SourceSystem: mockModel(),
    sourceSystem: mockModel(), // legacy alias
    CanonicalEntity: mockModel(),
    canonicalEntity: mockModel(), // legacy alias
    EntityAlias: mockModel(),
    entityAlias: mockModel(), // legacy alias
    HealthcarePaymentRecord: mockModel(),
    cmsOpenPaymentRecord: mockModel(), // legacy alias (no matching Prisma model)
    ...allMockMethods,
    $queryRaw: mockFn(() => Promise.resolve([])),
    $executeRaw: mockFn(() => Promise.resolve(0)),
    $transaction: mockFn(async (fn: (...args: any[]) => any) => fn({})),
    $connect: mockFn(() => Promise.resolve()),
    $disconnect: mockFn(() => Promise.resolve()),
    $on: mockFn(() => {}),
    $extends: mockFn(() => ({})),
  },
}));

// Also mock common lib dependencies
vi.mock('ioredis', () => ({
  Redis: vi.fn(() => ({
    connect: vi.fn(() => Promise.reject(new Error('Redis unavailable in tests'))),
    on: vi.fn(),
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve('OK')),
    del: vi.fn(() => Promise.resolve(1)),
  })),
}));

vi.mock('@/lib/fec', () => ({
  isFECRequestError: vi.fn(() => false),
  listCandidates: vi.fn(() => Promise.resolve([])),
  listCommittees: vi.fn(() => Promise.resolve([])),
  getCandidateDetails: vi.fn(() => Promise.resolve(null)),
  getCommitteeDetails: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/search', () => ({
  searchAll: vi.fn(() =>
    Promise.resolve({
      hits: [],
      estimatedTotalHits: 0,
      offset: 0,
      limit: 20,
      processingTimeMs: 1,
      query: '',
      facets: {},
    })
  ),
  searchCharities: vi.fn(() => Promise.resolve({ hits: [], estimatedTotalHits: 0, offset: 0, limit: 20, processingTimeMs: 1, query: '', facets: {} })),
  searchCorporations: vi.fn(() => Promise.resolve({ hits: [], estimatedTotalHits: 0, offset: 0, limit: 20, processingTimeMs: 1, query: '', facets: {} })),
  getAutocompleteSuggestions: vi.fn(() => Promise.resolve([])),
  getFacetDistribution: vi.fn(() => Promise.resolve({})),
  checkHealth: vi.fn(() => Promise.resolve({ status: 'available' })),
  INDEX_NAMES: { charities: 'charities', corporations: 'corporations' },
}));

vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn(() => Promise.resolve(null)),
  cacheSet: vi.fn(() => Promise.resolve()),
  cacheDelete: vi.fn(() => Promise.resolve()),
  cacheInvalidate: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/lib/sec', () => ({
  searchCompanies: vi.fn(() => Promise.resolve({ results: [] })),
  getCompanyFilings: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/corporate-read', () => ({
  hasLocalCorporateMirror: vi.fn(() => Promise.resolve(true)),
  getLocalCorporateMirrorStatus: vi.fn(() => Promise.resolve({ coverage: 0.9 })),
  searchStoredCorporateCompanies: vi.fn(() => Promise.resolve({ results: [] })),
  getCorporateCompany: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/government-read', () => ({
  hasLocalGovernmentMirror: vi.fn(() => Promise.resolve(true)),
  getLocalGovernmentMirrorStatus: vi.fn(() => Promise.resolve({ coverage: 0.9 })),
  searchStoredGovernmentAwards: vi.fn(() => Promise.resolve({ results: [] })),
  getGovernmentAward: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/usaspending', () => ({
  searchAwards: vi.fn(() => Promise.resolve({ results: [] })),
  getAwardDetails: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/warehouse', () => ({
  withMirrorMetadata: vi.fn((data) => data),
  getMirrorStatus: vi.fn(() => Promise.resolve({ coverage: 0.9 })),
}));

vi.mock('@/lib/corporate-analysis', () => ({
  analyzeCorporateEntity: vi.fn(() => Promise.resolve({ signals: [] })),
}));

vi.mock('@/lib/government-analysis', () => ({
  analyzeGovernmentEntity: vi.fn(() => Promise.resolve({ signals: [] })),
}));

vi.mock('@/lib/healthcare-analysis', () => ({
  analyzeHealthcareEntity: vi.fn(() => Promise.resolve({ signals: [] })),
}));

vi.mock('@/lib/consumer-analysis', () => ({
  analyzeConsumerEntity: vi.fn(() => Promise.resolve({ signals: [] })),
}));

vi.mock('@/lib/political-analysis', () => ({
  analyzePoliticalEntity: vi.fn(() => Promise.resolve({ signals: [] })),
}));

vi.mock('@/lib/charity-read', () => ({
  hasLocalCharityMirror: vi.fn(() => Promise.resolve(true)),
  getLocalCharityMirrorStatus: vi.fn(() => Promise.resolve({ coverage: 0.9 })),
  searchStoredCharities: vi.fn(() => Promise.resolve({ results: [] })),
}));

vi.mock('@/lib/charity-search', () => ({
  searchCharities: vi.fn(() => Promise.resolve({ results: [] })),
}));

vi.mock('@/lib/healthcare-read', () => ({
  hasLocalHealthcareMirror: vi.fn(() => Promise.resolve(true)),
  getLocalHealthcareMirrorStatus: vi.fn(() => Promise.resolve({ coverage: 0.9 })),
  searchStoredHealthcareProviders: vi.fn(() => Promise.resolve({ results: [] })),
}));

vi.mock('@/lib/consumer-read', () => ({
  hasLocalConsumerMirror: vi.fn(() => Promise.resolve(true)),
  getLocalConsumerMirrorStatus: vi.fn(() => Promise.resolve({ coverage: 0.9 })),
  searchStoredConsumerComplaints: vi.fn(() => Promise.resolve({ results: [] })),
}));

vi.mock('@/lib/political-read', () => ({
  hasLocalPoliticalMirror: vi.fn(() => Promise.resolve(true)),
  getLocalPoliticalMirrorStatus: vi.fn(() => Promise.resolve({ coverage: 0.9 })),
  searchStoredPoliticalEntities: vi.fn(() => Promise.resolve({ results: [] })),
  listCandidates: vi.fn(() => Promise.resolve([])),
  listCommittees: vi.fn(() => Promise.resolve([])),
  listBills: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/cms', () => ({
  searchOpenPayments: vi.fn(() => Promise.resolve({ results: [] })),
}));

vi.mock('@/lib/metrics', () => ({
  increment: vi.fn(),
  gauge: vi.fn(),
  histogram: vi.fn(),
}));

vi.mock('@/lib/cfpb', () => ({
  searchComplaints: vi.fn(() => Promise.resolve({ results: [] })),
}));

vi.mock('@/lib/fraud-meter', () => ({
  buildFraudMeter: vi.fn(() => ({ score: 0, level: 'low' })),
}));

vi.mock('@/lib/fraud-signals', () => ({
  compositeScore: vi.fn(() => 0),
}));

vi.mock('@/lib/format', () => ({
  formatCurrency: vi.fn((n) => `$${n}`),
  formatDate: vi.fn((d) => d),
  formatNumber: vi.fn((n) => n),
}));

vi.mock('@/lib/types', () => ({}));
