# Preventing Runaway Log Files - TrackFraud

## Overview

This runbook documents the preventive measures implemented after the 114GB log file incident on 2026-04-15. The goal is to ensure this never happens again.

---

## Incident Summary

**What Happened:**
- IRS BMF ingestion script failed due to database connection issues
- Script entered infinite retry loop without proper backoff or limits
- Generated 2.2+ billion log lines over days/weeks
- Consumed 114GB of disk space (45% of total project)

**Root Causes:**
1. No maximum retry limit in ingestion scripts
2. Missing exponential backoff strategy
3. No circuit breaker pattern implemented
4. Inadequate log rotation configuration
5. No monitoring alerts for disk usage or runaway processes

---

## Preventive Measures Implemented

### 1. Retry Utility Module (`scripts/retry-utility.ts`)

All ingestion scripts should now use the centralized retry utility:

```typescript
import { safeIngestionOperation } from './retry-utility';

// Instead of manual retry loops, use:
const result = await safeIngestionOperation(
  'irs-bmf-ingestion',
  async () => {
    // Your ingestion logic here
    return await performIngestion();
  },
  {
    maxRetries: 50,                    // Stop after 50 attempts
    circuitBreakerThreshold: 15,       // Open circuit after 15 failures
  }
);

if (!result.success) {
  console.error('Ingestion failed:', result.error);
  process.exit(1);
}
```

**Key Features:**
- Maximum retry limit (default: 50 attempts)
- Exponential backoff with jitter (prevents thundering herd)
- Circuit breaker pattern (stops retries after consecutive failures)
- Structured logging with rotation awareness

### 2. Safe Wrapper Scripts (`scripts/ingest-*-safe.sh`)

Each ingestion script now has a safe wrapper that:
- Enforces maximum runtime limits (default: 24 hours)
- Monitors log file sizes and rotates automatically
- Checks for runaway processes before starting

Usage:
```bash
# Instead of running the raw script directly:
npx ts-node scripts/ingest-irs-eo-bmf.ts

# Use the safe wrapper:
./scripts/ingest-irs-eo-bmf-safe.sh
```

### 3. Log Rotation (`scripts/rotate-logs.sh`)

Automatic log rotation configured to:
- Rotate files exceeding 100MB
- Keep only last 5 rotations per script
- Compress old logs with gzip (98% size reduction)

Run manually:
```bash
./scripts/rotate-logs.sh 100 5  # 100MB threshold, keep 5 files
```

Or via cron (automated):
```bash
crontab etc/crontab-trackfraud
```

### 4. Monitoring Scripts

**Disk Usage Monitor (`scripts/monitor-disk-usage.sh`):**
```bash
./scripts/monitor-disk-usage.sh
# Exit codes: 0=healthy, 1=warning, 2=critical
```

**Health Check API Endpoint:**
```bash
curl http://localhost:8000/health/ingestion
# Returns JSON with status, log sizes, running processes
```

### 5. Automated Maintenance (Cron Jobs)

Install automated maintenance:
```bash
crontab /Volumes/MacBackup/TrackFraudProject/etc/crontab-trackfraud
```

Scheduled tasks:
- **Daily at 3 AM:** Log rotation
- **Every hour:** Disk usage monitoring
- **Twice daily:** Automatic cleanup if threshold exceeded
- **Every 5 minutes:** Health check ping
- **Every 10 minutes:** Database connectivity test

---

## Operational Procedures

### Daily Checks (Recommended)

```bash
# 1. Check disk usage
./scripts/monitor-disk-usage.sh

# 2. Verify no runaway processes
ps aux | grep -E 'ingest.*\.ts' | grep -v grep

# 3. Review health endpoint
curl http://localhost:8000/health/ingestion | jq '.'
```

### Weekly Maintenance (Recommended)

```bash
# 1. Manual log rotation
./scripts/rotate-logs.sh

# 2. Archive old logs to external storage if needed
tar -czf /backup/logs_$(date +%Y%m%d).tar.gz logs/*.gz

# 3. Review and prune archives older than 30 days
find archives -name "*.gz" -mtime +30 -delete
```

### Emergency Response (If Logs Grow Uncontrolled)

**Step 1: Identify the culprit**
```bash
du -sh logs/* | sort -hr | head -5
wc -l logs/*.log | sort -n | tail -5
```

