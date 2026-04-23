# Data Ingestion Troubleshooting Runbook

Operational procedures for diagnosing and fixing data ingestion issues in TrackFraud.

## Overview

This runbook covers troubleshooting steps for the 30+ data ingestion scripts that populate TrackFraud's database from various government and third-party APIs.

## Quick Commands

```bash
# Check recent ingestion logs
docker compose logs | grep -i "ingest"

# List all ingestion scripts
ls scripts/

# Run a specific ingestion script
npx tsx scripts/ingest-irs-eo-bmf.ts

# Run with verbose logging
npx tsx scripts/ingest-propublica-politicians.ts --verbose
```

## Common Issues

### 1. API Authentication Failures

**Symptoms:** `401 Unauthorized` or authentication errors during ingestion

```bash
# Check if API keys are configured
cat .env | grep -i "API_KEY"

# Verify ProPublica key (required)
echo $PROPUBLICA_API_KEY

# Test API access directly
curl -H "Authorization: Bearer $PROPUBLICA_API_KEY" \
  "https://api.propublica.org/congress/v1/members/ senate.json" | jq

# Fix: Add or update API keys in .env file
cp .env.example .env
nano .env  # Add your keys
```

### 2. Rate Limit Errors

**Symptoms:** `429 Too Many Requests` errors during ingestion

```bash
# Check rate limit headers in script logs
docker compose logs | grep -i "rate"

# Scripts implement exponential backoff automatically
# If stuck, retry after waiting:
sleep 60 && npx tsx scripts/ingest-irs-eo-bmf.ts --resume

# To reduce rate: add delays between batches (some scripts support this)
npx tsx scripts/ingest-congress-api.ts --delay=1000
```

### 3. Database Connection Failures

**Symptoms:** `ECONNREFUSED` or PostgreSQL connection errors

```bash
# Check if database is running
docker compose ps postgres

# Test database connection
docker compose exec postgres pg_isready -U trackfraud

# View database logs
docker compose logs postgres | tail -50

# Restart database if needed
docker compose restart postgres

# Run migrations after restart
npm run db:migrate
```

### 4. Script Timeout or Hangs

**Symptoms:** Ingestion script running indefinitely or timing out

```bash
# Check for stuck processes
ps aux | grep "ingest"

# Kill stuck process (replace PID)
kill -9 <PID>

# Increase timeout if needed
export TSX_MAX_MEMORY=4096  # 4GB for large ingestions
npx tsx scripts/ingest-sec-edgar.ts

# Check disk space
df -h /

# Verify Meilisearch is running (required for some scripts)
docker compose ps meilisearch
```

### 5. Data Validation Errors

**Symptoms:** Script errors about missing fields or invalid data format

```bash
# View detailed error output
npx tsx scripts/ingest-irs-990n.ts 2>&1 | grep -i "error"

# Check schema validation
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT COUNT(*) FROM charity_epostcard_990_n_records WHERE ein IS NULL;"

# Review script's error handling logs
ls -la data/ingestion-logs/ 2>/dev/null || echo "No ingestion logs directory"

# Fix: Update script to handle edge cases or skip invalid records
```

### 6. Partial Ingestion / Resume Issues

**Symptoms:** Script stops mid-run, resume doesn't work correctly

```bash
# Check last successful sync timestamp
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT source_system, last_successful_sync_at FROM source_system ORDER BY last_successful_sync_at DESC LIMIT 5;"

# Force full re-sync (deletes and reloads)
npx tsx scripts/ingest-irs-eo-bmf.ts --force-full-sync

# Check for duplicate records after resume
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT ein, COUNT(*) FROM charity_business_master_records GROUP BY ein HAVING COUNT(*) > 1 LIMIT 10;"
```

## Script-Specific Troubleshooting

### IRS Ingestion Scripts

**Scripts:** `ingest-irs-eo-bmf.ts`, `ingest-irs-auto-revocation.ts`, etc.

```bash
# Common issue: Large XML files causing memory issues
export NODE_OPTIONS="--max-old-space-size=4096"
npx tsx scripts/ingest-irs-990-xml.ts

# Check for incomplete filings
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT COUNT(*) FROM charity_filings WHERE filing_status = 'in_progress';"
```

### FEC Ingestion Scripts

**Scripts:** `ingest-fec-summaries.ts`

```bash
# Common issue: API changes in election data format
npx tsx scripts/ingest-fec-summaries.ts --verbose 2>&1 | grep -i "warning\|error"

# Check FEC API availability
curl https://api.open.fec.gov/v1/ \
  -H "Accept: application/json" | jq '.results[0]'
```

### SEC EDGAR Ingestion Scripts

**Scripts:** `ingest-sec-edgar.ts`

