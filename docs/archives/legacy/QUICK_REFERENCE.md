# TrackFraud Platform - Quick Reference Guide

**Last Updated:** 2026-04-15  
**System Status:** ✅ FULLY OPERATIONAL  
**Location:** `/Volumes/MacBackup/TrackFraudProject`

---

## 🚀 Current System State (Verified Healthy)

| Component | Port | Status | URL |
|-----------|------|--------|-----|
| PostgreSQL Database | 5434 | ✅ Running | `postgresql://localhost:5434/trackfraud` |
| Redis Cache/Queue | 6380 | ✅ Running | `redis://localhost:6380` |
| Meilisearch | 7700 | ✅ Running | `http://localhost:7700` |
| Backend API (FastAPI) | 8000 | ✅ Healthy | `http://localhost:8000/docs` |
| Celery Worker | N/A | ✅ Starting | Background task processor |
| Celery Flower | 5555 | ⚠️ Unhealthy check | `http://localhost:5555` (monitoring UI) |

---

## 📋 One-Command Operations

### Start Everything
```bash
cd /Volumes/MacBackup/TrackFraudProject
docker-compose up -d postgres redis meilisearch backend celery-worker celery-flower
```

### Stop Everything
```bash
docker-compose down
```

### View Logs (All Services)
```bash
docker-compose logs -f
```

### View Backend Logs Only
```bash
docker-compose logs -f backend
```

---

## 🔧 Common Tasks

### Check Database Connection
```bash
# Verify database is accessible
curl http://localhost:8000/health

# Expected response:
{ "status": "healthy", "database": "connected" }
```

### View Table Counts
```bash
docker exec trackfraud-postgres psql -U trackfraud -d trackfraud \
  -c "SELECT table_name, COUNT(*) as rows FROM (
    SELECT 'CharityProfile' as table_name UNION ALL
    SELECT 'ConsumerComplaintRecord' UNION ALL
    SELECT 'CorporateCompanyProfile' UNION ALL
    SELECT 'Bill'
  ) t 
  JOIN (
    SELECT 'charity_profile', COUNT(*) FROM \"CharityProfile\"
    UNION ALL SELECT 'consumer_complaint_record', COUNT(*) FROM \"ConsumerComplaintRecord\"
    -- Add more tables as needed
  ) c ON c.table_name = lower(t.table_name);"
```

### Restart a Service
```bash
# Restart backend only
docker-compose restart backend

# Restart all services
docker-compose restart
```

---

## 📊 Data Ingestion Commands

### Quick Start (Highest Priority)
```bash
# 1. IRS Charity Master List (~2M records, no API key needed)
npm run ingest:irs-eo-bmf

# 2. Congress.gov Bills & Votes (API key already configured)
npm run ingest:congress-api

# 3. ProPublica Politicians (needs PROPUBLICA_API_KEY in .env)
npm run ingest:propublica-politicians
```

### Full Pipeline (All Sources)
```bash
# Run all data sources with concurrency limit of 5 parallel jobs
npx tsx scripts/ingest-all.ts --all-sources --max-concurrent 5

# Background mode (runs in daemon, doesn't block terminal)
npx tsx scripts/ingest-all.ts --background --max-concurrent 3

# Dry run (validate without inserting data)
npx tsx scripts/ingest-all.ts --dry-run
```

### Individual Source Scripts
| Category | Command | Description |
|----------|---------|-------------|
| IRS EO BMF | `npm run ingest:irs-eo-bmf` | ~2M charity master records |
| IRS Auto-Revocation | `npm run ingest:irs-auto-revocation` | Revoked 501(c)(3) organizations |
| IRS Pub 78 | `npm run ingest:irs-pub78` | Tax-exempt organization list |
| CFPB Complaints | `npm run ingest:cfpb-consumer` | Consumer financial complaints |
| SEC EDGAR | `npm run ingest:sec-edgar` | Corporate enforcement actions |
| EPA Enforcement | `npm run ingest:epa-enforcement` | Environmental violations |
| FDA Warning Letters | `npm run ingest:fda-warning-letters` | Pharmaceutical violations |
| FTC Data Breaches | `npm run ingest:ftc-data-breach` | Data breach notifications |

---

## 🔑 API Key Configuration

### Current Status
```bash
# Check what's configured
grep -E "^(CONGRESS_API_KEY|PROPUBLICA_API_KEY)" .env
```

### What's Working ✅
- `CONGRESS_API_KEY` - Configured and tested (Congress.gov v3 API)

### What Needs Attention ⚠️
Add to `.env` file:

```bash
# Required for politician data
PROPUBLICA_API_KEY="your-key-here"  # Get from https://www.propublica.org/api

# Optional but recommended for charity data
PROPUBLICA_NONPROFITS_API_KEY="your-nonprofit-key-here"

# Extended functionality (optional)
SEC_EDGAR_API_KEY=""        # SEC enforcement actions
OPENSECRETS_API_KEY=""      # Campaign finance data
FINRA_API_KEY=""            # Broker/dealer violations
```

### Where to Get API Keys
- **ProPublica**: https://www.propublica.org/api (free, requires registration)
- **Congress.gov**: Already configured ✅
- **SEC EDGAR**: Free public access (no key required for most endpoints)
- **OpenSecrets**: https://www.opensecrets.org/open-data

---

## 🧪 Testing & Validation

### Run Unit Tests
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode (continuous testing)
npm run test:coverage      # With coverage report
```

### Test Backend API Endpoints
```bash
# Health check
curl http://localhost:8000/health

