"""
Comprehensive Database Models for The Glass House
=================================================

This module defines all database models needed for tracking politician actions,
campaign promises, transparency scores, and AI-powered analytics.
"""

import enum
from datetime import datetime

from app.db.database import Base
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

# ==========================================================================
# Association Tables (Many-to-Many Relationships)
# ==========================================================================

politician_topics = Table(
    "politician_topics",
    Base.metadata,
    Column("politician_id", Integer, ForeignKey("politicians.id"), primary_key=True),
    Column("topic_id", Integer, ForeignKey("topics.id"), primary_key=True),
)

action_topics = Table(
    "action_topics",
    Base.metadata,
    Column("action_id", Integer, ForeignKey("actions.id"), primary_key=True),
    Column("topic_id", Integer, ForeignKey("topics.id"), primary_key=True),
)

politician_coalitions = Table(
    "politician_coalitions",
    Base.metadata,
    Column("politician_id", Integer, ForeignKey("politicians.id"), primary_key=True),
    Column("coalition_id", Integer, ForeignKey("coalitions.id"), primary_key=True),
)


# ==========================================================================
# Enums for Type Safety
# ==========================================================================


class OfficeType(str, enum.Enum):
    """Types of political offices"""

    PRESIDENT = "president"
    VICE_PRESIDENT = "vice_president"
    SENATOR = "senator"
    REPRESENTATIVE = "representative"
    GOVERNOR = "governor"
    MAYOR = "mayor"
    JUDGE = "judge"
    JUSTICE = "justice"


class JurisdictionLevel(str, enum.Enum):
    """Levels of government"""

    FEDERAL = "federal"
    STATE = "state"
    LOCAL = "local"
    COUNTY = "county"
    CITY = "city"


class ActionCategory(str, enum.Enum):
    """Categories of government actions"""

    EXECUTIVE = "executive"
    LEGISLATIVE = "legislative"
    JUDICIAL = "judicial"
    ADMINISTRATIVE = "administrative"


class ActionType(str, enum.Enum):
    """Types of actions"""

    VOTE = "vote"
    EXECUTIVE_ORDER = "executive_order"
    PROCLAMATION = "proclamation"
    BILL_SPONSORSHIP = "bill_sponsorship"
    BILL_CO_SPONSORSHIP = "bill_co_sponsorship"
    SPEECH = "speech"
    PRESS_RELEASE = "press_release"
    NOMINATION = "nomination"
    APPOINTMENT = "appointment"
    VETO = "veto"
    SIGNING = "signing"


class PromiseStatus(str, enum.Enum):
    """Status of campaign promises"""

    ACTIVE = "active"
    FULFILLED = "fulfilled"
    PARTIALLY_FULFILLED = "partially_fulfilled"
    DELAYED = "delayed"
    BROKEN = "broken"
    ABANDONED = "abandoned"
    PENDING = "pending"


class EvidenceTier(str, enum.Enum):
    """Reliability tiers for evidence sources"""

    TIER_1 = "tier_1"  # Official government records
    TIER_2 = "tier_2"  # Administrative records
    TIER_3 = "tier_3"  # Verified media
    TIER_4 = "tier_4"  # Self-reported


class SentimentPolarity(str, enum.Enum):
    """Sentiment classification"""

    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


# ==========================================================================
# Core Models
# ==========================================================================


