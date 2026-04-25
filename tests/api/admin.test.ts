/**
 * Tests for /api/admin route handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createGetRequest = (base: string) => ({
  url: `http://localhost:3001/api/admin/${base}`,
  method: 'GET',
  headers: new Headers({ 'x-forwarded-for': '127.0.0.70' }),
});

describe('GET /api/admin/health', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns health status', async () => {
    const { GET } = await import('../../app/api/admin/health/route');
    const response = await GET(createGetRequest('health') as any);
    expect(response.status).toBe(200);
  });
});

describe('GET /api/admin/jobs', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns jobs list', async () => {
    const { GET } = await import('../../app/api/admin/jobs/route');
    const response = await GET(createGetRequest('jobs') as any);
    expect(response.status).toBe(200);
  });
});

describe('GET /api/admin/ingestion-history', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns ingestion history', async () => {
    const { GET } = await import('../../app/api/admin/ingestion-history/route');
    const response = await GET(createGetRequest('ingestion-history') as any);
    expect(response.status).toBe(200);
  });
});

describe('GET /api/admin/fraud-metrics', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns fraud metrics', async () => {
    const { GET } = await import('../../app/api/admin/fraud-metrics/route');
    const response = await GET(createGetRequest('fraud-metrics') as any);
    expect(response.status).toBe(200);
  });
});