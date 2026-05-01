# Runbooks

Operational procedures for maintaining and troubleshooting TrackFraud.

## Index

| Runbook | When to Use |
|---------|-------------|
| [Database Maintenance](./database-maintenance.md) | Backups, cleanup, connection issues |
| [Ingestion Troubleshooting](./ingestion-troubleshooting.md) | Data ingestion failures, retries, data quality |
| [Log Management](./log-management.md) | Large log files, runaway processes, disk space |
| [Monitoring & Alerts](./monitoring-alerts.md) | Health checks, Sentry alerts, system monitoring |
| [Search Index Management](./search-index-management.md) | Meilisearch reindexing, search issues |

## Quick Reference

### Health Checks
```bash
docker compose ps                    # Service status
docker compose logs --tail=50        # Recent logs
npx tsx scripts/health-check.ts      # App health check
```

### Common Fixes
```bash
npx tsx scripts/reindex-search.ts    # Rebuild search indexes
docker compose restart postgres      # Restart database
npx prisma generate                  # Regenerate Prisma client
```

### Emergency
```bash
# Backup database immediately
docker exec trackfraud-postgres pg_dump -U trackfraud trackfraud > /tmp/backup-$(date +%Y%m%d).sql

# Check disk space
df -h / && docker system df

# View large files
find . -type f -size +100M -not -path "./node_modules/*" 2>/dev/null