class Politician(Base):
    """
    Generic politician model for all levels of government.

    This is the central model that replaces the more limited President model,
    allowing us to track politicians at federal, state, and local levels.
    """

    __tablename__ = "politicians"

    id = Column(Integer, primary_key=True, index=True)

    # Basic Info
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    middle_name = Column(String(100))
    full_name = Column(String(200), index=True)

    # Office Information
    office_title = Column(String(100), nullable=False)  # President, Senator, etc.
    office_type = Column(Enum(OfficeType), nullable=False)
    jurisdiction_level = Column(Enum(JurisdictionLevel), nullable=False)

    # Geographic/Political Info
    party = Column(String(100), index=True)
    state = Column(String(50), index=True)
    district = Column(String(50))
    jurisdiction_name = Column(String(200))  # State name for state-level, etc.

    # Term Information
    term_start = Column(DateTime, nullable=False, index=True)
    term_end = Column(DateTime, index=True)
    is_current = Column(Boolean, default=True, index=True)

    # Contact & Bio
    bio = Column(Text)
    birth_date = Column(DateTime)
    education = Column(Text)
    website_url = Column(String(500))
    contact_email = Column(String(200))
    social_media = Column(JSON)  # Twitter, Facebook, etc.

    # Metadata (renamed from 'metadata' due to SQLAlchemy reserved name)
    extra_metadata = Column(JSON)  # Additional flexible data
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    actions = relationship("Action", back_populates="politician", lazy="dynamic")
    promises = relationship("Promise", back_populates="politician", lazy="dynamic")
    votes = relationship("Vote", back_populates="politician", lazy="dynamic")
    transparency_scores = relationship(
        "TransparencyScore", back_populates="politician", lazy="dynamic"
    )
    sentiments = relationship(
        "SentimentSnapshot", back_populates="politician", lazy="dynamic"
    )
    topics = relationship("Topic", secondary=politician_topics, backref="politicians")

    # Unique index for politician identification
    __table_args__ = (
        Index(
            "idx_politician_name_office",
            "full_name",
            "office_title",
            "jurisdiction_level",
        ),
        Index("idx_politician_current", "is_current", "office_type"),
    )

    @property
    def name(self) -> str:
        """Get full name with proper formatting"""
        if not self.full_name:
            self.full_name = f"{self.first_name} {self.last_name}"
        return self.full_name

    @property
    def years_in_office(self) -> int:
        """Calculate years in office"""
        end_date = self.term_end or datetime.utcnow()
        delta = end_date - self.term_start
        return delta.days // 365


class Action(Base):
    """
    Generic action model for all types of government actions.

    Replaces PresidentialAction with a more flexible model that can track
    any politician's actions across all government levels.
    """

    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, index=True)

    # Politician Reference
    politician_id = Column(
        Integer, ForeignKey("politicians.id"), nullable=False, index=True
    )

    # Action Details
    action_type = Column(Enum(ActionType), nullable=False, index=True)
    action_category = Column(Enum(ActionCategory), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text)

    # Timing
    action_date = Column(DateTime, nullable=False, index=True)
    effective_date = Column(DateTime)

    # Impact & Status
    status = Column(String(50), index=True)  # passed, failed, enacted, vetoed, etc.
    impact_level = Column(Integer, default=2)  # 1-5 scale
    outcome = Column(Text)

    # Source Attribution
    source_url = Column(String(500))
    source_id = Column(String(100))  # External source ID
    source_type = Column(String(50))
    evidence_tier = Column(Enum(EvidenceTier), default=EvidenceTier.TIER_3)
    source_metadata = Column(JSON)

    # Full Text & Media
    full_text = Column(Text)
    media_attachments = Column(JSON)

    # AI Analysis
    ai_summary = Column(Text)
    ai_sentiment_score = Column(Float)
    ai_confidence = Column(Float)

    # Metadata
    extra_metadata = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    politician = relationship("Politician", back_populates="actions")
    topics = relationship("Topic", secondary=action_topics, backref="actions")
    related_promises = relationship(
        "Promise", backref="confirming_actions", lazy="dynamic"
    )

    # Indexes
    __table_args__ = (
        Index("idx_action_politician_type", "politician_id", "action_type"),
        Index("idx_action_date_type", "action_date", "action_type"),
        Index("idx_action_status", "politician_id", "status"),
    )


class Evidence(Base):
    """
    Evidence model for source verification.

    Stores the actual source documents and verification data for each action.
    """

    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, index=True)

    # References
    action_id = Column(Integer, ForeignKey("actions.id"), nullable=False, index=True)

    # Source Info
    source_type = Column(
        String(50), nullable=False
    )  # official_record, news_article, etc.
    source_url = Column(String(500), nullable=False)
    source_reliability = Column(Enum(EvidenceTier), nullable=False)
    source_name = Column(String(200))

    # Content
    content_snapshot = Column(JSON)  # Archived content
    archived_date = Column(DateTime)

    # Verification
    verification_status = Column(
        String(20), default="pending"
    )  # verified, pending, disputed
    verified_by = Column(String(100))
    verified_at = Column(DateTime)
    verification_notes = Column(Text)

    # Metadata
    extra_metadata = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_evidence_action", "action_id"),
        Index("idx_evidence_status", "verification_status"),
    )