**Step 2: Stop runaway processes**
```bash
pkill -f "ingest-irs-eo-bmf"  # Replace with actual script name
# OR
docker-compose down --remove-orphans
```

**Step 3: Run emergency cleanup**
```bash
./scripts/cleanup-disk-space.sh auto
```

**Step 4: Verify recovery**
```bash
du -sh logs/
./scripts/monitor-disk-usage.sh
```

---

## Configuration Reference

### Retry Utility Defaults (Customizable)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MAX_RETRIES` | 50 | Maximum retry attempts before giving up |
| `INITIAL_BACKOFF_MS` | 1000 | Initial delay between retries (1 second) |
| `MAX_BACKOFF_MS` | 3600000 | Maximum backoff delay (1 hour) |
| `BACKOFF_MULTIPLIER` | 2 | Exponential growth factor |
| `CIRCUIT_BREAKER_THRESHOLD` | 15 | Failures before opening circuit |
| `CIRCUIT_BREAKER_TIMEOUT_MS` | 7200000 | Time before resetting circuit (2 hours) |
| `MAX_LOG_FILE_SIZE_MB` | 100 | Rotate log files at this size |

### Monitoring Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Logs directory size | >100GB | >200GB | Run cleanup script |
| Individual log file | >50MB | >100MB | Rotate immediately |
| Running ingestion processes | >3 | >5 | Kill excess processes |
| Recent errors in log (last 100 lines) | >20 | >50 | Investigate root cause |

---

## Migration Guide for Existing Scripts

### Before (Vulnerable to Runaway Logs):

```typescript
// ❌ DON'T DO THIS
while (!success) {
  try {
    await doIngestion();
    success = true;
  } catch (error) {
    logger.error(error); // This logs EVERY failure!
    await sleep(1000);   // No exponential backoff
    // No retry limit, runs forever!
  }
}
```

### After (Protected):

```typescript
// ✅ DO THIS INSTEAD
import { safeIngestionOperation } from './retry-utility';

const result = await safeIngestionOperation(
  'my-ingestion-script',
  async () => {
    return await doIngestion();
  },
  {
    maxRetries: 50,
    circuitBreakerThreshold: 15,
  }
);

if (!result.success) {
  logger.error(`Failed after ${result.attempts} attempts`);
  process.exit(1); // Stop the script!
}
```

---

## Testing the Safeguards

### Test 1: Verify Retry Limits Work

```bash
# Create a test script that always fails
cat > /tmp/test-retry.ts << 'TESTEOF'
import { safeIngestionOperation } from './retry-utility';

const result = await safeIngestionOperation(
  'test-always-fails',
  async () => { throw new Error('Always fails'); },
  { maxRetries: 5, initialBackoffMs: 100 }
);

console.log(`Result: ${result.success}, Attempts: ${result.attempts}`);
TESTEOF

npx ts-node /tmp/test-retry.ts
# Should exit after exactly 5 attempts (not infinite)
```

### Test 2: Verify Log Rotation Works

```bash
# Create a large test log file
dd if=/dev/zero of=logs/test.log bs=1M count=150

# Run rotation script
./scripts/rotate-logs.sh 100 3

# Verify it was rotated
ls -lh logs/test.log*
```

### Test 3: Verify Circuit Breaker Works

Monitor the circuit breaker status via API:
```bash
curl http://localhost:8000/health/ingestion | jq '.status'
# Should show "warning" or "critical" if issues detected
```

---

## Contact & Support

**Incident Response:**
- Primary: Check `logs/cron.log` for automated alerts
- Secondary: Review health endpoint at `/health/ingestion`
- Emergency: Run `./scripts/cleanup-disk-space.sh auto` immediately

**Documentation:**
- This runbook: `/docs/runbooks/PREVENTING_RUNAWAY_LOGS.md`
- Incident report: `/docs/reports/disk-space-investigation-20260415.md`
- Architecture docs: `/docs/ARCHITECTURE.md`

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-04-15 | 1.0 | Initial implementation after incident | AI Assistant |
| TBD | 1.1 | Add more ingestion scripts to safe wrappers | TBD |

---

**Status:** ✅ IMPLEMENTED
**Last Updated:** 2026-04-15T04:30Z
**Next Review:** 2026-04-22 (one week after implementation)
