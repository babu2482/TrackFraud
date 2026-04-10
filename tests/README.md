# TrackFraud Tests

This directory contains the test suite for the TrackFraud platform.

## Test Structure

- `db.test.ts` - Database connection and schema validation tests
- `api-routes.test.ts` - API route structure verification tests
- `backend/tests/` - Python backend tests (FastAPI)

## Running Tests

### Prerequisites

1. Set up test environment variables:
   ```bash
   cp .env.test .env.local
   # Edit .env.local with your test database credentials
   ```

2. Start test database:
   ```bash
   npm run db:start
   ```

3. Run migrations for test database:
   ```bash
   DATABASE_URL="postgresql://trackfraud:trackfraud_test_password@localhost:5432/trackfraud_test" npx prisma migrate deploy
   ```

### Test Commands

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Python Backend Tests

```bash
cd backend
pytest tests/ -v
```

## CI/CD

Tests are automatically run on every push and pull request via GitHub Actions:
- Lint check
- TypeScript type checking
- Python backend tests (with PostgreSQL service)
- Ingestion script validation
- Docker build verification

## Adding New Tests

1. Create a new test file in `tests/` following the pattern `<component>.test.ts`
2. Use Vitest API for test definitions:
   ```typescript
   import { describe, it, expect, beforeAll, afterAll } from 'vitest'

   describe('Feature Name', () => {
     it('should do something', async () => {
       // Test implementation
       expect(result).toBe(expected)
     })
   })
   ```

3. For database tests, use Prisma client:
   ```typescript
   import { PrismaClient } from '@prisma/client'

   const prisma = new PrismaClient()

   beforeAll(async () => {
     // Setup
   })

   afterAll(async () => {
     await prisma.$disconnect()
   })
   ```

## Test Data

For integration tests that require sample data:
- Use `prisma/seed.ts` as a reference for data generation
- Consider using factories for complex test fixtures
- Clean up test data in afterAll hooks or use transaction rollback