class Topic(Base):
    """
    Topic/Issue model for categorizing actions and tracking policy positions.
    """

    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text)
    category = Column(String(50), index=True)  # healthcare, economy, environment, etc.
    parent_topic_id = Column(Integer, ForeignKey("topics.id"))

    # Relationships
    parent = relationship("Topic", remote_side=[id])
    children = relationship(
        "Topic", backref=relationship("parent_topic", remote_side=[id])
    )

    created_at = Column(DateTime, server_default=func.now())


# ==========================================================================
# Promise Tracking Models (Actions vs. Words)
# ==========================================================================


class Promise(Base):
    """
    Campaign promise tracking model.

    The core model for the "Actions vs. Words" feature that tracks campaign
    promises and measures fulfillment against actual actions.
    """

    __tablename__ = "promises"

    id = Column(Integer, primary_key=True, index=True)

    # Politician Reference
    politician_id = Column(
        Integer, ForeignKey("politicians.id"), nullable=False, index=True
    )

    # Promise Content
    promise_text = Column(Text, nullable=False)
    promise_type = Column(
        String(50), index=True
    )  # campaign_pledge, policy_commitment, etc.

    # Context
    context_before = Column(Text)
    context_after = Column(Text)
    full_context = Column(Text)

    # Timing
    promise_date = Column(DateTime, nullable=False, index=True)
    deadline = Column(DateTime, index=True)
    is_immediate = Column(Boolean, default=False)
    timeframe_text = Column(String(200))

    # Classification
    topic_tags = Column(JSON)  # List of topic strings
    category = Column(String(50), index=True)

    # AI Analysis
    claim_id = Column(String(100))  # From claim detector
    confidence_score = Column(Float)
    extracted_entities = Column(JSON)
    sentiment_score = Column(Float)

    # Fulfillment Tracking
    fulfillment_status = Column(
        Enum(PromiseStatus), default=PromiseStatus.ACTIVE, index=True
    )
    fulfillment_score = Column(Float, default=0.0)  # 0-100%
    fulfillment_progress = Column(Float, default=0.0)  # 0-100%
    fulfillment_evidence = Column(JSON)  # Links to confirming actions

    # Source
    source_url = Column(String(500))
    source_type = Column(String(50))
    source_metadata = Column(JSON)

    # Metadata
    extra_metadata = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    politician = relationship("Politician", back_populates="promises")

    __table_args__ = (
        Index("idx_promise_politician_status", "politician_id", "fulfillment_status"),
        Index("idx_promise_deadline", "deadline"),
        Index("idx_promise_date", "promise_date"),
    )

    @property
    def is_past_deadline(self) -> bool:
        """Check if deadline has passed"""
        if not self.deadline:
            return False
        return datetime.utcnow() > self.deadline


class PromiseMetric(Base):
    """
    Success metrics for evaluating promise fulfillment.
    """

    __tablename__ = "promise_metrics"

    id = Column(Integer, primary_key=True, index=True)

    promise_id = Column(Integer, ForeignKey("promises.id"), nullable=False, index=True)

    # Metric Details
    metric_type = Column(
        String(50), nullable=False
    )  # quantitative, qualitative, binary
    target_value = Column(Float)
    current_value = Column(Float)
    unit = Column(String(50))  # dollars, percentage, count, etc.
    threshold = Column(Float)
    evaluation_criteria = Column(Text)

    # Tracking
    is_met = Column(Boolean)
    last_updated = Column(DateTime, server_default=func.now())

    created_at = Column(DateTime, server_default=func.now())


class PromiseUpdate(Base):
    """
    Historical updates to promise fulfillment status.
    """

    __tablename__ = "promise_updates"

    id = Column(Integer, primary_key=True, index=True)

    promise_id = Column(Integer, ForeignKey("promises.id"), nullable=False, index=True)

    # Update Details
    old_status = Column(Enum(PromiseStatus))
    new_status = Column(Enum(PromiseStatus), nullable=False)
    old_score = Column(Float)
    new_score = Column(Float, nullable=False)

    # Evidence
    update_reason = Column(Text)
    supporting_evidence = Column(JSON)

    # Metadata
    updated_by = Column(String(100))  # User, AI, or system
    updated_at = Column(DateTime, server_default=func.now())


