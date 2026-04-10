"""
The Glass House - Application Configuration

Comprehensive settings management for the government transparency platform.
"""

from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    APP_NAME: str = "The Glass House API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"  # development, staging, production
    LOG_LEVEL: str = "INFO"

    # API Settings
    API_PREFIX: str = "/api/v1"
    API_DOCS_URL: str = "/docs"
    API_REDOC_URL: str = "/redoc"

    # Database
    DATABASE_URL: str = (
        "postgresql://postgres:postgres@localhost:5432/whatdidmypoliticiando"
    )
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # Redis & Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    CELERY_TASK_QUEUE: str = "tasks"

    # Authentication & Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days
    JWT_ISSUER: str = "theglasshouse.org"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["*"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100  # requests per minute
    RATE_LIMIT_PERIOD: str = "1m"

    # External API Keys
    CONGRESS_API_KEY: str = ""
    PROPUBLICA_API_KEY: str = ""
    FEDERAL_REGISTER_API_KEY: str = ""

    # AI/ML Settings
    NLP_MODEL_PATH: str = "./models"
    NLP_BATCH_SIZE: int = 32
    MAX_CLAIMS_PER_DOCUMENT: int = 10

    # Caching
    CACHE_TTL_DEFAULT: int = 300  # 5 minutes
    CACHE_TTL_POLITICIAN: int = 600  # 10 minutes
    CACHE_TTL_BILL: int = 1800  # 30 minutes

    # File Upload
    MAX_FILE_SIZE_MB: int = 10
    ALLOWED_FILE_TYPES: List[str] = [".pdf", ".docx", ".txt", ".csv", ".json"]

    # Security Headers
    SECURITY_HEADERS_ENABLED: bool = True

    # Monitoring
    PROMETHEUS_ENABLED: bool = False
    PROMETHEUS_PORT: int = 9090

    # Email (for notifications)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: str = "noreply@theglasshouse.org"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Global settings instance
settings = get_settings()
