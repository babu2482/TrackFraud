# Getting Started with TrackFraud

Quick start guide for setting up and running the TrackFraud platform locally.

## Prerequisites

- **Node.js 18+** and npm
- **Python 3.10+** (for local backend development, optional if using Docker)
- **Docker** and Docker Compose
- **PostgreSQL** knowledge (optional)

## Quick Start

```bash
# Navigate to project root
cd TrackFraudProject

# Install dependencies
npm install

# Start all services (database, redis, search, backend)
docker compose up -d

# Run database migrations
npm run db:migrate

# Seed initial data
npm run db:seed

# Start development server
npm run dev
```

The application will be available at `http://localhost:3001`
The Python backend API will be available at `http://localhost:8000`
Celery Flower monitoring at `http://localhost:5555`

## Database Setup

```bash
# Start PostgreSQL only
npm run db:start

# Run migrations
npm run db:migrate

# Seed initial data (fraud categories, sample entities)
npm run db:seed

# Reset database (WARNING: destroys all data)
npm run db:reset

# Full setup from scratch
npm run db:setup
```

## Backend Services Setup

```bash
# Start all backend services (PostgreSQL, Redis, Meilisearch, Python API)
docker compose up -d

# View logs for all services
docker compose logs -f

# Start just the Python backend and Celery workers
npm run backend:start

# Monitor Celery tasks with Flower UI (http://localhost:5555)
npm run celery:start
```

## Local Development (without Docker)

For local development of the Python backend without Docker:

```bash
# Install Python dependencies
cd backend
pip install -r requirements.txt

# Start PostgreSQL via Docker
docker compose up -d postgres redis

# Run database migrations
alembic upgrade head

# Start FastAPI dev server
uvicorn app.main:app --reload --port 8000

# In another terminal, start Celery worker
celery -A app.celery_app worker --loglevel=info
```

## Search Setup

```bash
# Start Meilisearch
npm run search:start

# Stop Meilisearch
npm run search:stop
```

## Environment Configuration

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Then edit `.env` with your configuration:

```bash
# Database
DATABASE_URL="postgresql://trackfraud:trackfraud_dev_password@localhost:5432/trackfraud"

# Meilisearch
MEILISEARCH_URL="http://localhost:7700"
MEILISEARCH_API_KEY="trackfraud-dev-master-key"

# Redis (for Celery)
REDIS_URL="redis://localhost:6379/0"
CELERY_BROKER_URL="redis://localhost:6379/1"

# Backend API
BACKEND_URL="http://localhost:8000"

# API Keys (optional, for enhanced data)
CONGRESS_API_KEY=""
PROPUBLICA_API_KEY=""
FEDERAL_REGISTER_API_KEY=""

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3001"
```

See `.env.example` for all available configuration options.

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system design
- Explore [DATA_SOURCES.md](./DATA_SOURCES.md) to learn about data ingestion
- Check [API_KEYS_SETUP.md](./api/api-keys-setup.md) for API configuration details
- Review [RUNBOOKS/database-maintenance.md](./runbooks/database-maintenance.md) for operational procedures

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker compose ps postgres

# View database logs
docker compose logs postgres

# Reset database if corrupted
npm run db:reset
```

### Search Not Working

```bash
# Check Meilisearch is running
docker compose ps meilisearch

# View search logs
docker compose logs meilisearch

# Reindex data after schema changes
npm run search:reindex
```

### Port Conflicts

If port 3001, 8000, or 5432 is already in use:

```bash
# Find process using port
lsof -i :3001

# Modify ports in docker-compose.yml and .env files as needed
```