# ==========================================================================
# Voting & Legislative Models
# ==========================================================================


class Vote(Base):
    """
    Individual politician vote record.
    """

    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, index=True)

    # References
    politician_id = Column(
        Integer, ForeignKey("politicians.id"), nullable=False, index=True
    )
    bill_id = Column(Integer, ForeignKey("bills.id"), nullable=True)
    action_id = Column(Integer, ForeignKey("actions.id"), nullable=True)

    # Vote Details
    vote_type = Column(String(20), nullable=False)  # YEA, NAY, PRESENT, ABSENT
    vote_date = Column(DateTime, nullable=False, index=True)
    chamber = Column(String(50))  # House, Senate
    session_number = Column(Integer)

    # Context
    roll_call_number = Column(String(50))
    public_record = Column(Boolean, default=True)
    vote_description = Column(String(500))

    # Source
    source_url = Column(String(500))

    # Metadata
    extra_metadata = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    politician = relationship("Politician", back_populates="votes")

    __table_args__ = (
        Index("idx_vote_politician_date", "politician_id", "vote_date"),
        Index("idx_vote_bill_type", "bill_id", "vote_type"),
    )


class Bill(Base):
    """
    Legislation bill model (updated with better relationships).
    """

    __tablename__ = "bills"

    id = Column(Integer, primary_key=True, index=True)

    # Congress/Bill Info
    congress_number = Column(Integer, index=True)
    session = Column(Integer)
    bill_number = Column(String(50), nullable=False, index=True)  # H.R. 1234, S. 5678
    bill_type = Column(String(20))  # H.R., S., H.J. Res., S.J. Res.

    # Content
    title = Column(String(500), nullable=False)
    short_title = Column(String(200))
    summary = Column(Text)
    full_text = Column(Text)

    # Timing
    introduced_date = Column(DateTime, index=True)
    enacted_date = Column(DateTime)
    effective_date = Column(DateTime)

    # Status
    status = Column(String(50), index=True)  # Introduced, Passed House, Enacted, etc.
    outcome = Column(String(50))  # enacted, vetoed, failed, withdrawn

    # Topics
    topics = Column(JSON)
    subject_categories = Column(JSON)

    # Source
    source_url = Column(String(500))
    external_id = Column(String(100))  # congress.gov ID

    # AI Analysis
    ai_summary = Column(Text)
    predicted_outcome = Column(String(50))
    predicted_confidence = Column(Float)

    # Metadata
    extra_metadata = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    votes = relationship("Vote", backref="bill")

    __table_args__ = (
        Index("idx_bill_congress_number", "congress_number", "bill_number"),
        Index("idx_bill_status", "status"),
        Index("idx_bill_introduced_date", "introduced_date"),
    )


class BillSponsor(Base):
    """
    Bill sponsor/co-sponsor model.
    """

    __tablename__ = "bill_sponsors"

    id = Column(Integer, primary_key=True, index=True)

    # References
    bill_id = Column(Integer, ForeignKey("bills.id"), nullable=False, index=True)
    politician_id = Column(
        Integer, ForeignKey("politicians.id"), nullable=False, index=True
    )

    # Sponsor Details
    is_primary = Column(Boolean, default=False)
    sponsor_type = Column(String(20), default="cosponsor")  # sponsor, cosponsor
    sponsorship_date = Column(DateTime, server_default=func.now())

    # Politician Info (denormalized for performance)
    first_name = Column(String(100))
    last_name = Column(String(100), nullable=False)
    party = Column(String(20))
    state = Column(String(2))

    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_bill_sponsor_bill", "bill_id"),
        Index("idx_bill_sponsor_politician", "politician_id"),
    )


class VoteResult(Base):
    """
    Aggregate vote results for bills.
    """

    __tablename__ = "vote_results"

    id = Column(Integer, primary_key=True, index=True)

    bill_id = Column(Integer, ForeignKey("bills.id"), nullable=False, index=True)

    # Vote Details
    vote_type = Column(String(50))  # House, Senate, Override
    vote_date = Column(DateTime, nullable=False)

    # Results
    result = Column(String(20))  # Passed, Failed
    yeas = Column(Integer)
    nays = Column(Integer)
    present = Column(Integer, default=0)
    not_voting = Column(Integer)

    # Threshold
    threshold_required = Column(Float)  # Simple majority, 2/3, etc.
    margin = Column(Float)

    source_url = Column(String(500))
    vote_metadata = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())


