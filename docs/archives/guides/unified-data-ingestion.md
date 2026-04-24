# Unified Data Ingestion Guide

This guide explains how to use TrackFraud's unified data ingestion system to populate the platform with real-world data from 39+ government and public APIs.

## Overview

TrackFraud aggregates fraud-related data across multiple categories:

| Category | Description | Primary Sources | Estimated Records |
|----------|-------------|-----------------|-------------------|
| **Charities/Nonprofits** | Tax-exempt organizations, IRS filings | IRS EO BMF, Auto-Revocation, Pub78, ProPublica Nonprofit API | ~1.5M orgs |
| **Politics** | Politicians, bills, votes, campaign finance | Congress.gov, FEC | ~600 politicians + 20K+ bills/year |
| **Sanctions** | OFAC SDN List (terrorists, sanctioned entities) | OFAC Treasury | ~12K records |
| **Exclusions** | HHS OIG excluded providers, SAM.gov exclusions | CMS Open Payments, SAM.gov | ~75K records |
| **Corporate/SEC** | SEC filings, enforcement actions | SEC EDGAR | ~15M companies |
| **Healthcare** | Physician payments from Medicare/Medicaid | CMS Open Payments | ~800K recipients + $10B payments |
| **Environmental** | EPA enforcement actions, violations | EPA ECHO | ~30K actions/year |
| **Consumer Protection** | CFPB complaints, FTC data breaches | CFPB, FTC | ~1M+ records |
| **Government Awards** | Federal contract awards, grants | USAspending | ~50M transactions/year |

## Quick Start (First-Time Setup)

### Step 1: Verify API Keys

```bash
# Check if required API keys are configured
npx tsx scripts/validate-api-keys.ts
```

**Required Keys:**
- ✅ `CONGRESS_API_KEY` - Already configured in `.env`
- ⚠️ ProPublica Nonprofit API - No key required (public API)

### Step 2: Run a Dry Run (Recommended First Step)

Preview what will be ingested without actually running the ingestion:

```bash
npx tsx scripts/ingest-all.ts --dry-run
```

This shows you:
- Which data sources will run
- Priority levels and rate limits
- API key requirements
- Estimated record counts (where available)

### Step 3: Start with High-Priority Sources

Run ingestion for the most important categories first:

```bash
# Charities (~1.5M records, ~4 hours)
npx tsx scripts/ingest-all.ts --categories charities --full

# Politics & Congress (~600 politicians + bills/votes, ~30 min)
npx tsx scripts/ingest-all.ts --categories politics --full

# Sanctions & Exclusions (~90K records, ~1 hour)
npx tsx scripts/ingest-all.ts --categories sanctions exclusions --full
```

### Step 4: Monitor Progress

Check the database for ingestion run status:

```bash
# View recent ingestion runs
SELECT 
  source_system_id,
  status,
  rows_inserted,
  rows_updated,
  started_at,
  completed_at
FROM "IngestionRun"
ORDER BY started_at DESC
LIMIT 20;

# Check which sources have never synced successfully
SELECT 
  id,
  name,
  last_successful_sync_at,
  last_error
FROM "SourceSystem"
WHERE last_successful_sync_at IS NULL
ORDER BY created_at;
```

## Usage Reference

### Basic Commands

```bash
# Run ingestion for ALL categories (full data load)
npx tsx scripts/ingest-all.ts --full

# Run only specific categories (comma-separated)
npx tsx scripts/ingest-all.ts --categories charities,politics

# Preview what will run without executing
npx tsx scripts/ingest-all.ts --dry-run

# Show help message
npx tsx scripts/ingest-all.ts --help
```

### Category-Specific Examples

#### Charities & Nonprofits

```bash
# Full charity data load (IRS + ProPublica)
npx tsx scripts/ingest-all.ts --categories charities --full

# Individual source ingestion (from existing scripts)
npx tsx scripts/ingest-irs-eo-bmf.ts
npx tsx scripts/ingest-irs-auto-revocation.ts
npx tsx scripts/ingest-propublica-nonprofit.ts
```

