#!/usr/bin/env python3
"""
Database initialization script for Politicians API
Run this after starting PostgreSQL with docker-compose
"""

import os
import sys
from sqlalchemy import create_engine
from app.database import Base

def init_database():
    """Initialize the database tables"""
    database_url = os.getenv("DATABASE_URL", "postgresql://politicians:politicians@localhost:5432/politicians")
    
    print(f"Connecting to database: {database_url}")
    
    try:
        engine = create_engine(database_url)
        print("Creating tables...")
        Base.metadata.create_all(bind=engine)
        print("✓ Database initialized successfully!")
        return True
    except Exception as e:
        print(f"✗ Error initializing database: {e}")
        return False

if __name__ == "__main__":
    success = init_database()
    sys.exit(0 if success else 1)