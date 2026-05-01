# Getting Started

## Prerequisites

| Required | Version | Purpose |
|----------|---------|---------|
| Node.js | 18+ | Runtime for Next.js |
| Docker | Latest | PostgreSQL, Redis, Meilisearch |
| Docker Compose | Latest | Service orchestration |
| Git | Latest | Version control |

## Quick Start

```bash
# 1. Clone and install
git clone git@github.com:babu2482/TrackFraud.git
cd TrackFraud
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys (see API Keys section below)

# 3. Start services
docker compose up -d --wait

# 4. Verify services are healthy
docker compose ps

# 5. Generate Prisma client
npx prisma generate

# 6. Run database migrations
npx prisma migrate dev

# 7. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Keys

Several government APIs require keys. Copy `.env.example` to `.env` and fill in:

| Variable | Required | Source |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Default works for local Docker |
| `CONGRESS_API_KEY` | No | [Congress.gov API](https://api.congress.gov/) |
| `MEILISEARCH_API_KEY` | Yes | Default: `trackfraud-dev-master-key` |
| `SENTRY_DSN` | No | [Sentry](https://sentry.io/) for error tracking |

**Security:** `.env` is in `.gitignore` and should never be committed. Use `.env.example` as a template.

## Docker Services

| Service | Image | Port | Health Check |
|---------|-------|------|-------------|
| PostgreSQL | postgres:16-alpine | 5432 | `pg_isready` |
| Redis | redis:7-alpine | 6380 | `redis-cli ping` |
| Meilisearch | getmeili/meilisearch:v1.10 | 7700 | `curl /health` |

### Common Docker Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f

# Restart a service
docker compose restart postgres

# Execute shell in a container
docker exec -it trackfraud-postgres psql -U trackfraud trackfraud
```

## Project Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm test             # Run all tests
npm run lint         # Lint code
npx prisma studio    # Open database GUI
```

## Reindexing Search

After data changes, reindex Meilisearch:

```bash
npx tsx scripts/reindex-search.ts
```

Options:
- `--dry-run` - Preview what would be indexed
- `--entities charity,corporate` - Index specific entities only

## First Data Ingestion

To ingest data from government sources:

```bash
# Ingest all sources
npx tsx scripts/ingest-all.ts

# Ingest specific source
npx tsx scripts/ingest-charities.ts
npx tsx scripts/ingest-cfpb-complaints.ts
npx tsx scripts/ingest-ofac-sanctions.ts
# ... see scripts/ for all available ingestion scripts
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port already in use | Check `.env` for port conflicts, update `POSTGRES_PORT`, `REDIS_PORT`, or `MEILISEARCH_PORT` |
| Database connection failed | Verify Docker is running: `docker compose ps` |
| Prisma errors | Run `npx prisma generate` and `npx prisma migrate dev` |
| Search returns no results | Run `npx tsx scripts/reindex-search.ts` |
| Build fails | Run `npm install` to ensure dependencies are up to date |

For more troubleshooting, see the [runbooks](./runbooks/).

## Next Steps

- [Architecture](./ARCHITECTURE.md) - System design and tech stack
- [Data Models](./DATA_MODELS.md) - Database schema and entities
- [Data Sources](./DATA_SOURCES.md) - Government data sources we track
- [Runbooks](./runbooks/) - Operational procedures