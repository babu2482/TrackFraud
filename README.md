# TrackFraud

Unified financial fraud tracking and government transparency platform.

Ingests data from 50+ government sources (IRS, SEC, FEC, CFPB, CMS, OFAC, EPA, FDA, HHS, SAM.gov, Congress.gov, and more), correlates and analyzes it across categories to detect financial fraud patterns, scores entities for fraud risk, and provides a unified search/browse UI.

**~7.9M records** · Next.js 15 + React 19 · PostgreSQL 16 · Meilisearch · Redis

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Start services (PostgreSQL, Redis, Meilisearch)
docker compose up -d --wait

# Set up database
npm run db:migrate
npm run db:seed

# Start development server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

## Scripts

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run start            # Start production server

# Database
npm run db:start         # Start PostgreSQL
npm run db:migrate       # Run migrations
npm run db:seed          # Seed data

# Tests
npm test                 # Unit tests (353)
npm run test:e2e         # E2E tests (58)

# Pipeline
npm run pipeline:run     # Run scoring pipeline
npm run pipeline:status  # Check pipeline status
npm run pipeline:retry   # Retry failed runs

# Ingestion (examples)
npm run ingest:irs-eo-bmf
npm run ingest:fec-summaries
npm run ingest:cfpb-consumer
# ... see package.json for all sources
```

## Documentation

| Topic | Document |
|-------|----------|
| Setup & install | [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) |
| System architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Data models | [docs/DATA_MODELS.md](docs/DATA_MODELS.md) |
| Fraud scoring | [docs/FRAUD_SCORING.md](docs/FRAUD_SCORING.md) |
| Data sources | [docs/CurrentFraudSourcesAndScoring.md](docs/CurrentFraudSourcesAndScoring.md) |
| Operations | [docs/runbooks/](docs/runbooks/) |

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Frontend:** React 19 + Tailwind CSS
- **Database:** PostgreSQL 16 + Prisma ORM
- **Search:** Meilisearch
- **Cache:** Redis 7
- **Testing:** Vitest + Playwright
- **Monitoring:** Sentry

## License

Private
