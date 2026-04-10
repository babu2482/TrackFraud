#!/usr/bin/env tsx
/**
 * Health Check Script
 *
 * Simple script to check the health of all TrackFraud services.
 * Can be run via cron for monitoring or manually for troubleshooting.
 */

import fetch from 'node-fetch'

// Configuration with environment variable overrides
const config = {
  frontend: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001',
  meilisearch: process.env.MEILISEARCH_URL || 'http://localhost:7700',
  timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
}

interface HealthResult {
  name: string
  url: string
  status: 'healthy' | 'unhealthy' | 'error'
  latency_ms?: number
  error?: string
}

async function checkEndpoint(name: string, url: string): Promise<HealthResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeout)

  try {
    const start = Date.now()
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    })
    clearTimeout(timeoutId)

    const latency = Date.now() - start

    if (response.ok) {
      return { name, url, status: 'healthy', latency_ms: latency }
    } else {
      return {
        name,
        url,
        status: 'unhealthy',
        error: `HTTP ${response.status}`
      }
    }
  } catch (error) {
    clearTimeout(timeoutId)
    return {
      name,
      url,
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function main() {
  console.log(`\n${'='.repeat(50)}`)
  console.log('TrackFraud Health Check')
  console.log(`${'='.repeat(50)}\n`)

  const endpoints: Array<{ name: string; url: string }> = [
    { name: 'Frontend', url: config.frontend },
    { name: 'API Health', url: `${config.frontend}/api/health` },
    { name: 'Meilisearch', url: `${config.meilisearch}/health` },
  ]

  const results: HealthResult[] = []
  let allHealthy = true

  for (const endpoint of endpoints) {
    console.log(`Checking ${endpoint.name}...`)
    const result = await checkEndpoint(endpoint.name, endpoint.url)
    results.push(result)

    if (result.status === 'healthy') {
      console.log(`  ✓ ${result.name}: OK (${result.latency_ms}ms)\n`)
    } else {
      console.log(`  ✗ ${result.name}: ${result.error}\n`)
      allHealthy = false
    }
  }

  // Summary
  console.log(`${'='.repeat(50)}`)
  const healthyCount = results.filter(r => r.status === 'healthy').length
  console.log(`Summary: ${healthyCount}/${results.length} services healthy`)

  if (allHealthy) {
    console.log('Status: ALL SERVICES OPERATIONAL\n')
    process.exit(0)
  } else {
    console.log('Status: SOME SERVICES UNHEALTHY\n')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(2)
})
