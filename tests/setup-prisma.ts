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
    politicalBillRecord: mockModel(),
    consumerComplaintRecord: mockModel(),
    fraudSnapshot: mockModel(),
    fraudSignalEvent: mockModel(),
    regulatoryAction: mockModel(),
    ingestionRun: mockModel(),
    job: mockModel(),
    sourceSystem: mockModel(),
    canonicalEntity: mockModel(),
    entityAlias: mockModel(),
    cmsOpenPaymentRecord: mockModel(),
    ...allMockMethods,
    $queryRaw: mockFn(() => Promise.resolve([])),
    $executeRaw: mockFn(() => Promise.resolve(0)),
    $transaction: mockFn(async (fn) => fn({})),
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