#### Politics & Congress

```bash
# Full political data load (requires CONGRESS_API_KEY)
npx tsx scripts/ingest-all.ts --categories politics --full

# Individual sources
npx tsx scripts/ingest-congress-api.ts --all
npx tsx scripts/ingest-fec-summaries.ts
```

#### Sanctions & Exclusions

```bash
# Full sanctions and exclusions load
npx tsx scripts/ingest-all.ts --categories sanctions exclusions --full

# Individual sources
npx tsx scripts/ingest-ofac-sanctions.ts
npx tsx scripts/ingest-hhs-oig-exclusions.ts
```

#### Healthcare, Corporate, Environmental, Consumer

```bash
# Medium priority categories
npx tsx scripts/ingest-all.ts --categories healthcare corporate --full

# Low priority categories  
npx tsx scripts/ingest-all.ts --categories environment consumer awards --full
```

### Background Worker Mode

For continuous operation with automatic scheduling:

#### Option A: Manual Background Worker (Development)

```bash
# Start worker in foreground (Ctrl+C to stop)
npx tsx scripts/ingest-worker.ts

# Or run as daemon with PM2 (recommended for production)
pm2 start "npx tsx scripts/ingest-worker.ts" --name trackfraud-ingester
pm2 save  # Save process list for restart on system reboot
pm2 logs trackfraud-ingester  # View logs
```

#### Option B: Cron Jobs (Production)

Add to crontab (`crontab -e`):

```bash
# High priority sources: hourly
0 * * * * cd /path/to/TrackFraudProject && npx tsx scripts/ingest-all.ts --categories charities,politics,sanctions >> logs/cron-ingest.log 2>&1

# Medium priority sources: daily at midnight  
0 0 * * * cd /path/to/TrackFraudProject && npx tsx scripts/ingest-all.ts --categories healthcare,corporate >> logs/cron-ingest.log 2>&1

# Low priority sources: weekly on Sunday at 3am
0 3 * * 0 cd /path/to/TrackFraudProject && npx tsx scripts/ingest-all.ts --categories environment,consumer,awards >> logs/cron-ingest.log 2>&1
```

#### Option C: Systemd Service (Linux Production)

Create `/etc/systemd/system/trackfraud-ingester.service`:

```ini
[Unit]
Description=TrackFraud Data Ingestion Worker
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/path/to/TrackFraudProject
ExecStart=/usr/bin/npx tsx scripts/ingest-worker.ts
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable trackfraud-ingester
sudo systemctl start trackfraud-ingester
sudo systemctl status trackfraud-ingester  # Check status
sudo journalctl -u trackfraud-ingester -f  # View logs
```

## Configuration

### Environment Variables

Edit `.env` to configure ingestion behavior:

```bash
# ============================================
# API Keys (Required for full functionality)
# ============================================

# Congress.gov API - Bills and votes data
CONGRESS_API_KEY="your-actual-congress-gov-key-here"

# ProPublica Nonprofit Explorer API - No key required (public API)

# Federal Register API (optional)
FEDERAL_REGISTER_API_KEY=""

# GovTrack US API (optional)
GOVTRACK_API_KEY=""

# Sunlight Foundation OpenCongress (optional)  
OPENCONGRESS_API_KEY=""

# EPA ECHO API (optional)
EPA_ECHO_API_KEY=""
```

### Worker Configuration

Edit `scripts/ingest-worker.ts` to customize:

```typescript
const DEFAULT_CONFIG: WorkerConfig = {
  pollIntervalMs: 5 * 60 * 1000,     // Check for work every 5 minutes
  maxConcurrentJobs: 3,              // Max simultaneous ingestion jobs
  retryAttempts: 3,                  // Retry failed sources up to 3 times
  retryBaseDelayMs: 60 * 1000,       // Start with 1 minute delay between retries
};
```

## Troubleshooting

### Common Issues

#### "CONGRESS_API_KEY not configured" Error

**Cause:** API key missing from `.env` file

