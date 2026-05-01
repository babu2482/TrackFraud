# TrackFraud Documentation

Unified fraud tracking and government transparency platform.

## Quick Navigation

| If you... | Start here |
|-----------|-----------|
| Are new to the project | [GETTING_STARTED.md](./GETTING_STARTED.md) |
| Want to understand the architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Need to understand the data models | [DATA_MODELS.md](./DATA_MODELS.md) |
| Work on fraud scoring | [FRAUD_SCORING.md](./FRAUD_SCORING.md) |
| Need to know what data we track | [CurrentFraudSourcesAndScoring.md](./CurrentFraudSourcesAndScoring.md) |
| Want the raw source inventory | [DATA_SOURCES.md](./DATA_SOURCES.md) |
| Need to troubleshoot something | [runbooks/](./runbooks/) |

## Project Summary

TrackFraud ingests data from 50+ government sources (IRS, SEC, FEC, CFPB, CMS, OFAC, EPA, FDA, HHS, SAM.gov, Congress.gov, and more), correlates and analyzes it across categories to detect financial fraud patterns, scores entities for fraud risk, and provides a unified search/browse UI.

- **~7.9M records** across charities, corporate, government, political, healthcare, and consumer categories
- **Next.js 15 + React 19** single-backend architecture
- **PostgreSQL 16** with Prisma ORM
- **Meilisearch** for full-text search
- **Redis** for caching

## Directory Structure

```
├── app/              # Next.js App Router (pages + API routes)
├── components/       # React components
├── lib/              # Shared utilities (db, search, scoring, validation)
├── prisma/           # Database schema and migrations
├── scripts/          # Data ingestion scripts (30+)
│   └── archive/      # Deprecated scripts (kept for reference)
├── tests/            # Unit, integration, and E2E tests
├── docs/             # This directory
│   └── runbooks/     # Operational procedures
└── archives/         # Archived data, old migrations, historical docs
```

## Documentation Structure

```
docs/
├── README.md                        # This file - navigation hub
├── GETTING_STARTED.md               # Setup, install, first run
├── ARCHITECTURE.md                  # System architecture, tech stack, decisions
├── DATA_MODELS.md                   # Prisma schema, entity relationships
├── FRAUD_SCORING.md                 # Fraud scoring algorithm and signals
├── DATA_SOURCES.md                  # Government data sources inventory
├── CurrentFraudSourcesAndScoring.md # Current state: what's working, what's missing
├── runbooks/                        # Operational procedures
│   ├── README.md
│   ├── database-maintenance.md
│   ├── ingestion-troubleshooting.md
│   ├── log-management.md
│   ├── monitoring-alerts.md
│   └── search-index-management.md
└── query_*.sql                      # Useful diagnostic SQL queries
```

## Historical Documents

Moved to `archives/production-plan/` to keep docs lean:
- `MASTER_PLAN.md` — Original production hardening plan
- `PROGRESS.md` — Phase-by-phase execution tracker
- `HANDOFF.md` — Main handoff document
- `PIPELINE_INFRASTRUCTURE_HANDOFF.md` — Pipeline infrastructure details
- `UI_OVERHAUL_HANDOFF.md` — UI/UX overhaul details
- `VERIFICATION_HANDOFF.md` — E2E verification details

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