# ==========================================================================
# Transparency Scoring Models
# ==========================================================================


class TransparencyScore(Base):
    """
    Complete transparency score for a politician.
    """

    __tablename__ = "transparency_scores"

    id = Column(Integer, primary_key=True, index=True)

    # References
    politician_id = Column(
        Integer, ForeignKey("politicians.id"), nullable=False, index=True
    )

    # Overall Score
    overall_score = Column(Float, nullable=False)  # 0-100
    letter_grade = Column(String(1))  # A, B, C, D, F
    star_rating = Column(Integer)  # 1-5

    # Factor Scores (denormalized for quick access)
    voting_record_score = Column(Float)
    promise_fulfillment_score = Column(Float)
    public_communication_score = Column(Float)
    document_release_score = Column(Float)
    conflict_disclosure_score = Column(Float)
    meeting_transparency_score = Column(Float)

    # Trend Analysis
    trend = Column(String(20))  # improving, stable, declining
    trend_magnitude = Column(Float)  # Points changed
    previous_score = Column(Float)

    # Ranking
    rank = Column(Integer)
    peer_group = Column(String(50))  # senate, house, president, state_legislature

    # Quality
    data_quality = Column(Float)  # 0-1 confidence in score
    data_points = Column(Integer)

    # Metadata
    notes = Column(Text)
    calculated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, index=True
    )

    # Relationships
    politician = relationship("Politician", back_populates="transparency_scores")

    __table_args__ = (
        Index("idx_transparency_politician_date", "politician_id", "calculated_at"),
        Index("idx_transparency_score", "overall_score", "peer_group"),
    )


class FactorScore(Base):
    """
    Individual factor scores with detailed breakdown.
    """

    __tablename__ = "factor_scores"

    id = Column(Integer, primary_key=True, index=True)

    # References
    transparency_score_id = Column(
        Integer, ForeignKey("transparency_scores.id"), nullable=False, index=True
    )

    # Factor Details
    factor = Column(
        String(50), nullable=False
    )  # voting_record, promise_fulfillment, etc.
    score = Column(Float, nullable=False)  # 0-100
    weight = Column(Float, nullable=False)  # 0-1 weight in overall score

    # Raw Data
    raw_value = Column(Float)
    max_value = Column(Float)
    data_points = Column(Integer)

    # Metadata
    notes = Column(Text)
    calculated_at = Column(DateTime, server_default=func.now())


class FactorMetric(Base):
    """
    Raw metrics data for transparency factors.
    """

    __tablename__ = "factor_metrics"

    id = Column(Integer, primary_key=True, index=True)

    politician_id = Column(
        Integer, ForeignKey("politicians.id"), nullable=False, index=True
    )
    factor = Column(String(50), nullable=False, index=True)

    # Metrics
    raw_value = Column(Float, nullable=False)
    max_value = Column(Float)
    data_points = Column(Integer, default=0)

    # Source
    source_url = Column(String(500))
    extra_metadata = Column(JSON)

    recorded_at = Column(
        DateTime, nullable=False, server_default=func.now(), index=True
    )

    __table_args__ = (
        Index("idx_factor_metrics_politician_factor", "politician_id", "factor"),
    )


# ==========================================================================
# Sentiment & Analytics Models
# ==========================================================================


class SentimentSnapshot(Base):
    """
    Point-in-time sentiment snapshot.
    """

    __tablename__ = "sentiment_snapshots"

    id = Column(Integer, primary_key=True, index=True)

    # References
    politician_id = Column(
        Integer, ForeignKey("politicians.id"), nullable=True, index=True
    )

    # Target Info
    target_type = Column(String(50), nullable=False)  # politician, bill, action
    target_id = Column(Integer, nullable=False, index=True)
    target_name = Column(String(500), nullable=False)

    # Sentiment Data
    sentiment_score = Column(Float, nullable=False)  # -1 to 1
    polarity = Column(String(20), nullable=False)  # positive, negative, neutral
    confidence = Column(Float, nullable=False)  # 0-1

    # Source
    source_type = Column(String(50))  # news_article, social_media, etc.
    source_url = Column(String(500))
    text_sample = Column(Text)

    # Analysis
    analyzed_at = Column(
        DateTime, nullable=False, server_default=func.now(), index=True
    )
    model_version = Column(String(50))

    extra_metadata = Column(JSON)

    __table_args__ = (
        Index("idx_sentiment_target", "target_type", "target_id"),
        Index("idx_sentiment_analyzed", "analyzed_at"),
    )

    # Relationships
    politician = relationship("Politician", back_populates="sentiments")


