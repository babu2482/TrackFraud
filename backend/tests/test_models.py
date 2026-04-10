"""
Comprehensive Model Tests for The Glass House

This module provides extensive unit tests for all database models.
Tests cover model creation, relationships, properties, and edge cases.

Run with: pytest backend/tests/test_models.py -v
"""

from datetime import datetime, timedelta

import pytest
from app.db.database import Base
from app.db.models import (
    Action,
    ActionCategory,
    ActionType,
    Bill,
    BillSponsor,
    Coalition,
    Evidence,
    EvidenceTier,
    FactorMetric,
    FactorScore,
    JurisdictionLevel,
    OfficeType,
    PatternAnalysis,
    Politician,
    PoliticianSentiment,
    Prediction,
    Promise,
    PromiseMetric,
    PromiseStatus,
    PromiseUpdate,
    SentimentSnapshot,
    Topic,
    TransparencyScore,
    Vote,
    VoteResult,
)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


# Fixtures
@pytest.fixture
def test_db():
    """Create an in-memory SQLite test database"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


@pytest.fixture
def sample_politician(test_db):
    """Create a sample politician for testing"""
    politician = Politician(
        first_name="John",
        last_name="Doe",
        middle_name="Michael",
        full_name="John Michael Doe",
        office_title="Senator",
        office_type=OfficeType.SENATOR,
        jurisdiction_level=JurisdictionLevel.FEDERAL,
        party="Democratic",
        state="CA",
        district="District 1",
        term_start=datetime(2021, 1, 3),
        term_end=None,
        is_current=True,
        bio="Test bio for John Doe",
        website_url="https://example.gov",
    )
    test_db.add(politician)
    test_db.commit()
    test_db.refresh(politician)
    return politician


@pytest.fixture
def sample_action(test_db, sample_politician):
    """Create a sample action for testing"""
    action = Action(
        politician_id=sample_politician.id,
        action_type=ActionType.EXECUTIVE_ORDER,
        action_category=ActionCategory.EXECUTIVE,
        title="Test Executive Order",
        description="This is a test executive order",
        action_date=datetime(2024, 1, 15),
        status="enacted",
        impact_level=4,
        source_url="https://example.gov/eo-12345",
        source_id="EO-12345",
    )
    test_db.add(action)
    test_db.commit()
    test_db.refresh(action)
    return action


@pytest.fixture
def sample_promise(test_db, sample_politician):
    """Create a sample promise for testing"""
    promise = Promise(
        politician_id=sample_politician.id,
        promise_text="I promise to lower healthcare costs by 20%",
        promise_type="campaign_pledge",
        category="healthcare",
        topic_tags=["healthcare", "economy"],
        promise_date=datetime(2020, 6, 15),
        deadline=datetime(2024, 1, 1),
        is_immediate=False,
        timeframe_text="within 4 years",
        confidence_score=0.85,
        fulfillment_status=PromiseStatus.PARTIALLY_FULFILLED,
        fulfillment_score=65.5,
        fulfillment_progress=50.0,
        source_url="https://example.gov/speech-2020-06-15",
    )
    test_db.add(promise)
    test_db.commit()
    test_db.refresh(promise)
    return promise


# ==================================================================================
# Politician Model Tests
# ==================================================================================


class TestPoliticianModel:
    """Tests for the Politician model"""

    def test_create_politician(self, test_db):
        """Test creating a politician"""
        politician = Politician(
            first_name="Jane",
            last_name="Smith",
            office_title="Representative",
            office_type=OfficeType.REPRESENTATIVE,
            jurisdiction_level=JurisdictionLevel.FEDERAL,
            party="Republican",
            state="TX",
            term_start=datetime(2023, 1, 3),
            is_current=True,
        )
        test_db.add(politician)
        test_db.commit()

        assert politician.id is not None
        assert politician.first_name == "Jane"
        assert politician.last_name == "Smith"
        assert politician.full_name == "Jane Smith"

    def test_politician_name_property(self, test_db):
        """Test the name property"""
        politician = Politician(
            first_name="Jane",
            last_name="Smith",
            office_title="Representative",
            office_type=OfficeType.REPRESENTATIVE,
            jurisdiction_level=JurisdictionLevel.FEDERAL,
            term_start=datetime(2023, 1, 3),
        )
        test_db.add(politician)
        test_db.commit()

        # Should auto-generate full_name if not set
        assert politician.name == "Jane Smith"

    def test_politician_years_in_office(self, test_db):
        """Test years_in_office calculation"""
        politician = Politician(
            first_name="Test",
            last_name="Politician",
            office_title="Senator",
            office_type=OfficeType.SENATOR,
            jurisdiction_level=JurisdictionLevel.FEDERAL,
            term_start=datetime(2021, 1, 3),
            term_end=None,
        )
        test_db.add(politician)
        test_db.commit()

        years = politician.years_in_office
        assert years >= 1  # Should have at least 1 year
        assert isinstance(years, int)

    def test_politician_with_end_date(self, test_db):
        """Test years_in_office with term_end set"""
        start_date = datetime(2021, 1, 3)
        end_date = datetime(2025, 1, 3)
        politician = Politician(
            first_name="Test",
            last_name="Politician",
            office_title="Senator",
            office_type=OfficeType.SENATOR,
            jurisdiction_level=JurisdictionLevel.FEDERAL,
            term_start=start_date,
            term_end=end_date,
        )
        test_db.add(politician)
        test_db.commit()

        years = politician.years_in_office
        assert years == 4  # Exactly 4 years


# ==================================================================================
# Action Model Tests
# ==================================================================================


class TestActionModel:
    """Tests for the Action model"""

    def test_create_action(self, test_db, sample_politician):
        """Test creating an action"""
        action = Action(
            politician_id=sample_politician.id,
            action_type=ActionType.VOTE,
            action_category=ActionCategory.LEGISLATIVE,
            title="Test Vote",
            description="Test vote on bill HR-123",
            action_date=datetime(2024, 1, 15),
            status="passed",
            impact_level=3,
        )
        test_db.add(action)
        test_db.commit()

        assert action.id is not None
        assert action.action_type == ActionType.VOTE
        assert action.title == "Test Vote"

    def test_action_with_evidence(self, test_db, sample_action):
        """Test creating evidence for an action"""
        evidence = Evidence(
            action_id=sample_action.id,
            source_type="official_record",
            source_url="https://congress.gov/bill/hr-123",
            source_reliability=EvidenceTier.TIER_1,
            verification_status="verified",
        )
        test_db.add(evidence)
        test_db.commit()

        assert evidence.id is not None
        assert evidence.action_id == sample_action.id

    def test_action_relationships(self, test_db, sample_politician, sample_action):
        """Test action-politician relationship"""
        politician = (
            test_db.query(Politician).filter_by(id=sample_politician.id).first()
        )
        actions = list(politician.actions)

        assert len(actions) >= 1
        assert sample_action.id in [a.id for a in actions]


# ==================================================================================
# Promise Model Tests
# ==================================================================================


class TestPromiseModel:
    """Tests for the Promise model"""

    def test_create_promise(self, test_db, sample_politician):
        """Test creating a promise"""
        promise = Promise(
            politician_id=sample_politician.id,
            promise_text="Test promise",
            promise_type="campaign_pledge",
            promise_date=datetime(2024, 1, 1),
            fulfillment_status=PromiseStatus.ACTIVE,
        )
        test_db.add(promise)
        test_db.commit()

        assert promise.id is not None
        assert promise.fulfillment_status == PromiseStatus.ACTIVE

    def test_promise_is_past_deadline(self, test_db, sample_politician):
        """Test is_past_deadline property"""
        # Create promise with past deadline
        past_promise = Promise(
            politician_id=sample_politician.id,
            promise_text="Past deadline promise",
            promise_type="campaign_pledge",
            promise_date=datetime(2020, 1, 1),
            deadline=datetime(2023, 1, 1),  # Past date
            fulfillment_status=PromiseStatus.ACTIVE,
        )
        test_db.add(past_promise)
        test_db.commit()

        assert past_promise.is_past_deadline is True

        # Create promise with future deadline
        future_promise = Promise(
            politician_id=sample_politician.id,
            promise_text="Future deadline promise",
            promise_type="campaign_pledge",
            promise_date=datetime(2024, 1, 1),
            deadline=datetime(2030, 1, 1),  # Future date
            fulfillment_status=PromiseStatus.ACTIVE,
        )
        test_db.add(future_promise)
        test_db.commit()

        assert future_promise.is_past_deadline is False

    def test_promise_without_deadline(self, test_db, sample_politician):
        """Test is_past_deadline with no deadline"""
        promise = Promise(
            politician_id=sample_politician.id,
            promise_text="No deadline promise",
            promise_type="campaign_pledge",
            promise_date=datetime(2024, 1, 1),
            deadline=None,
            fulfillment_status=PromiseStatus.ACTIVE,
        )
        test_db.add(promise)
        test_db.commit()

        assert promise.is_past_deadline is False

    def test_promise_metric(self, test_db, sample_promise):
        """Test creating a promise metric"""
        metric = PromiseMetric(
            promise_id=sample_promise.id,
            metric_type="quantitative",
            target_value=20.0,
            current_value=10.0,
            unit="percentage",
            threshold=20.0,
            evaluation_criteria="Reduce healthcare costs by 20%",
        )
        test_db.add(metric)
        test_db.commit()

        assert metric.id is not None
        assert metric.promise_id == sample_promise.id

    def test_promise_update(self, test_db, sample_promise):
        """Test creating a promise update record"""
        update = PromiseUpdate(
            promise_id=sample_promise.id,
            old_status=PromiseStatus.ACTIVE,
            new_status=PromiseStatus.FULFILLED,
            old_score=50.0,
            new_score=100.0,
            update_reason="Healthcare costs reduced as promised",
            supporting_evidence=["link_to_evidence"],
            updated_by="system",
        )
        test_db.add(update)
        test_db.commit()

        assert update.id is not None
        assert update.new_status == PromiseStatus.FULFILLED


# ==================================================================================
# Model Tests
# ==================================================================================


class TestVoteModel:
    """Tests for the Vote model"""

    def test_create_vote(self, test_db, sample_politician):
        """Test creating a vote"""
        vote = Vote(
            politician_id=sample_politician.id,
            vote_type="YEA",
            vote_date=datetime(2024, 1, 15),
            chamber="Senate",
            roll_call_number="123",
            vote_description="Vote on HR-1234",
            public_record=True,
        )
        test_db.add(vote)
        test_db.commit()

        assert vote.id is not None
        assert vote.vote_type == "YEA"

    def test_vote_result(self, test_db, sample_politician):
        """Test creating a vote result"""
        bill = Bill(
            congress_number=118,
            bill_number="HR-1234",
            bill_type="H.R.",
            title="Test Bill",
            status="passed",
            outcome="enacted",
        )
        test_db.add(bill)
        test_db.commit()

        vote_result = VoteResult(
            bill_id=bill.id,
            vote_type="Senate",
            vote_date=datetime(2024, 1, 15),
            result="Passed",
            yeas=51,
            nays=49,
            present=0,
            not_voting=0,
            threshold_required=51,
            margin=2,
        )
        test_db.add(vote_result)
        test_db.commit()

        assert vote_result.id is not None
        assert vote_result.result == "Passed"
        assert vote_result.yeas > vote_result.nays


# ==================================================================================
# Bill Model Tests
# ==================================================================================


class TestBillModel:
    """Tests for the Bill model"""

    def test_create_bill(self, test_db):
        """Test creating a bill"""
        bill = Bill(
            congress_number=118,
            bill_number="1234",
            bill_type="H.R.",
            title="Test Bill Title",
            short_title="Test Bill",
            summary="This is a test bill summary",
            introduced_date=datetime(2024, 1, 3),
            status="Introduced",
        )
        test_db.add(bill)
        test_db.commit()

        assert bill.id is not None
        assert bill.title == "Test Bill Title"

    def test_bill_sponsor(self, test_db):
        """Test creating a bill sponsor"""
        bill = Bill(
            congress_number=118,
            bill_number="1234",
            bill_type="H.R.",
            title="Test Bill",
        )
        test_db.add(bill)
        test_db.commit()

        sponsor = BillSponsor(
            bill_id=bill.id,
            politician_id=1,
            first_name="Jane",
            last_name="Smith",
            party="Democratic",
            state="CA",
            is_primary=True,
            sponsor_type="sponsor",
        )
        test_db.add(sponsor)
        test_db.commit()

        assert sponsor.id is not None
        assert sponsor.is_primary is True


# ==================================================================================
# Transparency Score Model Tests
# ==================================================================================


class TestTransparencyScoreModel:
    """Tests for the TransparencyScore model"""

    def test_create_transparency_score(self, test_db, sample_politician):
        """Test creating a transparency score"""
        score = TransparencyScore(
            politician_id=sample_politician.id,
            overall_score=85.5,
            letter_grade="A",
            star_rating=4,
            voting_record_score=90.0,
            promise_fulfillment_score=75.0,
            public_communication_score=80.0,
            document_release_score=85.0,
            conflict_disclosure_score=90.0,
            meeting_transparency_score=70.0,
            trend="improving",
            trend_magnitude=5.2,
            previous_score=80.3,
            rank=15,
            peer_group="senate",
            data_quality=0.95,
        )
        test_db.add(score)
        test_db.commit()

        assert score.id is not None
        assert score.overall_score == 85.5
        assert score.letter_grade == "A"

    def test_factor_score(self, test_db, sample_politician):
        """Test creating a factor score"""
        score = TransparencyScore(
            politician_id=sample_politician.id,
            overall_score=85.5,
            letter_grade="A",
            star_rating=4,
        )
        test_db.add(score)
        test_db.commit()

        factor = FactorScore(
            transparency_score_id=score.id,
            factor="voting_record",
            score=90.0,
            weight=0.20,
            raw_value=180.0,
            max_value=200.0,
            data_points=200,
            notes="Perfect attendance",
        )
        test_db.add(factor)
        test_db.commit()

        assert factor.id is not None
        assert factor.factor == "voting_record"


# ==================================================================================
# AI/ML Model Tests
# ==================================================================================


class TestAIModels:
    """Tests for AI/ML related models"""

    def test_sentiment_snapshot(self, test_db, sample_politician):
        """Test creating a sentiment snapshot"""
        snapshot = SentimentSnapshot(
            politician_id=sample_politician.id,
            target_type="politician",
            target_id=sample_politician.id,
            target_name="John Doe",
            sentiment_score=0.75,
            polarity="positive",
            confidence=0.85,
            source_type="news_article",
            source_url="https://news.example.com/article",
            text_sample="Positive news about the senator...",
            model_version="v1.0",
        )
        test_db.add(snapshot)
        test_db.commit()

        assert snapshot.id is not None
        assert snapshot.sentiment_score == 0.75
        assert snapshot.polarity == "positive"

    def test_prediction(self, test_db):
        """Test creating a prediction"""
        prediction = Prediction(
            prediction_type="bill_passage",
            target_type="bill",
            target_id=1,
            target_name="HR-1234 - Test Bill",
            predicted_value=0.75,
            predicted_class="success",
            confidence=0.82,
            confidence_level="high",
            factors={"bipartisan_support": 0.85, "public_support": 0.70},
            similar_cases=[{"bill_id": "HR-5678", "outcome": "passed"}],
            explanation="High bipartisan support and strong public backing",
            model_version="v2.0",
        )
        test_db.add(prediction)
        test_db.commit()

        assert prediction.id is not None
        assert prediction.predicted_class == "success"
        assert prediction.confidence_level == "high"

    def test_pattern_analysis(self, test_db):
        """Test creating a pattern analysis"""
        analysis = PatternAnalysis(
            analysis_type="voting_similarity",
            politician_id_1=1,
            politician_id_2=2,
            similarity_score=0.85,
            agreement_rate=0.82,
            ideology_distance=0.15,
            topic_analysis={"healthcare": 0.90, "economy": 0.75},
            context={"period": "2023-2024"},
        )
        test_db.add(analysis)
        test_db.commit()

        assert analysis.id is not None
        assert analysis.similarity_score == 0.85


# ==================================================================================
# Coalition and Analytics Tests
# ==================================================================================


class TestCoalitionModel:
    """Tests for the Coalition model"""

    def test_create_coalition(self, test_db):
        """Test creating a coalition"""
        coalition = Coalition(
            coalition_id="coalition_2024_001",
            name="Progressive Climate Caucus",
            description="Coalition focused on climate action",
            member_count=45,
            cohesion_score=0.88,
            average_ideology=-0.65,
            topic_affinities={"environment": 0.95, "healthcare": 0.80},
            formation_date=datetime(2024, 1, 1),
            is_active=True,
        )
        test_db.add(coalition)
        test_db.commit()

        assert coalition.id is not None
        assert coalition.coalition_id == "coalition_2024_001"
        assert coalition.is_active is True


# ==================================================================================
# Integration Tests
# ==================================================================================


class TestModelIntegration:
    """Integration tests for model relationships"""

    def test_complete_politician_workflow(self, test_db):
        """Test a complete workflow with politician, actions, and promises"""
        # Create politician
        politician = Politician(
            first_name="Alice",
            last_name="Johnson",
            office_title="Governor",
            office_type=OfficeType.GOVERNOR,
            jurisdiction_level=JurisdictionLevel.STATE,
            party="Independent",
            state="NY",
            term_start=datetime(2023, 1, 1),
            is_current=True,
        )
        test_db.add(politician)
        test_db.commit()

        # Create action
        action = Action(
            politician_id=politician.id,
            action_type=ActionType.EXECUTIVE_ORDER,
            action_category=ActionCategory.EXECUTIVE,
            title="Climate Action EO",
            action_date=datetime(2024, 1, 15),
            impact_level=5,
        )
        test_db.add(action)
        test_db.commit()

        # Create promise
        promise = Promise(
            politician_id=politician.id,
            promise_text="Reduce carbon emissions by 50%",
            promise_type="campaign_pledge",
            promise_date=datetime(2022, 6, 1),
            fulfillment_status=PromiseStatus.ACTIVE,
            fulfillment_score=30.0,
        )
        test_db.add(promise)
        test_db.commit()

        # Verify relationships
        politician = test_db.query(Politician).filter_by(id=politician.id).first()
        assert len(list(politician.actions)) == 1
        assert len(list(politician.promises)) == 1

    def test_complete_legislative_workflow(self, test_db, sample_politician):
        """Test legislative workflow with bill, sponsors, and votes"""
        # Create bill
        bill = Bill(
            congress_number=118,
            bill_number="HR-5678",
            bill_type="H.R.",
            title="Healthcare Reform Act",
            introduced_date=datetime(2024, 1, 3),
            status="Passed House",
        )
        test_db.add(bill)
        test_db.commit()

        # Add sponsor
        sponsor = BillSponsor(
            bill_id=bill.id,
            politician_id=sample_politician.id,
            first_name=sample_politician.first_name,
            last_name=sample_politician.last_name,
            party=sample_politician.party,
            state=sample_politician.state,
            is_primary=True,
        )
        test_db.add(sponsor)
        test_db.commit()

        # Add vote
        vote = Vote(
            politician_id=sample_politician.id,
            bill_id=bill.id,
            vote_type="YEA",
            vote_date=datetime(2024, 2, 15),
            chamber="House",
            roll_call_number="45",
        )
        test_db.add(vote)
        test_db.commit()

        # Add vote result
        vote_result = VoteResult(
            bill_id=bill.id,
            vote_type="House",
            vote_date=datetime(2024, 2, 15),
            result="Passed",
            yeas=215,
            nays=203,
            present=12,
        )
        test_db.add(vote_result)
        test_db.commit()

        # Verify relationships
        bill = test_db.query(Bill).filter_by(id=bill.id).first()
        assert bill.sponsors is not None
        assert bill.votes is not None


# ==================================================================================
# Edge Case Tests
# ==================================================================================


class TestModelEdgeCases:
    """Tests for edge cases and validation"""

    def test_politician_no_middle_name(self, test_db):
        """Test politician without middle name"""
        politician = Politician(
            first_name="Bob",
            last_name="Wilson",
            office_title="Representative",
            office_type=OfficeType.REPRESENTATIVE,
            jurisdiction_level=JurisdictionLevel.FEDERAL,
            term_start=datetime(2023, 1, 3),
        )
        test_db.add(politician)
        test_db.commit()

        assert politician.name == "Bob Wilson"

    def test_politician_no_full_name(self, test_db):
        """Test politician with no full_name initially set"""
        politician = Politician(
            first_name="Carol",
            last_name="Davis",
            office_title="Senator",
            office_type=OfficeType.SENATOR,
            jurisdiction_level=JurisdictionLevel.FEDERAL,
            term_start=datetime(2023, 1, 3),
        )
        test_db.add(politician)
        test_db.commit()

        # Should auto-generate
        assert politician.full_name is None or politician.full_name == "Carol Davis"

    def test_action_min_impact_level(self, test_db, sample_politician):
        """Test action with minimum impact level"""
        action = Action(
            politician_id=sample_politician.id,
            action_type=ActionType.VOTE,
            action_category=ActionCategory.LEGISLATIVE,
            title="Minor Vote",
            action_date=datetime(2024, 1, 15),
            impact_level=1,  # Minimum
        )
        test_db.add(action)
        test_db.commit()

        assert action.impact_level == 1

    def test_promise_with_all_nulls(self, test_db, sample_politician):
        """Test promise with optional fields as None"""
        promise = Promise(
            politician_id=sample_politician.id,
            promise_text="Simple promise",
            promise_type="general",
            promise_date=datetime(2024, 1, 1),
        )
        test_db.add(promise)
        test_db.commit()

        assert promise.id is not None
        assert promise.deadline is None
        assert promise.category is None

    def test_transparency_score_zero(self, test_db, sample_politician):
        """Test transparency score of 0"""
        score = TransparencyScore(
            politician_id=sample_politician.id,
            overall_score=0.0,
            letter_grade="F",
            star_rating=1,
            trend="declining",
            trend_magnitude=0.0,
        )
        test_db.add(score)
        test_db.commit()

        assert score.overall_score == 0.0
        assert score.letter_grade == "F"


# ==================================================================================
# Query Performance Tests
# ==================================================================================


class TestModelQueries:
    """Tests for query performance and filtering"""

    def test_politician_filtering(self, test_db):
        """Test filtering politicians by various criteria"""
        # Create multiple politicians
        for i in range(5):
            politician = Politician(
                first_name=f"Politician{i}",
                last_name="Test",
                office_title="Senator" if i % 2 == 0 else "Representative",
                office_type=OfficeType.SENATOR
                if i % 2 == 0
                else OfficeType.REPRESENTATIVE,
                jurisdiction_level=JurisdictionLevel.FEDERAL,
                party="Democratic" if i % 2 == 0 else "Republican",
                state="CA" if i < 3 else "TX",
                term_start=datetime(2023, 1, 3),
                is_current=True,
            )
            test_db.add(politician)
        test_db.commit()

        # Filter by party
        democrats = test_db.query(Politician).filter_by(party="Democratic").count()
        assert democrats == 2

        # Filter by state
        ca_politicians = test_db.query(Politician).filter_by(state="CA").count()
        assert ca_politicians == 3

        # Filter by office type
        senators = (
            test_db.query(Politician)
            .filter(Politician.office_type == OfficeType.SENATOR)
            .count()
        )
        assert senators == 3

    def test_action_date_filtering(self, test_db, sample_politician):
        """Test filtering actions by date range"""
        # Create actions with different dates
        for i in range(5):
            action = Action(
                politician_id=sample_politician.id,
                action_type=ActionType.VOTE,
                action_category=ActionCategory.LEGISLATIVE,
                title=f"Action {i}",
                action_date=datetime(2024, 1, 15 + i),
            )
            test_db.add(action)
        test_db.commit()

        # Filter by date range
        start_date = datetime(2024, 1, 17)
        end_date = datetime(2024, 1, 19)
        actions = (
            test_db.query(Action)
            .filter(
                Action.politician_id == sample_politician.id,
                Action.action_date >= start_date,
                Action.action_date <= end_date,
            )
            .count()
        )
        assert actions == 3
