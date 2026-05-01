# Database Maintenance Runbook

Operational procedures for PostgreSQL database maintenance in TrackFraud.

## Overview

This runbook covers routine database operations, troubleshooting, and maintenance tasks for the TrackFraud PostgreSQL instance.

## Services

| Service | Docker Container | Port | Purpose |
|---------|-----------------|------|---------|
| PostgreSQL | `postgres` | 5432 | Primary data store |
| Meilisearch | `meilisearch` | 7700 | Full-text search index |

## Quick Commands

```bash
# Start database via Docker Compose
npm run db:start

# Stop database
npm run db:stop

# Run migrations
npm run db:migrate

# Reset database (WARNING: destroys all data)
npm run db:reset

# View database logs
docker compose logs postgres

# Access PostgreSQL shell
docker compose exec postgres psql -U trackfraud -d trackfraud
```

## Routine Maintenance Tasks

### 1. Database Backup

```bash
# Full backup
docker compose exec postgres pg_dump -U trackfraud trackfraud > backup_$(date +%Y%m%d).sql

# Compressed backup
docker compose exec postgres pg_dump -U trackfraud trackfraud | gzip > backup_$(date +%Y%m%d).sql.gz

# Backup with timestamp in filename
docker compose exec postgres pg_dump -U trackfraud trackfraud > /backups/backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Database Restore

```bash
# From uncompressed backup
cat backup_20260410.sql | docker compose exec -T postgres psql -U trackfraud trackfraud

# From compressed backup
gunzip < backup_20260410.sql.gz | docker compose exec -T postgres psql -U trackfraud trackfraud

# Full restore from scratch
docker run --rm -i postgres:16 < backup.sql
```

### 3. Index Maintenance

```bash
# Access PostgreSQL shell
docker compose exec postgres psql -U trackfaud -d trackfraud

# Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

# Find unused indexes (scan count = 0)
SELECT schemaname, tablename, indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0;

# Rebuild all indexes (requires exclusive lock - run during maintenance window)
REINDEX DATABASE trackfraud;

# Rebuild specific index
REINDEX INDEX CONCURRENTLY canonical_entity_name_key;
```

### 4. Vacuum and Analyze

```bash
# Run VACUUM ANALYZE on all tables
docker compose exec postgres psql -U trackfraud -d trackfraud -c "VACUUM ANALYZE;"

# VACUUM specific table
docker compose exec postgres psql -U trackfraud -d trackfraud -c "VACUUM ANALYZE canonical_entity;"

# Full vacuum with verbose output
docker compose exec postgres psql -U trackfraud -d trackfraud -c "VACUUM (VERBOSE, ANALYZE);"
```

### 5. Check Database Size

```bash
# Total database size
docker compose exec postgres psql -U trackfraud -d trackfraud -c "SELECT pg_size_pretty(pg_database_size('trackfraud'));"

# Size by table
docker compose exec postgres psql -U trackfraud -d trackfraud -c "
  SELECT relname AS table_name,
         pg_size_pretty(pg_total_relation_size(relid)) AS size
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC;
"

# Size by index
docker compose exec postgres psql -U trackfraud -d trackfraud -c "
  SELECT schemaname, tablename,
         pg_size_pretty(pg_indexes_size(tablename::regclass)) AS index_size
  FROM pg_stat_user_tables
  ORDER BY pg_indexes_size(tablename::regclass) DESC;
"
```

## Troubleshooting

### Connection Issues

**Problem:** Cannot connect to database

```bash
# Check if PostgreSQL is running
docker compose ps postgres

# View connection errors in logs
docker compose logs postgres | grep -i "listen\|connection"

# Restart PostgreSQL
docker compose restart postgres

# Check port availability
lsof -i :5432
```

### Slow Queries

**Problem:** API endpoints responding slowly

```bash
# Enable slow query logging in postgresql.conf:
# log_min_duration_statement = 1000  # Log queries taking > 1 second

# Check for long-running queries
docker compose exec postgres psql -U trackfraud -d trackfraud -c "
  SELECT pid, usename, state, query, now() - pg_stat_activity.query_start AS duration
  FROM pg_stat_activity
  WHERE state != 'idle'
  ORDER BY duration DESC;
"

# Analyze slow query
EXPLAIN (ANALYZE, BUFFERS) YOUR_QUERY_HERE;
```

### Deadlocks

**Problem:** Transaction deadlock errors in logs

```bash
# Check for recent deadlocks
docker compose exec postgres psql -U trackfraud -d trackfraud -c "
  SELECT datname, xact_start, state, query
  FROM pg_stat_activity
  WHERE state = 'idle in transaction';
"

# Kill stuck transactions
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = <PID>;
```

### Disk Space Issues

**Problem:** Database growing too large

```bash
# Check table bloat
docker compose exec postgres psql -U trackfraud -d trackfraud -c "
  SELECT schemaname, relname, n_live_tup, n_dead_tup,
         pg_size_pretty(pg_relation_size(relid)) AS size
  FROM pg_stat_user_tables
  ORDER BY n_dead_tup DESC;
"

# Vacuum tables with high dead tuple count
docker compose exec postgres psql -U trackfraud -d trackfraud -c "VACUUM ANALYZE table_name;"
```

## Migration Management

### Applying Migrations

```bash
# Run all pending migrations
npm run db:migrate

# Generate new migration
npx prisma migrate dev --name description_of_changes

# Reset to fresh state (deletes all data)
npm run db:reset

# View migration status
npx prisma migrate status
```

### Rolling Back Migrations

```bash
# Note: Prisma does not support automatic rollback. Manual intervention required.

# List migrations
ls prisma/migrations/

# Manually revert changes in database
docker compose exec postgres psql -U trackfraud -d trackfraud -c "DROP TABLE IF EXISTS table_name;"
```

## Monitoring

### Health Check

```bash
# Check if database is accepting connections
docker compose exec postgres pg_isready -h localhost -p 5432 -U trackfraud

# Count total entities
docker compose exec postgres psql -U trackfraud -d trackfraud -c "SELECT COUNT(*) FROM canonical_entity;"
```

### Replication Status (if configured)

```bash
# Check replication lag
docker compose exec postgres psql -U trackfraud -d trackfraud -c "
  SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
         pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS lag
  FROM pg_stat_replication;
"
```

## Security

### Rotating Database Password

```bash
# 1. Update password in Prisma schema
# Edit DATABASE_URL in .env file with new password

# 2. Change PostgreSQL user password
docker compose exec postgres psql -U trackfraud -d trackfraud -c "ALTER USER trackfraud WITH PASSWORD 'new_password';"

# 3. Restart services to pick up new credentials
docker compose restart postgres app
```

### Access Control

```bash
# List all users
docker compose exec postgres psql -U postgres -d postgres -c "\du"

# List all databases
docker compose exec postgres psql -U postgres -d postgres -c "\l"

# Show table permissions
docker compose exec postgres psql -U trackfraud -d trackfraud -c "\\drds"
```

## Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture overview
- [DATA_SOURCES.md](../DATA_SOURCES.md) - Data ingestion pipeline
- [API Keys Configuration](../api/api-keys-setup/configuration.md) - API key setup