class PoliticianSentiment(Base):
    """
    Aggregated sentiment data for politicians.
    """

    __tablename__ = "politician_sentiment"

    id = Column(Integer, primary_key=True, index=True)

    politician_id = Column(
        Integer, ForeignKey("politicians.id"), nullable=False, index=True
    )

    # Aggregated Data
    sentiment_score = Column(Float, nullable=False)  # -1 to 1 average
    polarity = Column(String(20), nullable=False)
    sample_size = Column(Integer, nullable=False)

    # Breakdowns
    source_breakdown = Column(JSON)  # By source type
    top_keywords = Column(JSON)  # Associated keywords

    recorded_at = Column(
        DateTime, nullable=False, server_default=func.now(), index=True
    )
    extra_metadata = Column(JSON)

    __table_args__ = (
        Index("idx_politician_sentiment_politician", "politician_id", "recorded_at"),
    )


# ==========================================================================
# AI/ML Analysis Models
# ==========================================================================


class Prediction(Base):
    """
    AI-generated predictions (bill passage, promise fulfillment, etc.)
    """

    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)

    # Type
    prediction_type = Column(
        String(50), nullable=False, index=True
    )  # bill_passage, promise_fulfillment, vote_outcome

    # Target
    target_type = Column(String(50))
    target_id = Column(Integer)
    target_name = Column(String(500))

    # Prediction
    predicted_value = Column(Float, nullable=False)  # 0-1 probability
    predicted_class = Column(String(50), nullable=False)  # success, failure, etc.
    confidence = Column(Float)  # 0-1
    confidence_level = Column(String(20))  # low, medium, high, very_high

    # Analysis
    factors = Column(JSON)  # Contributing factors
    similar_cases = Column(JSON)  # Similar historical cases
    explanation = Column(Text)  # Human-readable explanation

    # Metadata
    model_version = Column(String(50))
    extra_metadata = Column(JSON)

    created_at = Column(DateTime, server_default=func.now(), index=True)

    __table_args__ = (
        Index(
            "idx_prediction_type_target", "prediction_type", "target_type", "target_id"
        ),
    )


class PatternAnalysis(Base):
    """
    Voting pattern and coalition analysis.
    """

    __tablename__ = "pattern_analyses"

    id = Column(Integer, primary_key=True, index=True)

    # Type
    analysis_type = Column(
        String(50), nullable=False, index=True
    )  # voting_similarity, coalition, ideological_shift

    # Targets
    politician_id_1 = Column(Integer, ForeignKey("politicians.id"), index=True)
    politician_id_2 = Column(Integer, ForeignKey("politicians.id"))

    # Results
    similarity_score = Column(Float)  # 0-1
    agreement_rate = Column(Float)  # 0-1
    ideology_distance = Column(Float)

    # Topic Analysis
    topic_analysis = Column(JSON)

    # Context
    context = Column(JSON)  # Time period, topics, etc.

    extra_metadata = Column(JSON)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    __table_args__ = (Index("idx_pattern_analysis_type", "analysis_type"),)


class Coalition(Base):
    """
    Voting coalition/bloc tracking.
    """

    __tablename__ = "coalitions"

    id = Column(Integer, primary_key=True, index=True)

    # Identification
    coalition_id = Column(String(100), unique=True, index=True)
    name = Column(String(200))
    description = Column(Text)

    # Members
    member_count = Column(Integer)

    # Cohesion
    cohesion_score = Column(Float)  # 0-1 how unified they vote

    # Ideology
    average_ideology = Column(Float)  # -1 (liberal) to 1 (conservative)

    # Affinities
    topic_affinities = Column(JSON)

    # Timing
    formation_date = Column(DateTime)
    is_active = Column(Boolean, default=True, index=True)

    extra_metadata = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_coalition_active", "is_active"),)


