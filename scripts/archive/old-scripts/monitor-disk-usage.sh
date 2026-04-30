#!/bin/bash

# Disk Usage Monitoring Script for TrackFraud
# Run this periodically (e.g., via cron) to alert on disk usage issues

PROJECT_ROOT="/Volumes/MacBackup/TrackFraudProject"
LOGS_DIR="${PROJECT_ROOT}/logs"
ALERT_THRESHOLD_GB=100
CRITICAL_THRESHOLD_GB=200

echo "=== TrackFraud Disk Usage Monitor ==="
echo "Timestamp: $(date)"
echo ""

# Get total project size
total_size=$(du -sh "${PROJECT_ROOT}" 2>/dev/null | cut -f1)
logs_size=$(du -sh "${LOGS_DIR}" 2>/dev/null | cut -f1 || echo "0")

echo "Total Project Size: ${total_size}"
echo "Logs Directory Size: ${logs_size}"
echo ""

# Check for large individual files
echo "Large Files (>1GB):"
find "${PROJECT_ROOT}" -type f -size +1G -exec ls -lh {} \; 2>/dev/null | head -10 || echo "None found"
echo ""

# Alert if thresholds exceeded
total_gb=$(du -sg "${PROJECT_ROOT}" 2>/dev/null | cut -f1)
logs_gb=$(du -sg "${LOGS_DIR}" 2>/dev/null | cut -f1 || echo "0")

if [ "$logs_gb" -gt "$CRITICAL_THRESHOLD_GB" ]; then
    echo "🚨 CRITICAL: Logs directory exceeds ${CRITICAL_THRESHOLD_GB}GB (${logs_gb}GB)"
    echo "   Run: ${PROJECT_ROOT}/scripts/cleanup-disk-space.sh auto"
    exit 2
elif [ "$logs_gb" -gt "$ALERT_THRESHOLD_GB" ]; then
    echo "⚠️  WARNING: Logs directory exceeds ${ALERT_THRESHOLD_GB}GB (${logs_gb}GB)"
    echo "   Consider running log rotation or cleanup."
    exit 1
else
    echo "✓ Disk usage within acceptable limits"
fi

# Check for runaway processes
echo ""
echo "Checking for runaway ingestion processes..."
runaway_count=$(ps aux | grep -E 'ingest-irs-eo-bmf|corporate-ingest' | grep -v grep | wc -l)

if [ "$runaway_count" -gt 5 ]; then
    echo "⚠️  WARNING: Found ${runaway_count} ingestion processes running"
    ps aux | grep -E 'ingest-irs-eo-bmf|corporate-ingest' | grep -v grep
fi

echo ""
echo "Monitor complete."
