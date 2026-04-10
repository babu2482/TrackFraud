import logging
import os

from celery import Celery

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Celery configuration from environment variables
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

# Initialize Celery app
celery_app = Celery(
    "trackfraud",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

# Celery configuration
celery_app.conf.update(
    # Serialization settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    result_extended=True,
    # Timezone settings
    timezone="UTC",
    enable_utc=True,
    # Task settings
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max
    task_soft_time_limit=3500,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Worker settings
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    # Beat schedule for periodic tasks
    beat_schedule={
        "fetch-congress-data": {
            "task": "app.workers.tasks.fetch_congress_data",
            "schedule": 3600.0,  # Every hour
            "options": {
                "expires": 300
            },  # Expire after 5 minutes if task takes too long
        },
        "fetch-presidential-actions": {
            "task": "app.workers.tasks.fetch_presidential_actions",
            "schedule": 3600.0,  # Every hour
            "options": {"expires": 300},
        },
        "fetch-supreme-court-data": {
            "task": "app.workers.tasks.fetch_supreme_court_data",
            "schedule": 7200.0,  # Every 2 hours
            "options": {"expires": 600},
        },
        "daily-data-sync": {
            "task": "app.workers.tasks.initialize_database",
            "schedule": 86400.0,  # Once per day
            "options": {"expires": 600},
        },
    },
)

# Celery app auto-discovery of tasks
celery_app.autodiscover_tasks(
    lambda: [
        "app.workers",
    ],
    force=True,
)

logger.info(f"TrackFraud Celery app initialized with broker: {CELERY_BROKER_URL}")
