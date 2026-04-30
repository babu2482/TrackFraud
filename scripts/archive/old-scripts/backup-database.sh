#!/usr/bin/env bash
# ============================================
# TrackFraud - Automated Database Backup Script
# ============================================
# Backs up the PostgreSQL database to a compressed SQL file.
# Designed to run via cron or manually.
#
# Usage:
#   ./scripts/backup-database.sh              # Backup with timestamp
#   ./scripts/backup-database.sh /path/to/dir # Backup to specific directory
#   ./scripts/backup-database.sh --list       # List existing backups
#   ./scripts/backup-database.sh --cleanup 30 # Delete backups older than 30 days
#
# Cron example (daily at 2 AM):
#   0 2 * * * /Volumes/MacBackup/TrackFraudProject/scripts/backup-database.sh /Volumes/Backup/trackfraud >> /var/log/trackfraud-backup.log 2>&1
# ============================================

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-$(dirname "$0")/../backups}"
MAX_BACKUPS="${TRACKFRAUD_MAX_BACKUPS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/trackfraud_backup_${TIMESTAMP}.sql.gz"
LOG_FILE="${BACKUP_DIR}/backup.log"

# Database connection from environment or defaults
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-trackfraud}"
PGUSER="${PGUSER:-trackfraud}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}ERROR: $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}SUCCESS: $1${NC}" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

# List existing backups
list_backups() {
    echo "Existing backups in ${BACKUP_DIR}:"
    echo "-----------------------------------"
    if [ -d "$BACKUP_DIR" ] && ls "${BACKUP_DIR}"/trackfraud_backup_*.sql.gz 1> /dev/null 2>&1; then
        ls -lh "${BACKUP_DIR}"/trackfraud_backup_*.sql.gz | awk '{print $9, $5}' | sort -r
        echo "-----------------------------------"
        echo "Total: $(ls "${BACKUP_DIR}"/trackfraud_backup_*.sql.gz 2>/dev/null | wc -l) backups"
        echo "Total size: $(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1)"
    else
        echo "No backups found."
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    local days="${1:-$MAX_BACKUPS}"
    log "Cleaning up backups older than ${days} days..."

    local count
    count=$(find "${BACKUP_DIR}" -name "trackfraud_backup_*.sql.gz" -mtime +"${days}" 2>/dev/null | wc -l)

    if [ "$count" -gt 0 ]; then
        find "${BACKUP_DIR}" -name "trackfraud_backup_*.sql.gz" -mtime +"${days}" -delete -print
        log_success "Deleted ${count} old backup(s)"
    else
        log "No backups older than ${days} days found"
    fi
}

# Perform the backup
perform_backup() {
    # Check if pg_dump is available
    if ! command -v pg_dump &> /dev/null; then
        # Try Docker-based backup
        if command -v docker &> /dev/null; then
            log "Using Docker to perform backup..."
            docker exec trackfraud-postgres pg_dump -U "$PGUSER" "$PGDATABASE" | gzip > "$BACKUP_FILE"
        else
            log_error "pg_dump not found and Docker is not available. Cannot perform backup."
            exit 1
        fi
    else
        log "Performing database backup..."
        PGHOST="$PGHOST" PGPORT="$PGPORT" PGDATABASE="$PGDATABASE" PGUSER="$PGUSER" \
            pg_dump --format=plain --no-owner --no-privileges --clean --if-exists | gzip > "$BACKUP_FILE"
    fi

    # Verify backup was created
    if [ -f "$BACKUP_FILE" ]; then
        local size
        size=$(du -h "$BACKUP_FILE" | cut -f1)
        log_success "Backup created: ${BACKUP_FILE} (${size})"

        # Cleanup old backups
        cleanup_old_backups
    else
        log_error "Backup file was not created"
        exit 1
    fi
}

# Main
main() {
    case "${1:-}" in
        --list)
            list_backups
            exit 0
            ;;
        --cleanup)
            cleanup_old_backups "${2:-$MAX_BACKUPS}"
            exit 0
            ;;
        --help|-h)
            echo "Usage: $0 [backup_dir|--list|--cleanup days|--help]"
            echo ""
            echo "Options:"
            echo "  backup_dir      Directory to store backups (default: ./backups)"
            echo "  --list          List existing backups"
            echo "  --cleanup days  Delete backups older than N days (default: $MAX_BACKUPS)"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            # Create backup directory if it doesn't exist
            mkdir -p "$BACKUP_DIR"

            # Perform the backup
            perform_backup
            ;;
    esac
}

main "$@"