import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const check = searchParams.get('check') // Optional specific check

  const health: Record<string, any> = {
    status: 'unknown',
    timestamp: new Date().toISOString(),
    checks: {}
  }

  try {
    // Check database connectivity
    if (!check || check === 'db' || !check) {
      const start = Date.now()
      await prisma.$queryRaw`SELECT 1`
      health.checks.db = { status: 'healthy', latency_ms: Date.now() - start }
    }

    // Check Meilisearch connectivity (if configured)
    if (!check || check === 'search') {
      try {
        const meilisearchUrl = process.env.MEILISEARCH_URL
        if (meilisearchUrl) {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)

          const start = Date.now()
          const response = await fetch(`${meilisearchUrl}/health`, { signal: controller.signal })
          clearTimeout(timeoutId)

          if (response.ok) {
            health.checks.search = { status: 'healthy', latency_ms: Date.now() - start }
          } else {
            health.checks.search = { status: 'unhealthy', error: `HTTP ${response.status}` }
          }
        } else {
          health.checks.search = { status: 'skipped', reason: 'MEILISEARCH_URL not configured' }
        }
      } catch (error) {
        health.checks.search = { status: 'unhealthy', error: String(error) }
      }
    }

    // Overall status is unhealthy if any check failed
    const allHealthy = Object.values(health.checks).every(c => c.status === 'healthy')
    health.status = allHealthy ? 'healthy' : 'unhealthy'

    return NextResponse.json(health)
  } catch (error) {
    health.status = 'unhealthy'
    health.error = String(error)
    return NextResponse.json(health, { status: 503 })
  }
}
