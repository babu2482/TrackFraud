from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    """TrackFraud Backend Application settings"""
    
    # Database
    DATABASE_URL: str = "postgresql://trackfraud:trackfraud_dev_password@localhost:5432/trackfraud"
    
    # Redis (Celery)
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    
    # External API Keys
    CONGRESS_API_KEY: str = ""
    PROPUBLICA_API_KEY: str = ""
    FEDERAL_REGISTER_API_KEY: str = ""
    GOVTRACK_API_KEY: str = ""
    OPENCONGRESS_API_KEY: str = ""
    
    # Application
    APP_NAME: str = "TrackFraud Backend API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    
    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3001", "http://localhost:3000"]
    
    # AI/ML Configuration
    SPACY_MODEL: str = "en_core_web_sm"
    CLAIM_DETECTION_THRESHOLD: float = 0.75
    PATTERN_CONFIDENCE_MIN: float = 0.60
    SENTIMENT_ANALYSIS_ENABLED: bool = True
    
    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