```bash
# Common issue: Large dataset causing timeouts
npx tsx scripts/ingest-sec-edgar.ts --batch-size=50  # Smaller batches

# Check for missing CIK mappings
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT COUNT(*) FROM corporate_company_profiles WHERE cik IS NULL;"
```

### Political Data Scripts

**Scripts:** `ingest-propublica-politicians.ts`, `sync-political-data.ts`

```bash
# Verify ProPublica API is accessible
curl -H "Authorization: Bearer $PROPUBLICA_API_KEY" \
  "https://api.propublica.org/congress/v1/members/ senate.json" | jq '.results[0].first_name'

# Check Congress.gov API status
curl https://www.congress.gov/help/api-usage-stats.json | jq .

# Run with debug logging
npx tsx scripts/sync-political-data.ts --all --verbose
```

## Data Quality Checks

### Verify Ingestion Results

```bash
# Check entity counts by category
docker compose exec postgres psql -U trackfraud -d trackfraud << 'EOF'
SELECT
  'charity_business_master' AS source, COUNT(*) as count FROM charity_business_master_records
UNION ALL SELECT 'irs_990', COUNT(*), FROM charity_filings
UNION ALL SELECT 'fec_summaries', COUNT(*), FROM fec_candidate_summary_records
UNION ALL SELECT 'sec_profiles', COUNT(*), FROM corporate_company_profiles;
EOF

# Check for recent ingestion activity
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT source_system, last_successful_sync_at, last_attempted_sync_at FROM source_system ORDER BY last_successful_sync_at DESC LIMIT 10;"

# Verify search index is in sync
curl http://localhost:7700/indexes/canonical_entities | jq '.numberOfDocuments'
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT COUNT(*) FROM canonical_entity;"
```

### Identify Data Anomalies

```bash
# Check for orphaned records (entities without source system)
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT COUNT(*) FROM canonical_entity WHERE source_system_id NOT IN (SELECT id FROM source_system);"

# Find entities with missing required fields
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT 'charity' as type, ein, name FROM charity_business_master_records WHERE ein IS NULL
      UNION ALL SELECT 'corporate', cik, name FROM corporate_company_profiles WHERE cik IS NULL;"

# Check for stale data (no updates in >30 days)
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT source_system, last_successful_sync_at, 
       EXTRACT(DAY FROM (NOW() - last_successful_sync_at)) as days_since_sync
       FROM source_system WHERE last_successful_sync_at < NOW() - INTERVAL '30 days';"
```

## Recovery Procedures

### Full Data Reset and Re-sync

**WARNING:** This will delete all existing data! Only use when absolutely necessary.

```bash
# 1. Stop all ingestion processes
pkill -f "ingest-" || true

# 2. Backup current data (optional)
docker compose exec postgres pg_dump -U trackfraud trackfraud > pre-reset-backup.sql.gz

# 3. Reset database
npm run db:reset

# 4. Re-run migrations
npm run db:migrate

# 5. Run all ingestion scripts in order
npx tsx scripts/ingest-irs-eo-bmf.ts
npx tsx scripts/ingest-fec-summaries.ts
npx tsx scripts/ingest-propublica-politicians.ts --chamber senate,house
npm run political:sync-presidents
npm run political:sync-bills

# 6. Verify data integrity
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT 'Total Entities' as metric, COUNT(*) FROM canonical_entity;"
```

### Partial Recovery (Single Source)

```bash
# 1. Identify problematic source
docker compose exec postgres psql -U trackfraud -d trackfraud \
  -c "SELECT source_system, last_error FROM source_system WHERE last_error IS NOT NULL;"

# 2. Clear data for that source only
docker compose exec postgres psql -U trackfraud -d trackfraud << 'EOF'
DELETE FROM charity_business_master_records;
-- Update the count in canonical_entity if needed
UPDATE source_system SET last_successful_sync_at = NULL, last_error = NULL WHERE id = 'irs_eo_bmf';
EOF

# 3. Re-run ingestion for that source only
npx tsx scripts/ingest-irs-eo-bmf.ts --force-full-sync
```

## Prevention Best Practices

1. **Monitor API key expiration** - Set calendar reminders to renew keys before expiry
2. **Set up ingestion alerts** - Configure monitoring for failed ingestions
3. **Regular data quality checks** - Run weekly validation queries
4. **Backup before major updates** - Always backup before schema changes
5. **Document custom configurations** - Track any modifications to default scripts

## Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture overview
- [Database Maintenance Runbook](./database-maintenance.md) - PostgreSQL maintenance
- [Search Index Management](./search-index-management.md) - Meilisearch operations
- [DATA_SOURCES.md](../DATA_SOURCES.md) - Data source documentation
