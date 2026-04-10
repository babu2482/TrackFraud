"""
Pytest configuration and shared fixtures
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db

# Test database configuration
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session")
def test_engine():
    """Create test database engine"""
    return engine


@pytest.fixture(scope="function")
def db(test_engine):
    """Create a fresh database for each test"""
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    try:
        yield db
        db.rollback()
    finally:
        db.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client(db):
    """Create a test client with database dependency override"""
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


@pytest.fixture
def sample_politician(db):
    """Create a sample politician for testing"""
    from app.models import Politician
    from datetime import date
    
    politician = Politician(
        name="Test Senator",
        office="Senator",
        district="CA",
        party="Democratic",
        term_start=date(2021, 1, 3),
        term_end=date(2027, 1, 3),
        bio_url="https://example.com/bio",
        image_url="https://example.com/image.jpg"
    )
    db.add(politician)
    db.commit()
    db.refresh(politician)
    return politician


@pytest.fixture
def sample_action(db, sample_politician):
    """Create a sample action for testing"""
    from app.models import Action
    from datetime import date
    
    action = Action(
        politician_id=sample_politician.id,
        action_type="Bill Sponsorship",
        description="Sponsored healthcare reform bill",
        action_date=date(2026, 3, 31),
        status="active",
        category="Legislative",
        jurisdiction="Federal"
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


@pytest.fixture
def sample_evidence(db, sample_action):
    """Create a sample evidence record for testing"""
    from app.models import Evidence
    
    evidence = Evidence(
        action_id=sample_action.id,
        source_url="https://www.congress.gov/bill/119th-congress/senate-bill/1234",
        source_type="Congress.gov",
        reliability=1,
        extracted_data={"bill_number": "S.1234", "congress": "119th"}
    )
    db.add(evidence)
    db.commit()
    db.refresh(evidence)
    return evidence