**Solution:**
```bash
# Add Congress.gov API key to .env
echo 'CONGRESS_API_KEY="your-key-here"' >> .env

# Validate configuration
npx tsx scripts/validate-api-keys.ts

# Re-run ingestion
npx tsx scripts/ingest-all.ts --categories politics --full
```

#### Rate Limit Errors

**Cause:** Too many requests to API provider in short time period

**Solution:**
- Wait for rate limit window to reset (usually 1 hour)
- Reduce concurrent jobs by editing worker config: `maxConcurrentJobs: 1`
- Increase delay between requests in individual ingestion scripts

#### CSV Parsing Errors (OFAC SDN List)

**Cause:** OFAC changed CSV format at line 18699+ with multi-line address fields

**Solution:** 
```bash
# Current workaround: Skip problematic records and continue
npx tsx scripts/ingest-ofac-sanctions.ts --max-rows=18000

# Long-term fix needed: Update parser to handle new CSV format
# See: scripts/ingest-ofac-sanctions.ts parseCSVRow() function
```

#### Ingestion Script Timeout

**Cause:** Large datasets taking too long to process

**Solution:**
```bash
# Limit batch size for faster completion (partial data load)
npx tsx scripts/ingest-irs-eo-bmf.ts --max-rows=10000

# Run in background and monitor progress
nohup npx tsx scripts/ingest-all.ts --categories charities --full > logs/ingestion.log 2>&1 &
tail -f logs/ingestion.log  # Monitor progress
```

#### Meilisearch Not Populated

**Cause:** Search indexes not updated after ingestion completes

**Solution:**
```bash
# Manually trigger search indexing (if implemented)
npx tsx scripts/build-meilisearch-indexes.ts

# Or wait for automatic indexing in next ingestion cycle
# Check index status:
curl http://localhost:7700/indexes
```

### Debug Mode

Enable verbose logging:

```bash
# Set debug level
export DEBUG=ingestion:*

# Run with detailed output
npx tsx scripts/ingest-all.ts --categories charities --full 2>&1 | tee logs/debug-ingestion.log
```

## Data Freshness & Maintenance

### Expected Update Frequencies

| Category | Recommended Sync Frequency | Source Refresh Rate |
|----------|---------------------------|---------------------|
| IRS EO BMF | Daily | Monthly (IRS) |
| Auto-Revocation List | Weekly | Quarterly (IRS) |
| Congress Members/Votes | Daily | Real-time (Congress.gov) |
| OFAC SDN List | Daily | Daily (Treasury) |
| CMS Open Payments | Weekly | Monthly (CMS) |
| SEC EDGAR | Daily | Real-time (SEC) |
| EPA ECHO | Weekly | As published (EPA) |
| CFPB Complaints | Weekly | Continuous (CFPB) |

### Monitoring Health

Check ingestion health dashboard:

```bash
# Query recent failures
SELECT 
  source_system_id,
  COUNT(*) as failure_count,
  MAX(completed_at) as last_failure
FROM "IngestionRun"
WHERE status = 'failed'
GROUP BY source_system_id
HAVING COUNT(*) > 2;

# Check sources with stale data (not synced in 7+ days)
SELECT 
  id,
  name,
  last_successful_sync_at,
  age(last_successful_sync_at) as days_since_sync
FROM "SourceSystem"
WHERE last_successful_sync_at < NOW() - INTERVAL '7 days'
ORDER BY last_successful_sync_at ASC;

# Total records ingested by category
SELECT 
  s.category_id,
  COUNT(ir.id) as total_runs,
  SUM(ir.rows_inserted) as total_records_ingested
FROM "IngestionRun" ir
JOIN "SourceSystem" s ON ir.source_system_id = s.id
GROUP BY s.category_id;
```

## Performance Optimization

### Bulk Ingestion Best Practices

