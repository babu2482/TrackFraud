import { describe, it, expect } from 'vitest'

describe('API Route Structure', () => {
  it('should have expected API route directories', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const apiDir = path.join(process.cwd(), 'app', 'api')
    const routes = fs.readdirSync(apiDir)

    expect(routes).toContain('charities')
    expect(routes).toContain('political')
    expect(routes).toContain('corporate')
  })

  it('should have search API endpoint', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const searchRoute = path.join(process.cwd(), 'app', 'api', 'government', 'search', 'route.ts')
    expect(fs.existsSync(searchRoute)).toBe(true)
  })

  it('should have flag tracking endpoints', async () => {
    const fs = await import('fs')
    const path = await import('path')

    // Check various flagged routes exist
    const routes = [
      'app/api/charities/flagged/route.ts',
      'app/api/political/flagged/route.ts',
      'app/api/government/flagged/route.ts',
    ]

    for (const route of routes) {
      const fullPath = path.join(process.cwd(), route)
      // Flagged routes should exist or be planned
      expect(fs.existsSync(fullPath)).toBe(true)
    }
  })
})
