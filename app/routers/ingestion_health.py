"""
Ingestion Health Check Endpoint
Monitors the status of all ingestion scripts and their logs
"""

from fastapi import APIRouter, HTTPException
import os
import subprocess
from datetime import datetime
from typing import Dict, List, Optional

router = APIRouter()

PROJECT_ROOT = "/Volumes/MacBackup/TrackFraudProject"
LOGS_DIR = f"{PROJECT_ROOT}/logs"

def get_file_size_mb(filepath: str) -> float:
    """Get file size in MB"""
    try:
        return os.path.getsize(filepath) / (1024 * 1024)
    except OSError:
        return 0.0

def count_log_lines(filepath: str) -> int:
    """Count lines in a log file"""
    try:
        with open(filepath, 'r') as f:
            for i, _ in enumerate(f):
                pass
            return i + 1
    except (OSError, IOError):
        return 0

def check_process_running(pattern: str) -> bool:
    """Check if a process matching pattern is running"""
    try:
        result = subprocess.run(
            ['ps', 'aux'],
            capture_output=True,
            text=True
        )
        return any(pattern in line for line in result.stdout.split('\n'))
    except Exception:
        return False

@router.get("/health/ingestion")
async def get_ingestion_health():
    """Get overall ingestion system health"""

    # Check log files
    log_files = []
    total_logs_size_mb = 0

    if os.path.exists(LOGS_DIR):
        for filename in os.listdir(LOGS_DIR):
            if filename.endswith('.log'):
                filepath = os.path.join(LOGS_DIR, filename)
                size_mb = get_file_size_mb(filepath)
                line_count = count_log_lines(filepath)

                log_files.append({
                    "name": filename,
                    "size_mb": round(size_mb, 2),
                    "lines": line_count,
                    "status": "warning" if size_mb > 100 else "healthy"
                })

                total_logs_size_mb += size_mb

    # Check for running processes
    running_processes = []
    ingestion_scripts = [
        "ingest-irs-eo-bmf",
        "corporate-ingest",
        "healthcare-ingest",
        "charity-ingestion"
    ]

    for script in ingestion_scripts:
        if check_process_running(script):
            running_processes.append({
                "script": script,
                "running": True
            })

    # Determine overall health status
    critical_issues = []
    warnings = []

    if total_logs_size_mb > 200:
        critical_issues.append(f"Logs directory exceeds 200GB ({total_logs_size_mb:.1f}GB)")
    elif total_logs_size_mb > 100:
        warnings.append(f"Logs directory exceeds 100GB ({total_logs_size_mb:.1f}GB)")

    large_logs = [lf for lf in log_files if lf["size_mb"] > 50]
    if len(large_logs) > 3:
        warnings.append(f"Found {len(large_logs)} large log files (>50MB)")

    status = "healthy"
    if critical_issues:
        status = "critical"
    elif warnings:
        status = "warning"

    return {
        "status": status,
        "timestamp": datetime.now().isoformat(),
        "logs_directory_size_mb": round(total_logs_size_mb, 2),
        "log_files_count": len(log_files),
        "running_processes_count": len(running_processes),
        "critical_issues": critical_issues,
        "warnings": warnings,
        "largest_log_files": sorted(
            log_files,
            key=lambda x: x["size_mb"],
            reverse=True
        )[:10],
    }

@router.get("/health/ingestion/{script_name}")
async def get_script_health(script_name: str):
    """Get health status for a specific ingestion script"""

    log_file = os.path.join(LOGS_DIR, f"{script_name}.log")

    if not os.path.exists(log_file):
        raise HTTPException(status_code=404, detail=f"Script {script_name} not found")

    size_mb = get_file_size_mb(log_file)
    line_count = count_log_lines(log_file)
    is_running = check_process_running(script_name)

    # Check for recent errors in log (last 100 lines)
    recent_errors = 0
    try:
        with open(log_file, 'r') as f:
            lines = f.readlines()[-100:]
            recent_errors = sum(1 for line in lines if 'ERROR' in line or 'failed' in line.lower())
    except Exception:
        pass

    status = "healthy"
    if size_mb > 100:
        status = "warning"
    if recent_errors > 50:
        status = "critical"

    return {
        "script_name": script_name,
        "status": status,
        "log_file_size_mb": round(size_mb, 2),
        "total_lines": line_count,
        "recent_error_count": recent_errors,
        "is_running": is_running,
        "last_modified": datetime.fromtimestamp(
            os.path.getmtime(log_file)
        ).isoformat() if os.path.exists(log_file) else None,
    }

@router.post("/health/ingestion/cleanup")
async def cleanup_large_logs():
    """Trigger log cleanup (requires elevated privileges in production)"""

    try:
        result = subprocess.run(
            [f"{PROJECT_ROOT}/scripts/cleanup-disk-space.sh", "auto"],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )

        return {
            "success": result.returncode == 0,
            "output": result.stdout,
            "errors": result.stderr if result.returncode != 0 else ""
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
