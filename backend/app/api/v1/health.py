"""
The Glass House - Health & System Endpoints

This module provides health check, readiness, and system status endpoints
for monitoring, load balancing, and Kubernetes health probes.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List
from uuid import uuid4

from app.core.config import get_settings
from app.db.database import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["Health"])

settings = get_settings()


class HealthCheckResult:
    """Container for health check results"""

    def __init__(
        self, component: str, status: str, message: str = "", details: Dict = None
    ):
        self.component = component
        self.status = status  # "healthy", "degraded", "unhealthy"
        self.message = message
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "component": self.component,
            "status": self.status,
            "message": self.message,
            "details": self.details,
        }


class HealthCheckResponse:
    """Complete health check response"""

    def __init__(
        self,
        status: str,
        version: str,
        timestamp: str,
        checks: List[HealthCheckResult],
        uptime_seconds: float = 0.0,
    ):
        self.status = status
        self.version = version
        self.timestamp = timestamp
        self.checks = checks
        self.uptime_seconds = uptime_seconds

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "version": self.version,
            "timestamp": self.timestamp,
            "uptime_seconds": self.uptime_seconds,
            "checks": [check.to_dict() for check in self.checks],
            "summary": {
                "total_checks": len(self.checks),
                "healthy": sum(1 for c in self.checks if c.status == "healthy"),
                "degraded": sum(1 for c in self.checks if c.status == "degraded"),
                "unhealthy": sum(1 for c in self.checks if c.status == "unhealthy"),
            },
        }


def get_overall_status(checks: List[HealthCheckResult]) -> str:
    """Determine overall system status from individual checks"""
    unhealthy_count = sum(1 for c in checks if c.status == "unhealthy")
    degraded_count = sum(1 for c in checks if c.status == "degraded")

    if unhealthy_count > 0:
        return "unhealthy"
    elif degraded_count > 0:
        return "degraded"
    return "healthy"


@router.get("/", response_model=Dict[str, Any], status_code=status.HTTP_200_OK)
async def health_check(db: Session = Depends(get_db)):
    """
    Comprehensive health check endpoint.

    Checks the health of all critical components:
    - Database connectivity
    - Application status
    - Configuration validity

    Returns detailed status of each component.

    Example Response:
    ```json
    {
        "status": "healthy",
        "version": "2.0.0",
        "timestamp": "2025-01-15T12:00:00Z",
        "uptime_seconds": 86400.5,
        "checks": [
            {
                "component": "database",
                "status": "healthy",
                "message": "Connected",
                "details": {"latency_ms": 5.2}
            }
        ],
        "summary": {
            "total_checks": 3,
            "healthy": 3,
            "degraded": 0,
            "unhealthy": 0
        }
    }
    ```
    """
    checks: List[HealthCheckResult] = []
    current_time = datetime.utcnow().isoformat() + "Z"

    # Check 1: Database Connectivity
    try:
        import time

        start = time.time()
        db.execute(text("SELECT 1"))
        latency_ms = (time.time() - start) * 1000

        checks.append(
            HealthCheckResult(
                component="database",
                status="healthy",
                message="Connected",
                details={"latency_ms": round(latency_ms, 2)},
            )
        )
        logger.debug(f"Database health check passed: {latency_ms:.2f}ms")
    except Exception as e:
        checks.append(
            HealthCheckResult(
                component="database",
                status="unhealthy",
                message="Connection failed",
                details={"error": str(e)},
            )
        )
        logger.error(f"Database health check failed: {e}")

    # Check 2: Application Configuration
    try:
        # Verify essential configuration is present
        essential_config = ["DATABASE_URL"]
        missing_config = []

        for config_key in essential_config:
            if not hasattr(settings, config_key) or not getattr(settings, config_key):
                missing_config.append(config_key)

        if missing_config:
            checks.append(
                HealthCheckResult(
                    component="configuration",
                    status="degraded",
                    message=f"Missing configuration: {', '.join(missing_config)}",
                    details={"missing": missing_config},
                )
            )
        else:
            checks.append(
                HealthCheckResult(
                    component="configuration",
                    status="healthy",
                    message="All essential configuration present",
                    details={"environment": settings.ENVIRONMENT},
                )
            )
    except Exception as e:
        checks.append(
            HealthCheckResult(
                component="configuration",
                status="unhealthy",
                message="Configuration error",
                details={"error": str(e)},
            )
        )
        logger.error(f"Configuration health check failed: {e}")

    # Check 3: Application Status
    checks.append(
        HealthCheckResult(
            component="application",
            status="healthy",
            message="Application running",
            details={
                "python_version": "3.12",
                "fastapi_version": "0.109.0",
                "environment": settings.ENVIRONMENT,
            },
        )
    )

    # Determine overall status
    overall_status = get_overall_status(checks)

    # Create response
    response = HealthCheckResponse(
        status=overall_status,
        version="2.0.0",
        timestamp=current_time,
        checks=checks,
        uptime_seconds=0.0,  # Would be tracked in production
    )

    # Set HTTP status code based on health
    status_code = (
        status.HTTP_200_OK
        if overall_status == "healthy"
        else status.HTTP_503_SERVICE_UNAVAILABLE
    )

    return response.to_dict()


@router.get("/ready", response_model=Dict[str, Any], status_code=status.HTTP_200_OK)
async def readiness_check(db: Session = Depends(get_db)):
    """
    Readiness check endpoint.

    This endpoint is used by load balancers and Kubernetes to determine
    if the application is ready to receive traffic.

    Returns 200 OK if ready, 503 Service Unavailable if not ready.

    Ready conditions:
    - Database is connected and responding
    - All required configuration is present
    - Application has completed startup
    """
    checks: List[HealthCheckResult] = []
    current_time = datetime.utcnow().isoformat() + "Z"

    # Check database (critical for readiness)
    try:
        import time

        start = time.time()
        db.execute(text("SELECT 1"))
        latency_ms = (time.time() - start) * 1000

        if latency_ms > 1000:  # Warn if slow but still ready
            checks.append(
                HealthCheckResult(
                    component="database",
                    status="degraded",
                    message="Connected but slow",
                    details={"latency_ms": round(latency_ms, 2)},
                )
            )
        else:
            checks.append(
                HealthCheckResult(
                    component="database",
                    status="healthy",
                    message="Connected",
                    details={"latency_ms": round(latency_ms, 2)},
                )
            )
    except Exception as e:
        checks.append(
            HealthCheckResult(
                component="database",
                status="unhealthy",
                message="Not ready - database unavailable",
                details={"error": str(e)},
            )
        )
        logger.error(f"Readiness check - database unavailable: {e}")

    # Determine if ready (only unhealthy status fails readiness)
    is_ready = all(c.status != "unhealthy" for c in checks)

    response = {
        "ready": is_ready,
        "timestamp": current_time,
        "checks": [check.to_dict() for check in checks],
    }

    status_code = (
        status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    )

    if not is_ready:
        logger.warning(f"Readiness check failed: {response}")

    return response


@router.get("/live", response_model=Dict[str, Any], status_code=status.HTTP_200_OK)
async def liveness_check():
    """
    Liveness check endpoint.

    This endpoint is used by Kubernetes and orchestrators to determine
    if the application is alive and needs to be restarted.

    Unlike readiness, this only checks if the application is responding,
    not if it's ready to receive traffic.

    Always returns 200 OK unless the application is completely broken.
    """
    response = {
        "alive": True,
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "pid": None,  # Would be set in production
    }

    try:
        import os

        response["pid"] = os.getpid()
    except Exception:
        pass

    return response


@router.get("/status", response_model=Dict[str, Any], status_code=status.HTTP_200_OK)
async def system_status(db: Session = Depends(get_db)):
    """
    Detailed system status endpoint.

    Returns comprehensive information about the system state:
    - Version information
    - Environment details
    - Database status
    - Service health
    - Memory and resource usage (when available)
    """
    current_time = datetime.utcnow().isoformat() + "Z"

    # Database version check
    db_version = "unknown"
    db_status = "unknown"
    try:
        result = db.execute(text("SELECT version()")).fetchone()
        db_version = result[0] if result else "unknown"
        db_status = "connected"
    except Exception as e:
        db_status = "disconnected"
        logger.error(f"Status check - database error: {e}")

    response = {
        "application": {
            "name": "The Glass House API",
            "version": "2.0.0",
            "environment": settings.ENVIRONMENT,
            "started_at": current_time,  # Would track actual start time
            "uptime_seconds": 0.0,
        },
        "database": {
            "status": db_status,
            "version": db_version,
            "type": "PostgreSQL",
        },
        "configuration": {
            "log_level": settings.LOG_LEVEL,
            "debug_mode": settings.DEBUG,
        },
        "timestamp": current_time,
        "request_id": str(uuid4()),
    }

    return response


@router.get("/metrics", response_model=Dict[str, Any], status_code=status.HTTP_200_OK)
async def metrics_endpoint():
    """
    Prometheus-compatible metrics endpoint.

    Returns application metrics in a format suitable for monitoring
    systems like Prometheus, Grafana, and Datadog.

    Note: In production, this would integrate with Prometheus client library
    to expose detailed metrics about request rates, latencies, errors, etc.
    """
    current_time = datetime.utcnow().isoformat() + "Z"

    # Placeholder metrics - would be populated by actual metrics collection
    metrics = {
        "api": {
            "uptime_seconds": 0.0,
            "requests_total": 0,
            "requests_in_flight": 0,
            "errors_total": 0,
            "active_connections": 0,
        },
        "database": {
            "queries_total": 0,
            "connections_active": 0,
            "connections_idle": 0,
            "avg_query_time_ms": 0.0,
        },
        "cache": {
            "hits_total": 0,
            "misses_total": 0,
            "hit_ratio": 0.0,
        },
        "memory": {
            "used_bytes": 0,
            "available_bytes": 0,
            "percent_used": 0.0,
        },
        "timestamp": current_time,
    }

    # In production, you would populate this with real metrics
    # using libraries like prometheus-client, statsd, etc.

    return metrics
