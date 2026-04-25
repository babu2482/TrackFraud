/**
 * Tests for /api/charities route handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createGetRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost:3001/api/charities');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return {
    url: url.toString(),
    method: 'GET',
    headers: new Headers({ 'x-forwarded-for': '127.0.0.10' }),
  };
};

describe('GET /api/charities', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns charity list with default params', async () => {
    const { GET } = await import('../../app/api/charities/route');
    const response = await GET(createGetRequest() as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('charities');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('page');
    expect(data).toHaveProperty('limit');
    expect(data).toHaveProperty('totalPages');
    expect(Array.isArray(data.charities)).toBe(true);
  });

  it('accepts search query', async () => {
    const { GET } = await import('../../app/api/charities/route');
    const response = await GET(createGetRequest({ q: 'foundation' }) as any);
    expect(response.status).toBe(200);
  });

  it('accepts state filter', async () => {
    const { GET } = await import('../../app/api/charities/route');
    const response = await GET(createGetRequest({ state: 'CA' }) as any);
    expect(response.status).toBe(200);
  });

  it('accepts NTEE code filter', async () => {
    const { GET } = await import('../../app/api/charities/route');
    const response = await GET(createGetRequest({ ntee: 'T20' }) as any);
    expect(response.status).toBe(200);
  });

  it('accepts pagination params', async () => {
    const { GET } = await import('../../app/api/charities/route');
    const response = await GET(createGetRequest({ page: '2', limit: '10' }) as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.page).toBe(2);
    expect(data.limit).toBe(10);
  });

  it('accepts sort params', async () => {
    const { GET } = await import('../../app/api/charities/route');
    const response = await GET(createGetRequest({ sortBy: 'riskScore', sortOrder: 'desc' }) as any);
    expect(response.status).toBe(200);
  });
});