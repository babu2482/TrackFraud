#!/bin/bash

# Automatic log cleanup if directory exceeds threshold

LOGS_DIR="/Volumes/MacBackup/TrackFraudProject/logs"
THRESHOLD_GB=150  # Trigger cleanup at 150GB

current_gb=$(du -sg "${LOGS_DIR}" 2>/dev/null | cut -f1 || echo "0")

if [ "$current_gb" -gt "$THRESHOLD_GB" ]; then
    echo "$(date): Logs directory is ${current_gb}GB (threshold: ${THRESHOLD_GB}GB). Running cleanup..."

    /Volumes/MacBackup/TrackFraudProject/scripts/cleanup-disk-space.sh auto >> "${LOGS_DIR}/cleanup.log" 2>&1

    new_gb=$(du -sg "${LOGS_DIR}" 2>/dev/null | cut -f1 || echo "unknown")
    echo "$(date): Logs directory is now ${new_gb}GB after cleanup."
else
    echo "$(date): Logs directory is ${current_gb}GB (below threshold). No action needed."
fi
