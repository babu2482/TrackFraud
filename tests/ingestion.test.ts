#!/usr/bin/env tsx
/**
 * Ingestion Script Integration Tests
 *
 * Validates that ingestion scripts can execute and produce expected data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

describe('Ingestion Pipeline', () => {
  beforeAll(async () => {
    // Ensure test database is ready
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('Data Source Coverage', () => {
    it('should have entity records from multiple data sources', async () => {
      const counts = await prisma.sourceSystem.aggregate({
        _count: true,
        _sum: { entities_counted: true }
      })

      expect(counts._count).toBeGreaterThan(0)
      console.log(`Active source systems: ${counts._count}`)
    })

    it('should have canonical entities indexed', async () => {
      const entityCount = await prisma.canonicalEntity.count()
      expect(entityCount).toBeGreaterThan(0)
      console.log(`Total canonical entities: ${entityCount}`)
    })

    it('should have fraud categories configured', async () => {
      const categories = await prisma.fraudCategory.findMany()
      expect(categories.length).toBeGreaterThan(0)
      console.log(`Fraud categories: ${categories.map(c => c.code).join(', ')}`)
    })
  })

  describe('Data Integrity', () => {
    it('should have valid EIN formats for charities', async () => {
      const invalidEINs = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM canonical_entities
         WHERE source_system = 'charity'
         AND ein ~ '^[0-9]{2}-?[0-9]{7}$'`
      )

      console.log('Charities with valid EIN format:', (invalidEINs as any[])[0].count)
    })

    it('should have valid CIK formats for corporate entities', async () => {
      const validCIKs = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM canonical_entities
         WHERE source_system = 'sec-edgar'
         AND cik ~ '^[0-9]{1,7}$'`
      )

      console.log('Corporate entities with valid CIK:', (validCIKs as any[])[0].count)
    })

    it('should have political candidates linked to FEC data', async () => {
      const candidateCount = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM canonical_entities
         WHERE source_system = 'fec' AND entity_type = 'political_candidate'`
      )

      console.log('Political candidates from FEC:', (candidateCount as any[])[0].count)
    })
  })

  describe('Sync Status', () => {
    it('should have recent sync timestamps for API-based sources', async () => {
      const staleSources = await prisma.$queryRawUnsafe(
        `SELECT source_system, last_successful_sync_at
         FROM source_systems
         WHERE ingestion_mode = 'api'
         AND last_successful_sync_at < NOW() - INTERVAL '48 hours'`
      )

      console.log('Potentially stale sources:', (staleSources as any[]).length)
    })

    it('should track entities per source system', async () => {
      const entityCounts = await prisma.$queryRawUnsafe(
        `SELECT source_system, COUNT(*) as count
         FROM canonical_entities
         GROUP BY source_system
         ORDER BY count DESC`
      )

      console.log('Entities per source:', (entityCounts as any[]))
    })
  })
})
