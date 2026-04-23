/**
 * Unit tests for lib/db.ts
 * Tests the Prisma client singleton pattern.
 */
import { describe, it, expect } from 'vitest';

describe('Prisma Client Singleton', () => {
  it('exports a prisma instance', async () => {
    const { prisma } = await import('../../lib/db');
    expect(prisma).toBeDefined();
  });

  it('returns the same instance on repeated imports (singleton)', async () => {
    const { prisma: prisma1 } = await import('../../lib/db');
    const { prisma: prisma2 } = await import('../../lib/db');
    expect(prisma1).toBe(prisma2);
  });
});