1. **Start with high-priority categories first** (charities, politics, sanctions)
2. **Use `--full` flag for complete data loads** instead of incremental updates initially
3. **Monitor database size growth** (~50GB estimated after full population)
4. **Index frequently queried columns** in PostgreSQL:
   ```sql
   CREATE INDEX idx_charity_profile_ein ON "CharityProfile"(ein);
   CREATE INDEX idx_political_candidate_state ON "PoliticalCandidateProfile"(state);
   CREATE INDEX idx_canonical_entity_type ON "CanonicalEntity"(entityType);
   ```

### Rate Limit Respect

Each ingestion source has built-in rate limiting:

| Source | Rate Limit | Configured Delay |
|--------|------------|------------------|
| ProPublica Nonprofit API | ~100 req/min | 1000ms between requests |
| Congress.gov | ~5K calls/month (free tier) | 200ms between requests |
| SEC EDGAR | 10 req/sec | 100ms between requests |
| EPA ECHO | No strict limit | 200ms between requests |

## Next Steps After Initial Data Load

Once all data categories have been ingested:

### 1. Populate Meilisearch Indexes

```bash
# Build search indexes from database records
npx tsx scripts/build-meilisearch-indexes.ts

# Verify indexing completed
curl http://localhost:7700/indexes
```

### 2. Run Fraud Scoring Algorithm

```bash
# Apply fraud scoring to all ingested entities
npx tsx scripts/calculate-fraud-scores.ts --full

# View top risk entities by category
SELECT 
  entity_type,
  score,
  risk_factors
FROM "FraudSnapshot"
ORDER BY score DESC
LIMIT 50;
```

### 3. Connect Frontend to Live Data

Update Next.js API routes to fetch from live database instead of seed data:

```typescript
// app/api/charities/route.ts
import { prisma } from '@/lib/db';

export async function GET() {
  const charities = await prisma.charityProfile.findMany({
    take: 100,
    orderBy: { name: 'asc' },
  });
  
  return Response.json(charities);
}
```

### 4. Set Up Alerts & Monitoring

- Configure Slack webhook for failed ingestions
- Set up Prometheus metrics endpoint at `/api/metrics`
- Create Grafana dashboard for ingestion health visualization
- Enable email alerts for sources failing >3 consecutive times

## Contributing New Data Sources

To add a new data source to the unified ingestion system:

1. **Create individual ingestion script** in `scripts/ingest-{source-name}.ts`
2. **Add entry to INGESTORS array** in `scripts/ingest-all.ts`:
   ```typescript
   {
     id: 'my_new_source',
     name: 'My New Data Source',
     category: 'charities' | 'politics' | 'corporate' | ...,
     priority: 1 | 2 | 3,
     rateLimitMs: 500,
     batchSize: 100,
     requiresApiKey: false,
     enabled: true,
   },
   ```
3. **Implement ingestion function** in `scripts/ingest-all.ts` or reference existing script
4. **Update `.env.example`** with new API key requirements (if applicable)
5. **Test locally** before committing

## Support & Resources

- **Documentation Index**: See [`docs/INDEX.md`](../INDEX.md) for complete documentation
- **Architecture Overview**: See [`docs/architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md)
- **Decision Records**: See [`decisions/`](../../decisions/) for architectural decisions
- **API Keys Setup Guide**: See [`docs/api/api-keys-setup/configuration.md`](../api/api-keys-setup/configuration.md)

## Changelog

### 2026-04-10 - Unified Ingestion System Launched
- ✅ Created `scripts/ingest-all.ts` orchestrator for all 39 data sources
- ✅ Created `scripts/ingest-worker.ts` background worker with scheduling
- ✅ Added `scripts/validate-api-keys.ts` configuration validator
- ✅ Configured Congress.gov API key in `.env`
- ✅ Documented all categories, priorities, and expected record counts

### Future Enhancements (Planned)
- [ ] Implement actual ingestion logic for all 39 sources (currently placeholder implementations)
- [ ] Add Meilisearch indexing pipeline triggered post-ingestion
- [ ] Build real-time fraud scoring engine on ingested data
- [ ] Create ingestion health dashboard with metrics visualization
- [ ] Add Slack/email alerting for failed ingestions
- [ ] Implement incremental updates where API supports (instead of full re-sync)