# ==========================================================================
# Legacy/Compatibility Models (for backward compatibility)
# ==========================================================================


class President(Base):
    """
    Legacy President model for backward compatibility.

    This wraps the Politician model for existing code that references President directly.
    """

    __tablename__ = "presidents_legacy"

    id = Column(Integer, primary_key=True, index=True)

    # Delegate to Politician
    politician_id = Column(
        Integer, ForeignKey("politicians.id"), unique=True, nullable=False
    )

    # Legacy fields
    name = Column(String(200), nullable=False)
    party = Column(String(100))
    term_start = Column(DateTime, nullable=False)
    term_end = Column(DateTime)
    vice_president = Column(String(200))
    bio = Column(Text)

    # Keep legacy relationship names
    actions = relationship(
        "PresidentialAction", back_populates="president", lazy="dynamic"
    )
    cabinet = relationship("CabinetMember", back_populates="president", lazy="dynamic")

    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_presidents_term", "term_start"),)


class PresidentialAction(Base):
    """
    Legacy PresidentialAction model for backward compatibility.
    """

    __tablename__ = "presidential_actions_legacy"

    id = Column(Integer, primary_key=True, index=True)

    # Delegate to Action
    action_id = Column(Integer, ForeignKey("actions.id"), unique=True, nullable=False)

    # Legacy fields
    president_id = Column(Integer, ForeignKey("presidents_legacy.id"), nullable=False)
    action_type = Column(String(50))
    title = Column(String(500), nullable=False)
    description = Column(Text)
    date = Column(DateTime, nullable=False)
    source_url = Column(String(500))
    source_id = Column(String(100))

    created_at = Column(DateTime, server_default=func.now())

    president = relationship("President", back_populates="actions")


class CabinetMember(Base):
    """
    Legacy CabinetMember model for backward compatibility.
    """

    __tablename__ = "cabinet_members_legacy"

    id = Column(Integer, primary_key=True, index=True)

    # Delegate to Action (appointment)
    action_id = Column(Integer, ForeignKey("actions.id"), unique=True)

    # Legacy fields
    president_id = Column(Integer, ForeignKey("presidents_legacy.id"), nullable=False)
    position = Column(String(200), nullable=False)
    first_name = Column(String(100))
    last_name = Column(String(100), nullable=False)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    bio = Column(Text)
    prior_position = Column(String(200))
    confirmed = Column(Boolean, default=False)
    confirmation_date = Column(DateTime)

    president = relationship("President", back_populates="cabinet")

    created_at = Column(DateTime, server_default=func.now())


class PoliticianClaim(Base):
    """
    Legacy PoliticianClaim model - renamed to Promise but kept for compatibility.
    """

    __tablename__ = "politician_claims_legacy"

    id = Column(Integer, primary_key=True, index=True)

    # Delegate to Promise
    promise_id = Column(Integer, ForeignKey("promises.id"), unique=True, nullable=False)

    # Legacy fields
    politician_name = Column(String(200), nullable=False)
    politician_type = Column(String(50))
    claim_text = Column(Text, nullable=False)
    claim_date = Column(DateTime, nullable=False)
    context = Column(Text)
    source_url = Column(String(500))

    created_at = Column(DateTime, server_default=func.now())


class FactCheck(Base):
    """
    Fact check model - kept for compatibility with promise verification.
    """

    __tablename__ = "fact_checks"

    id = Column(Integer, primary_key=True, index=True)

    # References
    claim_id = Column(Integer, ForeignKey("politician_claims_legacy.id"), nullable=True)
    promise_id = Column(Integer, ForeignKey("promises.id"), nullable=True)

    # Fact Check Details
    rating = Column(String(20))  # True, Mostly True, Half True, False, etc.
    conclusion = Column(Text)
    source_name = Column(String(100))  # PolitiFact, FactCheck.org, Snopes, etc.
    source_url = Column(String(500))
    published_date = Column(DateTime)

    # Metadata
    extra_metadata = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_fact_check_rating", "rating"),
        Index("idx_fact_check_source", "source_name"),
    )
