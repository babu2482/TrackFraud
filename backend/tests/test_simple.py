"""
Simple test suite for Phase 1
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import date
from app.main import app
from app.database import Base, get_db
from app.models import Politician, Action, Evidence

# Test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_simple.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """Create a fresh database for each test"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db):
    """Create a test client"""
    def override_get_db():
        try:
            yield db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


def test_health_check(client):
    """Test health endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


def test_create_politician(db):
    """Test creating a politician"""
    politician = Politician(
        name="Test Senator",
        office="Senator",
        party="Democratic",
        term_start=date(2021, 1, 3),
    )
    db.add(politician)
    db.commit()
    assert politician.id is not None


def test_get_politicians(client, db):
    """Test getting politicians"""
    politician = Politician(
        name="Test Senator",
        office="Senator",
        party="Democratic",
        term_start=date(2021, 1, 3),
    )
    db.add(politician)
    db.commit()
    
    response = client.get("/api/v1/politicians")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1


def test_create_action(db):
    """Test creating an action"""
    politician = Politician(
        name="Test Senator",
        office="Senator",
        party="Democratic",
        term_start=date(2021, 1, 3),
    )
    db.add(politician)
    db.commit()
    
    action = Action(
        politician_id=politician.id,
        action_type="Bill Sponsorship",
        description="Test bill",
        action_date=date(2026, 3, 31),
        category="Legislative",
        jurisdiction="Federal"
    )
    db.add(action)
    db.commit()
    assert action.id is not None


def test_create_evidence(db):
    """Test creating evidence"""
    politician = Politician(
        name="Test Senator",
        office="Senator",
        party="Democratic",
        term_start=date(2021, 1, 3),
    )
    db.add(politician)
    db.commit()
    
    action = Action(
        politician_id=politician.id,
        action_type="Bill Sponsorship",
        description="Test bill",
        action_date=date(2026, 3, 31),
        category="Legislative",
        jurisdiction="Federal"
    )
    db.add(action)
    db.commit()
    
    evidence = Evidence(
        action_id=action.id,
        source_url="https://example.com",
        source_type="Test",
        reliability=1
    )
    db.add(evidence)
    db.commit()
    assert evidence.id is not None


def test_evidence_reliability_range(db):
    """Test that reliability is 1-4"""
    politician = Politician(
        name="Test Senator",
        office="Senator",
        party="Democratic",
        term_start=date(2021, 1, 3),
    )
    db.add(politician)
    db.commit()
    
    action = Action(
        politician_id=politician.id,
        action_type="Bill Sponsorship",
        description="Test bill",
        action_date=date(2026, 3, 31),
        category="Legislative",
        jurisdiction="Federal"
    )
    db.add(action)
    db.commit()
    
    for reliability in [1, 2, 3, 4]:
        evidence = Evidence(
            action_id=action.id,
            source_url="https://example.com",
            source_type="Test",
            reliability=reliability
        )
        db.add(evidence)
        db.commit()
    
    assert db.query(Evidence).count() == 4


if __name__ == "__main__":
    pytest.main([__file__, "-v"])