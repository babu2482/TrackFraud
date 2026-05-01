# Search Index Management Runbook

Operational procedures for Meilisearch index management in TrackFraud.

## Overview

This runbook covers routine search operations, troubleshooting, and maintenance tasks for the TrackFraud Meilisearch instance.

## Services

| Service | Docker Container | Port | Purpose |
|---------|-----------------|------|---------|
| Meilisearch | `meilisearch` | 7700 | Full-text search index |

## Quick Commands

```bash
# Start Meilisearch via Docker Compose
npm run search:start

# Stop Meilisearch
npm run search:stop

# View Meilisearch logs
docker compose logs meilisearch

# Access Meilisearch shell (via curl)
curl http://localhost:7700/indexes

# Reindex all data
npm run search:reindex
```

## Index Management

### List All Indexes

```bash
# Get list of all indexes
curl -s http://localhost:7700/indexes | jq '.results[] | {uid, primaryKey, numberOfDocuments}'

# Or using Docker
docker compose exec meilisearch curl http://localhost:7700/indexes
```

### Index Statistics

```bash
# Get statistics for a specific index
curl -s "http://localhost:7700/indexes/canonical_entities" | jq '.stats'

# Get document count
docker compose exec meilisearch curl http://localhost:7700/indexes/canonical_entities/documents?limit=1 | jq '.total'
```

### Update Index Settings

```bash
# Get current settings
curl -s http://localhost:7700/indexes/canonical_entities/settings

# Update searchable attributes
curl -X PATCH http://localhost:7700/indexes/canonical_entities/settings/searchable-attributes \
  -H "Content-Type: application/json" \
  -d '["name", "description", "aliases.name"]'

# Update filterable attributes
curl -X PATCH http://localhost:7700/indexes/canonical_entities/settings/filterable-attributes \
  -H "Content-Type: application/json" \
  -d '["category", "source_system", "status"]'

# Update sortable attributes
curl -X PATCH http://localhost:7700/indexes/canonical_entities/settings/sortable-attributes \
  -H "Content-Type: application/json" \
  -d '["createdAt", "updatedAt"]'
```

## Reindexing Operations

### Full Reindex

```bash
# Trigger full reindex from application
npm run search:reindex

# Or manually delete and recreate index
curl -X DELETE http://localhost:7700/indexes/canonical_entities
npm run db:migrate  # Ensure DB is in sync
# Then trigger indexing via API or script
```

### Incremental Updates

```bash
# Documents are updated automatically when:
# - New entities are created (POST /api/entities)
# - Existing entities are updated (PATCH /api/entities/:id)
# - Entities are deleted (DELETE /api/entities/:id)

# If sync is out of date, trigger full reindex
npm run search:reindex
```

### Search Testing

```bash
# Basic search
curl -s "http://localhost:7700/indexes/canonical_entities/search?q=charity" | jq

# Search with filters
curl -s "http://localhost:7700/indexes/canonical_entities/search?q=fraud&filter=category=fraud" | jq

# Search with pagination
curl -s "http://localhost:7700/indexes/canonical_entities/search?q=test&limit=10&offset=20" | jq

# Search with facets distribution
curl -s "http://localhost:7700/indexes/canonical_entities/search?q=fundraising&facets=['category','status']" | jq
```

## Troubleshooting

### Search Not Returning Results

**Problem:** Search queries returning no results when data exists in database

```bash
# Check if index has documents
docker compose exec meilisearch curl http://localhost:7700/indexes/canonical_entities/documents?limit=1

# Check Meilisearch logs for errors
docker compose logs meilisearch | grep -i error

# Verify index settings are correct
curl -s http://localhost:7700/indexes/canonical_entities/settings | jq

# Reindex if needed
npm run search:reindex
```

### Slow Search Performance

**Problem:** Search queries taking too long

```bash
# Check Meilisearch resource usage
docker stats meilisearch --no-stream

# Check for heavy queries in logs
docker compose logs meilisearch | grep -i "query"

# Optimize by adding filterable attributes for common filters
curl -X PATCH http://localhost:7700/indexes/canonical_entities/settings/filterable-attributes \
  -H "Content-Type: application/json" \
  -d '["category", "source_system"]'
```

### Index Corruption

**Problem:** Search returning inconsistent results or errors

```bash
# Check Meilisearch health
curl -s http://localhost:7700/health | jq

# Restart Meilisearch service
docker compose restart meilisearch

# If corruption persists, recreate index
docker compose stop meilisearch
docker volume rm TrackFraudProject_meilisearch-data  # WARNING: deletes all data
docker compose up -d meilisearch
npm run search:reindex
```

### Memory Issues

**Problem:** Meilisearch consuming excessive memory

```bash
# Check current memory usage
curl -s http://localhost:7700/stats | jq '.databaseSize, .indexedDocuments'

# Adjust Meilisearch memory limits in docker-compose.yml
# memlimit: "2g"

# Restart with new limits
docker compose restart meilisearch
```

## Configuration

### Environment Variables

```bash
# In docker-compose.yml or .env
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_API_KEY=trackfraud-dev-master-key

# Production recommendations
MEILI_NO_ANALYTICS=true  # Disable analytics in production
MEILI_MASTER_KEY=<secure-random-string>
```

### Docker Compose Configuration

```yaml
services:
  meilisearch:
    image: getmeili/meilisearch:latest
    ports:
      - "7700:7700"
    environment:
      - MEILI_MASTER_KEY=${MEILISEARCH_API_KEY}
      - MEILI_NO_ANALYTICS=true
    volumes:
      - meilisearch-data:/meili_data
    restart: unless-stopped

volumes:
  meilisearch-data:
```

## Security

### API Key Management

```bash
# View current settings (includes API key configuration)
curl http://localhost:7700/tasks

# Create new task for security audit
docker compose exec meilisearch curl -X POST http://localhost:7700/tasks \
  -H "Content-Type: application/json" \
  -d '{"indexes": ["canonical_entities"], "action": "update"}'
```

### Rate Limiting

Meilisearch has built-in rate limiting. To configure:

```bash
# Update settings with custom rate limits
curl -X PATCH http://localhost:7700/settings/rating-limit-per-sec \
  -H "Content-Type: application/json" \
  -d '100'  # 100 requests per second
```

## Monitoring

### Health Check

```bash
# Simple health check
curl http://localhost:7700/health

# Full stats
docker compose exec meilisearch curl http://localhost:7700/stats | jq
```

### Index Sync Status

```bash
# Compare database count with index count
# Database
docker compose exec postgres psql -U trackfraud -d trackfraud -c "SELECT COUNT(*) FROM canonical_entity;"

# Meilisearch
curl -s http://localhost:7700/indexes/canonical_entities | jq '.numberOfDocuments'
```

## Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture overview
- [Database Maintenance Runbook](./database-maintenance.md) - PostgreSQL maintenance
- [API Keys Configuration](../api/api-keys-setup/configuration.md) - API key setup
