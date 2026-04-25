/**
 * Tests for /api/search route handler.
 *
 * Tests both GET and POST handlers directly by importing the route module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the search library before importing the route
vi.mock('@/lib/search', () => ({
  searchAll: vi.fn(() =>
    Promise.resolve({
      hits: [
        {
          entityId: 'ent-1',
          entityType: 'charity',
          name: 'Test Charity',
          ein: '12-3456789',
          city: 'Springfield',
          state: 'IL',
          riskScore: 45,
        },
      ],
      estimatedTotalHits: 1,
      offset: 0,
      limit: 20,
      processingTimeMs: 5,
      query: 'test',
      facets: {},
    })
  ),
  searchCharities: vi.fn(() =>
    Promise.resolve({
      hits: [],
      estimatedTotalHits: 0,
      offset: 0,
      limit: 20,
      processingTimeMs: 2,
      query: 'test',
      facets: {},
    })
  ),
  searchCorporations: vi.fn(() =>
    Promise.resolve({
      hits: [],
      estimatedTotalHits: 0,
      offset: 0,
      limit: 20,
      processingTimeMs: 2,
      query: 'test',
      facets: {},
    })
  ),
  getAutocompleteSuggestions: vi.fn(() =>
    Promise.resolve([
      { entityId: 'ent-1', entityType: 'charity', name: 'Test Charity' },
    ])
  ),
  getFacetDistribution: vi.fn(() => Promise.resolve({})),
  checkHealth: vi.fn(() => Promise.resolve({ status: 'available' })),
  INDEX_NAMES: { charities: 'charities', corporations: 'corporations' },
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
}));

// Dynamically import to apply mocks
const createRequest = (params: Record<string, string>) => {
  const url = new URL('http://localhost:3001/api/search');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return {
    url: url.toString(),
    method: 'GET',
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
    }),
  };
};

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset rate limiter by using different IPs
  });

  it('returns search results for valid query', async () => {
    const { GET } = await import('../../app/api/search/route');
    const req = createRequest({ q: 'test charity', limit: '5' });
    const response = await GET(req as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.results)).toBe(true);
  });

  it('returns autocomplete when query is empty', async () => {
    const { GET } = await import('../../app/api/search/route');
    const req = createRequest({ q: '', autocomplete: 'true' });
    const response = await GET(req as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('suggestions');
    expect(data.isAutocomplete).toBe(true);
  });

  it('respects entity type filter', async () => {
    const { GET } = await import('../../app/api/search/route');
    const req = createRequest({ q: 'test', type: 'charity' });
    const response = await GET(req as any);

    expect(response.status).toBe(200);
  });

  it('rejects limit over 100', async () => {
    const { GET } = await import('../../app/api/search/route');
    const req = createRequest({ q: 'test', limit: '101' });
    const response = await GET(req as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Limit cannot exceed');
  });

  it('rejects negative offset', async () => {
    const { GET } = await import('../../app/api/search/route');
    const req = createRequest({ q: 'test', offset: '-1' });
    const response = await GET(req as any);

    expect(response.status).toBe(400);
  });

  it('supports state filter', async () => {
    const { GET } = await import('../../app/api/search/route');
    const req = createRequest({ q: 'test', state: 'CA,NY' });
    const response = await GET(req as any);

    expect(response.status).toBe(200);
  });

  it('supports sorting parameters', async () => {
    const { GET } = await import('../../app/api/search/route');
    const req = createRequest({
      q: 'test',
      sortBy: 'riskScore',
      sortOrder: 'desc',
    });
    const response = await GET(req as any);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts advanced search with filters', async () => {
    const { POST } = await import('../../app/api/search/route');
    const body = {
      query: 'fraud',
      filters: {
        entityType: ['charity'],
        state: ['CA'],
        riskLevel: 'high',
      },
      limit: 10,
      offset: 0,
    };

    const req = {
      url: 'http://localhost:3001/api/search',
      method: 'POST',
      headers: new Headers({
        'x-forwarded-for': '127.0.0.2',
        'Content-Type': 'application/json',
      }),
      json: () => Promise.resolve(body),
    };

    const response = await POST(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('results');
  });

  it('rejects empty query', async () => {
    const { POST } = await import('../../app/api/search/route');
    const req = {
      url: 'http://localhost:3001/api/search',
      method: 'POST',
      headers: new Headers({
        'x-forwarded-for': '127.0.0.3',
        'Content-Type': 'application/json',
      }),
      json: () => Promise.resolve({ query: '' }),
    };

    const response = await POST(req as any);
    expect(response.status).toBe(400);
  });

  it('rejects limit over 100', async () => {
    const { POST } = await import('../../app/api/search/route');
    const req = {
      url: 'http://localhost:3001/api/search',
      method: 'POST',
      headers: new Headers({
        'x-forwarded-for': '127.0.0.4',
        'Content-Type': 'application/json',
      }),
      json: () => Promise.resolve({ query: 'test', limit: 200 }),
    };

    const response = await POST(req as any);
    expect(response.status).toBe(400);
  });

  it('handles invalid JSON', async () => {
    const { POST } = await import('../../app/api/search/route');
    const req = {
      url: 'http://localhost:3001/api/search',
      method: 'POST',
      headers: new Headers({
        'x-forwarded-for': '127.0.0.5',
      }),
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    };

    const response = await POST(req as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });
});