# View Swagger documentation
open http://localhost:8000/docs

# Test specific endpoint (example - list bills)
curl "http://localhost:8000/api/v1/bills?limit=5"
```

### Start Frontend for Testing
```bash
npm run dev                 # Next.js dev server on port 3001
open http://localhost:3001   # Open in browser (macOS)
```

---

## 🐛 Troubleshooting Quick Fixes

### Backend Not Responding
```bash
# Check if container is running
docker ps | grep trackfraud-backend

# Restart backend service
docker-compose restart backend

# View error logs
docker-compose logs --tail=50 backend
```

### Database Connection Errors
```bash
# Verify PostgreSQL is healthy
docker exec trackfraud-postgres pg_isready -U trackfraud

# Check connection pool status from inside container
docker exec trackfraud-backend python -c "from app.database import SessionLocal; print(SessionLocal().execute('SELECT 1').fetchone())"
```

### Celery Worker Crashes
```bash
# Restart worker
docker-compose restart celery-worker

# View worker logs
docker-compose logs --tail=100 celery-worker

# Check if Redis is accessible (Celery broker)
docker exec trackfraud-redis redis-cli ping  # Should return "PONG"
```

### Meilisearch Indexing Issues
```bash
# Check search health
curl http://localhost:7700/health

# View existing indexes
curl -H "Authorization: Bearer trackfraud-dev-master-key" \
     http://localhost:7700/indexes

# Rebuild index (if needed)
npx tsx scripts/reindex-all.ts  # If script exists
```

### Port Conflicts
```bash
# Check what's using a port
lsof -i :8000   # Backend port
lsof -i :3001   # Frontend port
lsof -i :5434   # Database port

# Kill conflicting process (use with caution!)
kill -9 <PID>
```

---

## 📁 Important File Locations

| Purpose | Path |
|---------|------|
| Environment Config | `.env` (not in git) |
| Example Env Template | `.env.example` |
| Docker Services | `docker-compose.yml` |
| Database Schema | `prisma/schema.prisma` |
| Backend Code | `backend/app/` |
| Frontend Pages | `app/` (Next.js app directory) |
| Ingestion Scripts | `scripts/ingest-*.ts` |
| Project Status Log | `PROJECT_STATUS.md` |
| System Verification Report | `docs/reports/system-verification-report.md` |

---

## 📊 Database Quick Queries

### List All Tables
```bash
docker exec trackfraud-postgres psql -U trackfraud -d trackfraud \
  -c "\dt"
```

### Count Rows in Specific Table
```bash
docker exec trackfraud-postgres psql -U trackfraud -d trackfraud \
  -c "SELECT COUNT(*) FROM \"CharityProfile\";"
```

### View Recent Ingestion Runs
```bash
docker exec trackfraud-postgres psql -U trackfraud -d trackfraud \
  -c "SELECT id, source_system_id, started_at, status, rows_processed 
      FROM \"IngestionRun\" 
      ORDER BY started_at DESC LIMIT 10;"
```

### Check Data Freshness
```bash
docker exec trackfraud-postgres psql -U trackfraud -d trackfraud \
  -c "SELECT table_name, MAX(created_at) as latest_record 
      FROM (
        SELECT 'charity_profile' as table_name, created_at FROM \"CharityProfile\"
        UNION ALL
        SELECT 'consumer_complaint_record', created_at FROM \"ConsumerComplaintRecord\"
        -- Add more tables
      ) all_data
      GROUP BY table_name;"
```

---

## 🔄 Git Operations

### Clean Up File Permission Changes (Post-Migration)
```bash
# Reset file permissions to repository defaults (safe operation)
git checkout -- .

# Verify clean state - should show only PROJECT_STATUS.md as modified
git status
```

### Commit Current State
```bash
git add PROJECT_STATUS.md docs/
git commit -m "Verify system operational after SSD migration; all services healthy"
git push origin main
```

### View Recent Commits
```bash
git log --oneline -10
```

---

## 📞 Support & Resources

### Documentation
- **System Verification Report**: `docs/reports/system-verification-report.md` (comprehensive health check)
- **Architecture Guide**: `docs/architecture/ARCHITECTURE.md`
- **Data Sources Reference**: `docs/DATA_SOURCES.md`
- **API Keys Setup**: `docs/api/api-keys-setup/configuration.md`

### External Resources
- **Congress.gov API Docs**: https://api.congress.gov/
- **ProPublica API Docs**: https://www.propublica.org/api/
- **Meilisearch Docs**: https://docs.meilisearch.com/
- **FastAPI Docs**: https://fastapi.tiangolo.com/

---

## ✅ Pre-Development Checklist

Before starting new development work, verify:

- [ ] All Docker containers running (`docker ps | grep trackfraud` shows 6 containers)
- [ ] Backend health check passing (`curl http://localhost:8000/health`)
- [ ] Database has data (at least some tables with row counts > 0)
- [ ] Required API keys configured in `.env`
- [ ] Frontend compiles without errors (`npm run dev` starts successfully)
- [ ] Git working tree clean or changes committed

---

## 🎯 Next Steps After This Guide

1. **Configure missing API keys** (ProPublica, etc.)
2. **Run initial data ingestion** for priority sources
3. **Verify data landed in database** with row count queries
4. **Test search functionality** via Meilisearch and frontend UI
5. **Set up continuous background workers** for fresh data

---

**Questions?** Check `PROJECT_STATUS.md` for current blockers, plans, and recent activity.  
**System Status Report**: See `docs/reports/system-verification-report.md` for detailed health analysis.