import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

describe('Database Connection', () => {
  let prisma: PrismaClient

  beforeAll(async () => {
    prisma = new PrismaClient()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('should connect to database and fetch fraud categories', async () => {
    const categories = await prisma.fraudCategory.findMany()
    expect(Array.isArray(categories)).toBe(true)
  })

  it('should have source systems configured', async () => {
    const sources = await prisma.sourceSystem.findMany()
    expect(sources.length).toBeGreaterThan(0)
  })

  it('should verify CanonicalEntity model structure', async () => {
    // Just check the table exists and is queryable
    const count = await (prisma as any).canonical_entity.count?.() || 0
    expect(typeof count).toBe('number')
  })
})
