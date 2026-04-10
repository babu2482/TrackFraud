#!/bin/bash
# ============================================================================
# TrackFraud - Complete Setup and Data Ingestion Script
#
# This script:
# 1. Starts all required services (PostgreSQL, Redis, Meilisearch) via Docker
# 2. Runs database migrations
# 3. Executes full data ingestion across all categories
# 4. Sets up background worker for continuous operation
#
# Usage: ./scripts/setup-and-ingest.sh
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
INGEST_LOG="${LOG_DIR}/full-ingestion-$(date +%Y%m%d-%H%M%S).log"

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# ============================================================================
# Prerequisites Check
# ============================================================================

log_info "🔍 Checking prerequisites..."

check_command docker
check_command docker-compose

if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running. Please start Docker Desktop first."
    exit 1
fi

log_success "All prerequisites met!"

# ============================================================================
# Step 1: Start Services
# ============================================================================

log_info "🚀 Starting database and services..."

cd "${PROJECT_ROOT}"

# Check if services are already running
if docker-compose ps | grep -q "Up"; then
    log_warn "Some services are already running. Restarting all services..."
    docker-compose down
fi

# Start PostgreSQL, Redis, and Meilisearch
docker-compose up -d postgres redis meilisearch

log_info "Waiting for services to be healthy..."
sleep 10

# Wait for PostgreSQL to be ready
until docker exec trackfraud-postgres pg_isready -U trackfraud -d trackfraud &> /dev/null; do
    log_info "Waiting for PostgreSQL to be ready..."
    sleep 2
done
log_success "PostgreSQL is ready!"

# Wait for Redis to be ready
until docker exec trackfraud-redis redis-cli ping &> /dev/null; do
    log_info "Waiting for Redis to be ready..."
    sleep 2
done
log_success "Redis is ready!"

# Wait for Meilisearch to be ready
until curl -s http://localhost:7700/health &> /dev/null; do
    log_info "Waiting for Meilisearch to be ready..."
    sleep 2
done
log_success "Meilisearch is ready!"

# ============================================================================
# Step 2: Run Database Migrations
# ============================================================================

log_info "📊 Running database migrations..."

docker-compose exec -T backend npm run db:migrate || {
    log_error "Database migration failed!"
    exit 1
}

log_success "Database migrations completed!"

# Seed the database with initial data (if seed script exists)
if [ -f "${PROJECT_ROOT}/scripts/seed-database.ts" ]; then
    log_info "🌱 Seeding database with initial data..."
    docker-compose exec -T backend npm run db:seed || {
        log_warn "Database seeding failed, but continuing..."
    }
fi

# ============================================================================
# Step 3: Run Full Data Ingestion Pipeline
# ============================================================================

log_info "📥 Starting full data ingestion pipeline..."
mkdir -p "${LOG_DIR}"

log_info "Ingestion logs will be saved to: ${INGEST_LOG}"

# Function to run ingestion for a category with timeout and retry logic
run_ingestion() {
    local categories=$1
    local max_retries=3
    local retry_count=0

    while [ $retry_count -lt $max_retries ]; do
        log_info "Running ingestion for: ${categories} (attempt $((retry_count + 1))/$max_retries)"

        if docker-compose exec -T backend npx tsx scripts/ingest-all.ts --categories "$categories" --full >> "${INGEST_LOG}" 2>&1; then
            log_success "Ingestion for ${categories} completed successfully!"
            return 0
        else
            retry_count=$((retry_count + 1))
            if [ $retry_count -lt $max_retries ]; then
                log_warn "Ingestion failed, retrying in 30 seconds..."
                sleep 30
            fi
        fi
    done

    log_error "Ingestion for ${categories} failed after $max_retries attempts!"
    return 1
}

# Create logs directory if it doesn't exist
mkdir -p "${LOG_DIR}"

# Run ingestion in priority order (HIGH → MEDIUM → LOW)

log_info "=== HIGH PRIORITY: Charities (~1.5M records, ~4 hours) ==="
run_ingestion "charities" || {
    log_error "Charity ingestion failed! Check ${INGEST_LOG} for details."
    exit 1
}

log_info "=== HIGH PRIORITY: Politics & Congress (~600 politicians + bills/votes) ==="
run_ingestion "politics" || {
    log_warn "Politics ingestion had issues, but continuing..."
}

log_info "=== HIGH PRIORITY: Sanctions & Exclusions (~90K records) ==="
run_ingestion "sanctions exclusions" || {
    log_warn "Sanctions/exclusions ingestion had issues, but continuing..."
}

log_info "=== MEDIUM PRIORITY: Healthcare & Corporate (~2 hours combined) ==="
run_ingestion "healthcare corporate" || {
    log_warn "Healthcare/corporate ingestion had issues, but continuing..."
}

log_info "=== LOW PRIORITY: Environmental, Consumer, Awards (background processing) ==="
run_ingestion "environment consumer awards" || {
    log_warn "Low-priority ingestion had issues, but continuing..."
}

# ============================================================================
# Step 4: Verify Ingestion Results
# ============================================================================

log_info "🔍 Verifying ingestion results..."

docker-compose exec -T backend npx prisma db execute --file query_ingestion_runs.sql >> "${INGEST_LOG}" 2>&1 || true

log_success "Ingestion pipeline completed!"

# ============================================================================
# Step 5: Set Up Background Worker (Optional)
# ============================================================================

read -p $'\nWould you like to set up the background worker for continuous ingestion? (y/n): ' SETUP_WORKER

if [ "$SETUP_WORKER" = "y" ]; then
    log_info "Setting up background worker..."

    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        log_warn "PM2 is not installed. Installing globally..."
        npm install -g pm2
    fi

    log_info "Starting background worker with PM2..."
    cd "${PROJECT_ROOT}"

    # Create logs directory for PM2
    mkdir -p "${LOG_DIR}/pm2"

    # Start the worker
    docker-compose exec -T backend npx tsx scripts/ingest-worker.ts >> "${LOG_DIR}/worker.log" 2>&1 &

    log_success "Background worker started!"
    log_info "To view logs: tail -f ${LOG_DIR}/worker.log"
    log_info "To stop worker: docker-compose kill celery-worker (if running in Docker)"
fi

# ============================================================================
# Final Summary
# ============================================================================

log_info "=============================================================================="
log_success "✅ SETUP AND INGESTION COMPLETE!"
log_info "=============================================================================="
echo ""
log_info "📊 Ingestion logs: ${INGEST_LOG}"
log_info "🔍 To check ingestion status:"
log_info "   docker-compose exec -T backend npx prisma db execute --file query_ingestion_runs.sql"
log_info ""
log_info "📈 To monitor SourceSystem table (last sync timestamps):"
log_info "   docker-compose exec -T backend npx prisma db execute --file query_source_system.sql"
log_info ""
log_info "🔎 To verify Meilisearch indexes:"
log_info "   curl http://localhost:7700/indexes"
log_info ""
log_info "🚀 Next steps:"
log_info "   1. Review ingestion logs for any errors"
log_info "   2. Set up background worker (if not done above)"
log_info "   3. Build Meilisearch indexes from ingested data"
log_info "   4. Connect frontend to live database queries"
log_info ""

# ============================================================================
# Cleanup (optional)
# ============================================================================

read -p $'\nKeep Docker services running? (y/n): ' KEEP_SERVICES

if [ "$KEEP_SERVICES" != "y" ]; then
    log_info "Stopping services..."
    docker-compose down
fi

log_success "All done! TrackFraud is now populated with real-world data!"
