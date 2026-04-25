/**
 * API Route Handler Tests
 *
 * Verifies that API route handlers export proper GET/POST functions
 * and return valid HTTP responses.
 */

import { describe, it, expect } from 'vitest';

const mockRequest = (path: string) => ({
  url: `http://localhost:3001${path}`,
  method: 'GET',
  headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
});

describe('API Route Handlers Export GET', () => {
  it('charities route exports GET', async () => {
    const mod = await import('../app/api/charities/route');
    expect(typeof mod.GET).toBe('function');
  });

  it('search route exports GET and POST', async () => {
    const mod = await import('../app/api/search/route');
    expect(typeof mod.GET).toBe('function');
    expect(typeof mod.POST).toBe('function');
  });

  it('health route exports GET', async () => {
    const mod = await import('../app/api/health/route');
    expect(typeof mod.GET).toBe('function');
  });

  it('categories route exports GET', async () => {
    const mod = await import('../app/api/categories/route');
    expect(typeof mod.GET).toBe('function');
  });

  it('health endpoint returns 200', async () => {
    const { GET } = await import('../app/api/health/route');
    const response = await GET(mockRequest('/api/health') as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('status');
  });
});

describe('Flagged Routes Exist and Export GET', () => {
  it('charities/flagged exports GET', async () => {
    const mod = await import('../app/api/charities/flagged/route');
    expect(typeof mod.GET).toBe('function');
  });

  it('political/flagged exports GET', async () => {
    const mod = await import('../app/api/political/flagged/route');
    expect(typeof mod.GET).toBe('function');
  });

  it('government/flagged exports GET', async () => {
    const mod = await import('../app/api/government/flagged/route');
    expect(typeof mod.GET).toBe('function');
  });

  it('corporate/flagged exports GET', async () => {
    const mod = await import('../app/api/corporate/flagged/route');
    expect(typeof mod.GET).toBe('function');
  });
});