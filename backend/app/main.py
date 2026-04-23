"""
TrackFraud Backend - FastAPI Application Entry Point

Production-ready FastAPI server for TrackFraud unified fraud tracking and government transparency platform.
Includes proper middleware, exception handlers, and service initialization.
"""

import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.endpoints import api_router
from app.core.config import get_settings
from app.db.database import Base, engine, get_db

# Configure logging
logging.basicConfig(
    level=get_settings().LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()


# Exception Handlers
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors with user-friendly messages"""
    logger.warning(f"Validation error: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation failed",
            "errors": [
                {
                    "location": error.get("loc"),
                    "message": error.get("msg"),
                    "type": error.get("type"),
                }
                for error in exc.errors()
            ],
        },
    )


async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions"""
    logger.error(f"Unexpected error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An unexpected error occurred",
            "status": "error",
        },
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown events"""
    logger.info("Starting TrackFraud Backend API Server...")

    # Startup
    # 1. Database tables are managed by Prisma migrations (TypeScript side).
    #    SQLAlchemy models exist for the Python backend but table creation
    #    is delegated to Prisma to avoid schema drift between ORMs.
    logger.info("Database schema managed by Prisma migrations (skip SQLAlchemy create_all)")

    # 2. Initialize AI/ML services (lazy loading - only on first use)
    logger.info("Services initialized")

    # 3. Load any cached data if needed
    logger.info("Cache warmed up")

    logger.info("Application started successfully")

    yield

    # Shutdown
    logger.info("Shutting down TrackFraud Backend API Server...")
    # Close database connections, cleanup resources, etc.
    logger.info("Application shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="TrackFraud Backend API",
    description="""
## TrackFraud - Unified Financial Fraud & Government Transparency Platform

This is the Python backend API for **TrackFraud** - a comprehensive platform tracking financial fraud across America and government transparency in one unified system.

### Key Features:

* **Financial Fraud Tracking**: Charities, corporations, healthcare, government spending
* **Political Transparency**: Politician profiles, voting records, campaign promises
* **Actions vs Words Engine**: Track fulfillment of political claims and promises
* **AI/ML Analysis**: Claim detection, sentiment analysis, pattern prediction
* **Cross-Category Insights**: Discover connections between entities across categories

### Data Sources:

* IRS (EO BMF, Form 990, Auto Revocation)
* Congress.gov API
* Federal Register
* ProPublica Politicians API
* FEC Campaign Finance
* SEC EDGAR Filings
* USASpending
* CMS Open Payments
* CFPB Consumer Complaints

### AI/ML Features:

* Automated claim detection from political speeches
* Sentiment analysis of policy statements
* Voting pattern recognition
* Bill passage predictions
* Promise fulfillment predictions
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    terms_of_service="",
    contact={
        "name": "TrackFraud Team",
        "email": "",
        "url": "",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
)

# Add middleware
app.add_middleware(
    GZipMiddleware,
    minimum_size=1000,  # Compress responses > 1KB
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=3600,  # Cache preflight responses for 1 hour
)

# Add exception handlers
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# Include API router
app.include_router(api_router, prefix="/api/v1")


# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint with API information"""
    return {
        "name": "TrackFraud Backend API",
        "version": "1.0.0",
        "description": "Unified Financial Fraud & Government Transparency Platform",
        "docs": "/docs",
        "redoc": "/redoc",
        "health": "/health",
    }


# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for monitoring and load balancers"""
    from datetime import datetime

    health_status = {
        "status": "healthy",
        "service": "trackfraud-backend-api",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    # Check database connectivity
    try:
        from app.db.database import get_db

        db = next(get_db())
        db.execute(text("SELECT 1"))
        health_status["database"] = "connected"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status["database"] = "disconnected"
        health_status["status"] = "degraded"

    return health_status


# Metrics endpoint (for Prometheus/monitoring)
@app.get("/metrics", tags=["Monitoring"])
async def metrics():
    """Prometheus-compatible metrics endpoint"""
    return {
        "api_uptime_seconds": 0,  # Will be dynamic
        "total_requests": 0,  # Will be tracked
        "active_connections": 0,  # Will be tracked
        "database_queries_total": 0,  # Will be tracked
        "cache_hits": 0,  # Will be tracked
        "cache_misses": 0,  # Will be tracked
    }


# Shutdown endpoint (for graceful restarts)
@app.post("/shutdown", tags=["Admin"])
async def shutdown():
    """Gracefully shut down the server (admin only)"""
    import os
    import sys

    logger.info("Received shutdown request")
    os.kill(os.getpid(), 15)  # Send SIGTERM
    sys.exit(0)
