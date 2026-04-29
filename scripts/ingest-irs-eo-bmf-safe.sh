#!/bin/bash

# Safe IRS BMF Ingestion Wrapper Script
# This script wraps the TypeScript ingestion with proper error handling

set -e

PROJECT_ROOT="/Volumes/MacBackup/TrackFraudProject"
LOG_FILE="${PROJECT_ROOT}/logs/irs-bmf-safe.log"
MAX_RUNTIME_HOURS=24  # Stop if running for more than 24 hours
CHECK_INTERVAL_MINUTES=5

echo "=== Safe IRS BMF Ingestion ==="
echo "Started at: $(date)"
echo "Max runtime: ${MAX_RUNTIME_HOURS} hours"
echo ""

# Record start time
START_TIME=$(date +%s)

# Function to check if we've exceeded max runtime
check_runtime() {
    local current_time=$(date +%s)
    local elapsed_hours=$(( (current_time - START_TIME) / 3600 ))

    if [ $elapsed_hours -ge $MAX_RUNTIME_HOURS ]; then
        echo "⚠️  Max runtime of ${MAX_RUNTIME_HOURS} hours exceeded. Stopping."
        exit 1
    fi

    echo "Runtime: ${elapsed_hours}h (limit: ${MAX_RUNTIME_HOURS}h)"
}

# Function to check log file size
check_log_size() {
    if [ -f "${LOG_FILE}" ]; then
        local size_mb=$(du -m "${LOG_FILE}" | cut -f1)

        if [ "$size_mb" -gt 50 ]; then
            echo "⚠️  Log file is ${size_mb}MB. Consider rotating."

            # Rotate if over 100MB
            if [ "$size_mb" -gt 100 ]; then
                mv "${LOG_FILE}" "${LOG_FILE}.$(date +%Y%m%d_%H%M%S)"
                echo "✓ Rotated log file"
            fi
        fi
    fi
}

# Main loop with safety checks
while true; do
    # Safety checks every 5 minutes
    check_runtime
    check_log_size

    # Run the ingestion script
    cd "${PROJECT_ROOT}"

    echo ""
    echo "Starting IRS BMF ingestion at $(date)"
    npx ts-node scripts/ingest-irs-eo-bmf.ts >> "${LOG_FILE}" 2>&1 || true

    echo "IRS BMF ingestion completed at $(date)"
    echo ""

    # Wait before next run (configured interval)
    sleep $(( CHECK_INTERVAL_MINUTES * 60 ))
done
