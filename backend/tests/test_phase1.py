"""
Phase 1 Test Suite - Comprehensive tests for foundation
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
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_p1.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db):
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


class TestModels:
    def test_politician_creation(self, db):
        p = Politician(name="Test", office="Senator", party="D", term_start=date(2021, 1, 3))
        db.add(p)
        db.commit()
        assert p.id is not None

    def test_action_creation(self, db):
        p = Politician(name="Test", office="Senator", party="D", term_start=date(2021, 1, 3))
        db.add(p)
        db.commit()
        a = Action(politician_id=p.id, action_type="Bill", description="Test", action_date=date(2026, 3, 31), category="Legislative", jurisdiction="Federal")
        db.add(a)
        db.commit()
        assert a.id is not None

    def test_evidence_creation(self, db):
        p = Politician(name="Test", office="Senator", party="D", term_start=date(2021, 1, 3))
        db.add(p)
        db.commit()
        a = Action(politician_id=p.id, action_type="Bill", description="Test", action_date=date(2026, 3, 31), category="Legislative", jurisdiction="Federal")
        db.add(a)
        db.commit()
        e = Evidence(action_id=a.id, source_url="https://test.com", source_type="Test", reliability=1)
        db.add(e)
        db.commit()
        assert e.id is not None


class TestAPI:
    def test_health(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    def test_get_politicians(self, client, db):
        p = Politician(name="Test", office="Senator", party="D", term_start=date(2021, 1, 3))
        db.add(p)
        db.commit()
        r = client.get("/api/v1/politicians")
        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_get_politician_by_id(self, client, db):
        p = Politician(name="Test", office="Senator", party="D", term_start=date(2021, 1, 3))
        db.add(p)
        db.commit()
        r = client.get(f"/api/v1/politicians/{p.id}")
        assert r.status_code == 200
        assert r.json()["name"] == "Test"

    def test_get_politician_not_found(self, client):
        r = client.get("/api/v1/politicians/9999")
        assert r.status_code == 404

    def test_filter_by_party(self, client, db):
        p1 = Politician(name="D1", office="Senator", party="Democratic", term_start=date(2021, 1, 3))
        p2 = Politician(name="R1", office="Senator", party="Republican", term_start=date(2021, 1, 3))
        db.add(p1)
        db.add(p2)
        db.commit()
        r = client.get("/api/v1/politicians?party=Democratic")
        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_today_endpoint(self, client, db):
        p = Politician(name="Test", office="Senator", party="D", term_start=date(2021, 1, 3), term_end=date(2027, 1, 3))
        db.add(p)
        db.commit()
        r = client.get("/api/v1/today")
        assert r.status_code == 200
        assert "date" in r.json()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])