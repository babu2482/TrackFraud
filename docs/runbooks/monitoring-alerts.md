# Monitoring & Alerts Runbook

Operational procedures for monitoring and alerting in TrackFraud.

## Overview

This runbook covers monitoring setup, health checks, and alert configuration for the TrackFraud platform.

## Health Check Endpoints

### Application Health

The application exposes health check endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Basic application health |
| `/api/health/db` | GET | Database connectivity |
| `/api/health/search` | GET | Meilisearch connectivity |

### Health Check Implementation

The application exposes a comprehensive health check endpoint at `/api/health`:

- `GET /api/health` - Full health check (database + search)
- `GET /api/health?check=db` - Database connectivity only
- `GET /api/health?check=search` - Meilisearch connectivity only

Response format:
```json
{
  "status": "healthy",
  "timestamp": "2026-04-10T12:00:00.000Z",
  "checks": {
    "db": { "status": "healthy", "latency_ms": 15 },
    "search": { "status": "healthy", "latency_ms": 23 }
  }
}
```

### Standalone Health Check Script

For external monitoring systems (cron, UptimeRobot, etc.), use `scripts/health-check.ts`:

```bash
# Run via cron every 5 minutes
*/5 * * * * cd /path/to/TrackFraud && node scripts/health-check.js >> logs/health-check.log 2>&1
```

Configuration via environment variables:
- `NEXT_PUBLIC_APP_URL` - Frontend URL (default: http://localhost:3001)
- `MEILISEARCH_URL` - Meilisearch URL (default: http://localhost:7700)

## Docker Compose Health Checks

Update docker-compose.yml to include health checks:

```yaml
services:
  postgres:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trackfraud"]
      interval: 10s
      timeout: 5s
      retries: 5

  meilisearch:
    image: getmeili/meilisearch:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7700/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
```

## Monitoring Metrics to Track

### Database Metrics

| Metric | Query | Alert Threshold |
|--------|-------|-----------------|
| Connection count | `SELECT count(*) FROM pg_stat_activity;` | > 80% of max_connections |
| Dead tuples | Check tables with high dead tuple ratio | > 20% dead tuples |
| Replication lag | `pg_wal_lsn_diff(sent_lsn, replay_lsn)` | > 1MB lag |
| Long queries | Queries running > 60s | Any occurrence |

### Search Index Metrics

| Metric | Check Command | Alert Threshold |
|--------|---------------|-----------------|
| Document count | `curl /indexes/canonical_entities` | Significant deviation from DB count |
| Memory usage | `docker stats meilisearch` | > 80% allocated memory |
| Index size | `curl /stats` | Exponential growth |

### Ingestion Pipeline Metrics

Track these via database queries:

```sql
-- Check last successful sync for each source system
SELECT
  source_system,
  last_successful_sync_at,
  EXTRACT(EPOCH FROM (NOW() - last_successful_sync_at)) / 3600 AS hours_since_sync
FROM source_system
ORDER BY last_successful_sync_at ASC;

-- Flag sources that haven't synced in expected timeframe
SELECT * FROM source_system
WHERE last_successful_sync_at < NOW() - INTERVAL '24 hours'
AND ingestion_mode = 'api';
```

## Alert Configuration

### GitHub Actions Alerts

The CI/CD pipeline provides immediate feedback:

1. **Build Failures**: Email notification from GitHub
2. **Test Failures**: PR comment with test output
3. **Deployment Status**: Workflow status badges

### External Monitoring Services

Recommended services for production:

| Service | Use Case | Setup Complexity |
|---------|----------|------------------|
| UptimeRobot | HTTP endpoint monitoring | Low |
| Datadog | Full-stack APM | Medium |
| Sentry | Error tracking | Low |
| CloudWatch | AWS infrastructure metrics | Medium |
| Prometheus + Grafana | Custom metrics dashboards | High |

### External Monitoring Services

Recommended services for production:

| Service | Use Case | Setup Complexity |
|---------|----------|------------------|
| UptimeRobot | HTTP endpoint monitoring | Low |
| Datadog | Full-stack APM | Medium |
| Sentry | Error tracking | Low |
| CloudWatch | AWS infrastructure metrics | Medium |
| Prometheus + Grafana | Custom metrics dashboards | High |

### Alert Thresholds

Configure alerts based on these thresholds:

- **Database latency**: > 100ms warning, > 500ms critical
- **Search latency**: > 200ms warning, > 1000ms critical  
- **Uptime**: < 99.5% over 24 hours
- **Sync staleness**: Source not synced in > 48 hours (API mode)

### Log Aggregation

Next.js logs to stdout/stderr which Docker captures:

```bash
# View application logs
docker compose logs -f app

# View specific service logs
docker compose logs -f postgres
docker compose logs -f meilisearch
```

## Log Aggregation

### Application Logs

Next.js logs to stdout/stderr which Docker captures:

```bash
# View application logs
docker compose logs -f app

# View specific service logs
docker compose logs -f postgres
docker compose logs -f meilisearch
```

### Structured Logging Setup

Add structured logging to ingestion scripts:

```typescript
// lib/logger.ts
export const logger = {
  info: (message: string, data?: any) => {
    console.log(JSON.stringify({ level: 'INFO', message, timestamp: new Date().toISOString(), ...data }))
  },
  error: (message: string, error?: any) => {
    console.error(JSON.stringify({ level: 'ERROR', message, timestamp: new Date().toISOString(), error: String(error) }))
  },
}
```

## Incident Response

### Database Issues

1. Check connection pool: `SELECT count(*) FROM pg_stat_activity;`
2. Kill long-running queries if necessary
3. Review slow query log
4. Run VACUUM ANALYZE if bloat detected

### Search Index Issues

1. Verify Meilisearch health endpoint responds
2. Compare document counts between DB and index
3. Reindex if significant divergence: `npm run search:reindex`

### Ingestion Failures

1. Check API key validity and rate limits
2. Review ingestion script logs for specific errors
3. Use `--verbose` flag for detailed output
4. Consult [ingestion-troubleshooting.md](./ingestion-troubleshooting.md)

## Related Documentation

- [Database Maintenance Runbook](./database-maintenance.md)
- [Search Index Management](./search-index-management.md)
- [Ingestion Troubleshooting](./ingestion-troubleshooting.md)
