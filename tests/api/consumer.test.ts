/**
 * Tests for /api/consumer/complaints route handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('GET /api/consumer/complaints', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns complaint data', async () => {
    const { GET } = await import('../../app/api/consumer/complaints/route');
    const response = await GET({
      url: 'http://localhost:3001/api/consumer/complaints?limit=5',
      method: 'GET',
      headers: new Headers({ 'x-forwarded-for': '127.0.0.60' }),
    } as any);
    expect(response.status).toBe(200);
  });
});