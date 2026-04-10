"""
Transparency Scoring Service for The Glass House

This module provides comprehensive transparency scoring for politicians
across multiple dimensions. It calculates weighted scores based on:
- Voting record completeness
- Promise fulfillment rates
- Public communication frequency
- Document release timeliness
- Conflict of interest disclosure
- Meeting transparency

Scores are stored, tracked over time, and exposed via API.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from app.db.database import Base
from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Session, relationship

logger = logging.getLogger(__name__)


# ==========================================================================
# Enumerations and Constants
# ==========================================================================


class TransparencyFactor(Enum):
    """Factors contributing to transparency score"""

    VOTING_RECORD = "voting_record"
    PROMISE_FULFILLMENT = "promise_fulfillment"
    PUBLIC_COMMUNICATION = "public_communication"
    DOCUMENT_RELEASE = "document_release"
    CONFLICT_DISCLOSURE = "conflict_disclosure"
    MEETING_TRANSPARENCY = "meeting_transparency"
    FINANCIAL_DISCLOSURE = "financial_disclosure"
    LEGISLATIVE_ACTIVITY = "legislative_activity"


@dataclass
class FactorWeights:
    """Weights for each transparency factor"""

    voting_record: float = 0.20  # 20%
    promise_fulfillment: float = 0.25  # 25%
    public_communication: float = 0.15  # 15%
    document_release: float = 0.15  # 15%
    conflict_disclosure: float = 0.15  # 15%
    meeting_transparency: float = 0.10  # 10%

    @property
    def total(self) -> float:
        """Verify weights sum to 1.0"""
        return (
            self.voting_record
            + self.promise_fulfillment
            + self.public_communication
            + self.document_release
            + self.conflict_disclosure
            + self.meeting_transparency
        )


class ScoreTrend(Enum):
    """Trend direction for score changes"""

    IMPROVING = "improving"
    STABLE = "stable"
    DECLINING = "declining"
    VOLATILE = "volatile"


# ==========================================================================
# Data Models
# ==========================================================================


@dataclass
class FactorScore:
    """Individual factor score with metadata"""

    factor: TransparencyFactor
    score: float  # 0-100
    raw_value: float  # Raw metric value
    max_value: float  # Max possible value for normalization
    data_points: int  # Number of data points used
    last_updated: datetime
    notes: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "factor": self.factor.value,
            "score": round(self.score, 2),
            "raw_value": self.raw_value,
            "max_value": self.max_value,
            "data_points": self.data_points,
            "last_updated": self.last_updated.isoformat(),
            "notes": self.notes,
        }


@dataclass
class TransparencyScore:
    """Complete transparency score for a politician"""

    politician_id: int
    politician_name: str
    overall_score: float  # 0-100
    factor_scores: Dict[TransparencyFactor, FactorScore]
    trend: ScoreTrend
    trend_magnitude: float  # Points changed
    previous_score: Optional[float] = None
    rank: Optional[int] = None  # Rank among peers
    peer_group: Optional[str] = None  # "senate", "house", "president"
    calculated_at: datetime = field(default_factory=datetime.utcnow)
    data_quality: float = 1.0  # 0-1, confidence in score accuracy
    notes: Optional[str] = None

    @property
    def letter_grade(self) -> str:
        """Convert score to letter grade"""
        if self.overall_score >= 90:
            return "A"
        elif self.overall_score >= 80:
            return "B"
        elif self.overall_score >= 70:
            return "C"
        elif self.overall_score >= 60:
            return "D"
        else:
            return "F"

    @property
    def star_rating(self) -> int:
        """Convert score to star rating (1-5)"""
        return max(1, min(5, round(self.overall_score / 20)))

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API"""
        return {
            "politician_id": self.politician_id,
            "politician_name": self.politician_name,
            "overall_score": round(self.overall_score, 2),
            "letter_grade": self.letter_grade,
            "star_rating": self.star_rating,
            "factor_scores": {
                k.value: v.to_dict() for k, v in self.factor_scores.items()
            },
            "trend": self.trend.value,
            "trend_magnitude": round(self.trend_magnitude, 2),
            "previous_score": round(self.previous_score, 2)
            if self.previous_score is not None
            else None,
            "rank": self.rank,
            "peer_group": self.peer_group,
            "calculated_at": self.calculated_at.isoformat(),
            "data_quality": round(self.data_quality, 2),
            "notes": self.notes,
        }


class TransparencyScoreHistory(Base):
    """Database model for score history"""

    __tablename__ = "transparency_score_history"

    id = Column(Integer, primary_key=True, index=True)
    politician_id = Column(Integer, nullable=False, index=True)
    overall_score = Column(Float, nullable=False)
    voting_record_score = Column(Float)
    promise_fulfillment_score = Column(Float)
    public_communication_score = Column(Float)
    document_release_score = Column(Float)
    conflict_disclosure_score = Column(Float)
    meeting_transparency_score = Column(Float)
    rank = Column(Integer)
    peer_group = Column(String(50))
    calculated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    notes = Column(Text)

    __table_args__ = (
        Index("idx_transparency_history_politician", "politician_id", "calculated_at"),
    )


class FactorMetrics(Base):
    """Raw metrics data for each factor"""

    __tablename__ = "factor_metrics"

    id = Column(Integer, primary_key=True, index=True)
    politician_id = Column(Integer, nullable=False, index=True)
    factor = Column(String(50), nullable=False)
    raw_value = Column(Float, nullable=False)
    max_value = Column(Float)
    data_points = Column(Integer, default=0)
    recorded_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    source_url = Column(String(500))
    metadata = Column(Text)  # JSON string

    __table_args__ = (
        Index("idx_factor_metrics_politician_factor", "politician_id", "factor"),
        Index("idx_factor_metrics_recorded", "recorded_at"),
    )


# ==========================================================================
# Scoring Calculators
# ==========================================================================


class VotingRecordCalculator:
    """Calculate voting record transparency score"""

    @staticmethod
    def calculate(
        total_votes: int,
        recorded_votes: int,
        attendance_rate: float,
        explained_votes: int = 0,
    ) -> FactorScore:
        """
        Calculate voting record score.

        Args:
            total_votes: Total number of votes in chamber
            recorded_votes: Politician's recorded votes
            attendance_rate: Percentage of sessions attended
            explained_votes: Votes with public explanation

        Returns:
            FactorScore for voting record
        """
        if total_votes == 0:
            return FactorScore(
                factor=TransparencyFactor.VOTING_RECORD,
                score=0.0,
                raw_value=0.0,
                max_value=100.0,
                data_points=0,
                last_updated=datetime.utcnow(),
                notes="No voting data available",
            )

        # Base score: percentage of votes recorded
        base_score = (recorded_votes / total_votes) * 100

        # Bonus for explained votes (up to 10 extra points)
        explanation_bonus = min(10, (explained_votes / max(recorded_votes, 1)) * 10)

        # Adjust for attendance
        attendance_adjustment = (attendance_rate - 0.9) * 20  # +10 if >95%, -10 if <85%

        # Final score (capped at 100)
        final_score = min(
            100, max(0, base_score + explanation_bonus + attendance_adjustment)
        )

        return FactorScore(
            factor=TransparencyFactor.VOTING_RECORD,
            score=final_score,
            raw_value=recorded_votes,
            max_value=total_votes,
            data_points=recorded_votes,
            last_updated=datetime.utcnow(),
        )


class PromiseFulfillmentCalculator:
    """Calculate promise fulfillment score"""

    @staticmethod
    def calculate(
        total_promises: int,
        fulfilled: int,
        partially_fulfilled: int,
        delayed: int,
        broken: int,
        active: int = 0,
    ) -> FactorScore:
        """
        Calculate promise fulfillment score.

        Args:
            total_promises: Total campaign promises made
            fulfilled: Promises fully fulfilled
            partially_fulfilled: Promises partially fulfilled
            delayed: Promises delayed but ongoing
            broken: Promises not fulfilled
            active: Promises still in progress

        Returns:
            FactorScore for promise fulfillment
        """
        if total_promises == 0:
            return FactorScore(
                factor=TransparencyFactor.PROMISE_FULFILLMENT,
                score=0.0,
                raw_value=0.0,
                max_value=100.0,
                data_points=0,
                last_updated=datetime.utcnow(),
                notes="No promises tracked",
            )

        # Weight different outcomes
        # Fulfilled = 100 points
        # Partially fulfilled = 50 points
        # Delayed = 30 points
        # Broken = 0 points
        # Active = 50 points (neutral until resolved)

        total_points = (
            fulfilled * 100
            + partially_fulfilled * 50
            + delayed * 30
            + broken * 0
            + active * 50
        )

        max_possible_points = total_promises * 100
        score = (total_points / max_possible_points) * 100

        return FactorScore(
            factor=TransparencyFactor.PROMISE_FULFILLMENT,
            score=score,
            raw_value=fulfilled + (partially_fulfilled * 0.5),
            max_value=total_promises,
            data_points=total_promises,
            last_updated=datetime.utcnow(),
        )


class PublicCommunicationCalculator:
    """Calculate public communication score"""

    @staticmethod
    def calculate(
        statement_count: int,
        expected_count: float,
        press_conferences: int,
        social_media_posts: int,
        town_halls: int,
        news_interviews: int,
    ) -> FactorScore:
        """
        Calculate public communication score.

        Args:
            statement_count: Number of public statements
            expected_count: Expected statements per period
            press_conferences: Number of press conferences
            social_media_posts: Social media activity
            town_halls: Town hall meetings held
            news_interviews: News interviews given

        Returns:
            FactorScore for public communication
        """
        if expected_count == 0:
            return FactorScore(
                factor=TransparencyFactor.PUBLIC_COMMUNICATION,
                score=0.0,
                raw_value=0.0,
                max_value=100.0,
                data_points=0,
                last_updated=datetime.utcnow(),
            )

        # Base score: statement frequency vs expected
        base_score = min(100, (statement_count / expected_count) * 50)

        # Engagement activities bonus (up to 50 points)
        engagement_score = (
            press_conferences * 5
            + town_halls * 10
            + news_interviews * 3
            + min(10, social_media_posts / 10)
        )
        engagement_score = min(50, engagement_score)

        final_score = base_score + engagement_score

        total_activities = (
            statement_count
            + press_conferences
            + town_halls
            + news_interviews
            + social_media_posts
        )

        return FactorScore(
            factor=TransparencyFactor.PUBLIC_COMMUNICATION,
            score=final_score,
            raw_value=total_activities,
            max_value=expected_count * 5,  # Arbitrary scale
            data_points=total_activities,
            last_updated=datetime.utcnow(),
        )


class DocumentReleaseCalculator:
    """Calculate document release timeliness score"""

    @staticmethod
    def calculate(
        total_documents: int,
        released_on_time: int,
        released_late: int,
        not_released: int,
        avg_delay_days: float = 0.0,
    ) -> FactorScore:
        """
        Calculate document release timeliness score.

        Args:
            total_documents: Total documents that should be released
            released_on_time: Documents released by deadline
            released_late: Documents released after deadline
            not_released: Documents not yet released
            avg_delay_days: Average days late for late documents

        Returns:
            FactorScore for document release
        """
        if total_documents == 0:
            return FactorScore(
                factor=TransparencyFactor.DOCUMENT_RELEASE,
                score=0.0,
                raw_value=0.0,
                max_value=100.0,
                data_points=0,
                last_updated=datetime.utcnow(),
                notes="No documents tracked",
            )

        # Base score: on-time percentage
        base_score = (released_on_time / total_documents) * 60  # Up to 60 points

        # Late release penalty
        late_penalty = (released_late / total_documents) * 20  # Up to 20 point penalty

        # Not released penalty
        unreleased_penalty = (
            not_released / total_documents
        ) * 40  # Up to 40 point penalty

        # Average delay penalty (additional)
        delay_penalty = min(
            10, avg_delay_days / 30 * 10
        )  # 10 days avg = ~3.3 point penalty

        final_score = max(
            0, base_score - late_penalty - unreleased_penalty - delay_penalty
        )

        return FactorScore(
            factor=TransparencyFactor.DOCUMENT_RELEASE,
            score=final_score,
            raw_value=released_on_time,
            max_value=total_documents,
            data_points=total_documents,
            last_updated=datetime.utcnow(),
        )


class ConflictDisclosureCalculator:
    """Calculate conflict of interest disclosure score"""

    @staticmethod
    def calculate(
        total_disclosures: int,
        required_disclosures: int,
        filed_on_time: int,
        completeness_score: float,
        accuracy_score: float,
    ) -> FactorScore:
        """
        Calculate conflict disclosure score.

        Args:
            total_disclosures: Total disclosures filed
            required_disclosures: Required disclosures by law
            filed_on_time: Disclosures filed by deadline
            completeness_score: Percentage of required info provided
            accuracy_score: Verified accuracy percentage

        Returns:
            FactorScore for conflict disclosure
        """
        if required_disclosures == 0:
            return FactorScore(
                factor=TransparencyFactor.CONFLICT_DISCLOSURE,
                score=100.0,
                raw_value=1.0,
                max_value=1.0,
                data_points=0,
                last_updated=datetime.utcnow(),
                notes="No required disclosures",
            )

        # Filing rate (up to 50 points)
        filing_rate = (total_disclosures / required_disclosures) * 50

        # On-time filing (up to 25 points)
        on_time_score = (filed_on_time / max(total_disclosures, 1)) * 25

        # Completeness (up to 15 points)
        completeness_points = completeness_score * 15

        # Accuracy (up to 10 points)
        accuracy_points = accuracy_score * 10

        final_score = (
            filing_rate + on_time_score + completeness_points + accuracy_points
        )

        return FactorScore(
            factor=TransparencyFactor.CONFLICT_DISCLOSURE,
            score=final_score,
            raw_value=total_disclosures,
            max_value=required_disclosures,
            data_points=total_disclosures,
            last_updated=datetime.utcnow(),
        )


class MeetingTransparencyCalculator:
    """Calculate meeting transparency score"""

    @staticmethod
    def calculate(
        total_meetings: int,
        public_meetings: int,
        meetings_with_notice: int,
        meetings_with_minutes: int,
        meetings_recorded: int,
    ) -> FactorScore:
        """
        Calculate meeting transparency score.

        Args:
            total_meetings: Total meetings held
            public_meetings: Meetings open to public
            meetings_with_notice: Meetings with advance notice
            meetings_with_minutes: Meetings with published minutes
            meetings_recorded: Meetings with video/audio recording

        Returns:
            FactorScore for meeting transparency
        """
        if total_meetings == 0:
            return FactorScore(
                factor=TransparencyFactor.MEETING_TRANSPARENCY,
                score=0.0,
                raw_value=0.0,
                max_value=100.0,
                data_points=0,
                last_updated=datetime.utcnow(),
                notes="No meetings tracked",
            )

        # Public access (up to 40 points)
        public_score = (public_meetings / total_meetings) * 40

        # Advance notice (up to 25 points)
        notice_score = (meetings_with_notice / total_meetings) * 25

        # Minutes published (up to 20 points)
        minutes_score = (meetings_with_minutes / total_meetings) * 20

        # Recording available (up to 15 points)
        recorded_score = (meetings_recorded / total_meetings) * 15

        final_score = public_score + notice_score + minutes_score + recorded_score

        total_transparency_markers = (
            public_meetings
            + meetings_with_notice
            + meetings_with_minutes
            + meetings_recorded
        )

        return FactorScore(
            factor=TransparencyFactor.MEETING_TRANSPARENCY,
            score=final_score,
            raw_value=total_transparency_markers,
            max_value=total_meetings * 4,  # Max 4 markers per meeting
            data_points=total_meetings,
            last_updated=datetime.utcnow(),
        )


# ==========================================================================
# Main Scoring Service
# ==========================================================================


class TransparencyScoringService:
    """
    Main service for calculating and managing transparency scores.

    This service orchestrates all factor calculators, manages score
    history, and provides ranking functionality.
    """

    def __init__(self, weights: Optional[FactorWeights] = None):
        self.weights = weights or FactorWeights()
        self.db: Optional[Session] = None

    def set_database(self, db: Session) -> None:
        """Set database session"""
        self.db = db

    def calculate_transparency_score(
        self,
        politician_id: int,
        politician_name: str,
        voting_data: Dict[str, Any],
        promise_data: Dict[str, Any],
        communication_data: Dict[str, Any],
        document_data: Dict[str, Any],
        conflict_data: Dict[str, Any],
        meeting_data: Dict[str, Any],
        peer_group: str = "general",
    ) -> TransparencyScore:
        """
        Calculate complete transparency score for a politician.

        Args:
            politician_id: Politician identifier
            politician_name: Politician name
            voting_data: Voting record metrics
            promise_data: Promise fulfillment metrics
            communication_data: Public communication metrics
            document_data: Document release metrics
            conflict_data: Conflict disclosure metrics
            meeting_data: Meeting transparency metrics
            peer_group: Peer group for ranking (senate, house, president)

        Returns:
            Complete TransparencyScore object
        """
        logger.info(f"Calculating transparency score for {politician_name}")

        # Calculate individual factor scores
        factor_scores = {
            TransparencyFactor.VOTING_RECORD: VotingRecordCalculator.calculate(
                total_votes=voting_data.get("total_votes", 0),
                recorded_votes=voting_data.get("recorded_votes", 0),
                attendance_rate=voting_data.get("attendance_rate", 0.0),
                explained_votes=voting_data.get("explained_votes", 0),
            ),
            TransparencyFactor.PROMISE_FULFILLMENT: PromiseFulfillmentCalculator.calculate(
                total_promises=promise_data.get("total_promises", 0),
                fulfilled=promise_data.get("fulfilled", 0),
                partially_fulfilled=promise_data.get("partially_fulfilled", 0),
                delayed=promise_data.get("delayed", 0),
                broken=promise_data.get("broken", 0),
                active=promise_data.get("active", 0),
            ),
            TransparencyFactor.PUBLIC_COMMUNICATION: PublicCommunicationCalculator.calculate(
                statement_count=communication_data.get("statement_count", 0),
                expected_count=communication_data.get("expected_count", 0.0),
                press_conferences=communication_data.get("press_conferences", 0),
                social_media_posts=communication_data.get("social_media_posts", 0),
                town_halls=communication_data.get("town_halls", 0),
                news_interviews=communication_data.get("news_interviews", 0),
            ),
            TransparencyFactor.DOCUMENT_RELEASE: DocumentReleaseCalculator.calculate(
                total_documents=document_data.get("total_documents", 0),
                released_on_time=document_data.get("released_on_time", 0),
                released_late=document_data.get("released_late", 0),
                not_released=document_data.get("not_released", 0),
                avg_delay_days=document_data.get("avg_delay_days", 0.0),
            ),
            TransparencyFactor.CONFLICT_DISCLOSURE: ConflictDisclosureCalculator.calculate(
                total_disclosures=conflict_data.get("total_disclosures", 0),
                required_disclosures=conflict_data.get("required_disclosures", 0),
                filed_on_time=conflict_data.get("filed_on_time", 0),
                completeness_score=conflict_data.get("completeness_score", 0.0),
                accuracy_score=conflict_data.get("accuracy_score", 0.0),
            ),
            TransparencyFactor.MEETING_TRANSPARENCY: MeetingTransparencyCalculator.calculate(
                total_meetings=meeting_data.get("total_meetings", 0),
                public_meetings=meeting_data.get("public_meetings", 0),
                meetings_with_notice=meeting_data.get("meetings_with_notice", 0),
                meetings_with_minutes=meeting_data.get("meetings_with_minutes", 0),
                meetings_recorded=meeting_data.get("meetings_recorded", 0),
            ),
        }

        # Calculate weighted overall score
        overall_score = sum(
            score.score * self.weights.__dict__[factor.value.replace("_", "_")]
            for factor, score in factor_scores.items()
        )

        # Get previous score for trend calculation
        previous_score = None
        if self.db:
            previous = (
                self.db.query(TransparencyScoreHistory)
                .filter(TransparencyScoreHistory.politician_id == politician_id)
                .order_by(TransparencyScoreHistory.calculated_at.desc())
                .limit(1)
                .first()
            )
            if previous:
                previous_score = previous.overall_score

        # Calculate trend
        if previous_score is not None:
            trend_magnitude = overall_score - previous_score
            if abs(trend_magnitude) < 2:
                trend = ScoreTrend.STABLE
            elif trend_magnitude > 0:
                trend = ScoreTrend.IMPROVING
            else:
                trend = ScoreTrend.DECLINING
        else:
            trend_magnitude = 0.0
            trend = ScoreTrend.STABLE

        # Get rank (if database available)
        rank = None
        if self.db:
            rank = self._calculate_rank(politician_id, overall_score, peer_group)

        # Calculate data quality (based on data points)
        total_data_points = sum(score.data_points for score in factor_scores.values())
        data_quality = min(1.0, total_data_points / 100)  # 100 points = perfect

        # Create final score object
        transparency_score = TransparencyScore(
            politician_id=politician_id,
            politician_name=politician_name,
            overall_score=overall_score,
            factor_scores=factor_scores,
            trend=trend,
            trend_magnitude=trend_magnitude,
            previous_score=previous_score,
            rank=rank,
            peer_group=peer_group,
            data_quality=data_quality,
        )

        # Store in database
        if self.db:
            self._store_score(transparency_score)
            self._store_factor_metrics(politician_id, factor_scores)

        logger.info(
            f"Calculated transparency score: {transparency_score.overall_score:.2f} "
            f"for {politician_name}"
        )

        return transparency_score

    def calculate_bulk_scores(
        self, politicians_data: List[Dict[str, Any]], peer_group: str = "general"
    ) -> List[TransparencyScore]:
        """
        Calculate scores for multiple politicians efficiently.

        Args:
            politicians_data: List of politician data dictionaries
            peer_group: Peer group for ranking

        Returns:
            List of TransparencyScore objects
        """
        logger.info(f"Calculating bulk scores for {len(politicians_data)} politicians")

        scores = []
        for data in politicians_data:
            try:
                score = self.calculate_transparency_score(
                    politician_id=data.get("politician_id"),
                    politician_name=data.get("politician_name"),
                    voting_data=data.get("voting_data", {}),
                    promise_data=data.get("promise_data", {}),
                    communication_data=data.get("communication_data", {}),
                    document_data=data.get("document_data", {}),
                    conflict_data=data.get("conflict_data", {}),
                    meeting_data=data.get("meeting_data", {}),
                    peer_group=peer_group,
                )
                scores.append(score)
            except Exception as e:
                logger.error(
                    f"Error calculating score for {data.get('politician_name')}: {e}"
                )

        # Calculate rankings
        if scores and self.db:
            scores = self._calculate_rankings(scores, peer_group)

        return scores

    def get_score_history(
        self, politician_id: int, days: int = 365
    ) -> List[TransparencyScoreHistory]:
        """
        Get score history for a politician.

        Args:
            politician_id: Politician identifier
            days: Number of days of history

        Returns:
            List of historical score records
        """
        if not self.db:
            raise RuntimeError("Database session not set")

        cutoff_date = datetime.utcnow() - timedelta(days=days)

        history = (
            self.db.query(TransparencyScoreHistory)
            .filter(
                TransparencyScoreHistory.politician_id == politician_id,
                TransparencyScoreHistory.calculated_at >= cutoff_date,
            )
            .order_by(TransparencyScoreHistory.calculated_at)
            .all()
        )

        return history

    def get_leaderboard(
        self, peer_group: str = "general", limit: int = 100
    ) -> List[TransparencyScoreHistory]:
        """
        Get top-ranked politicians by transparency score.

        Args:
            peer_group: Peer group to rank
            limit: Maximum results to return

        Returns:
            List of top score records
        """
        if not self.db:
            raise RuntimeError("Database session not set")

        leaderboard = (
            self.db.query(TransparencyScoreHistory)
            .filter(TransparencyScoreHistory.peer_group == peer_group)
            .order_by(TransparencyScoreHistory.overall_score.desc())
            .limit(limit)
            .all()
        )

        return leaderboard

    def get_score_distribution(
        self, peer_group: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get score distribution statistics.

        Args:
            peer_group: Optional peer group filter

        Returns:
            Dictionary with distribution statistics
        """
        if not self.db:
            raise RuntimeError("Database session not set")

        query = self.db.query(TransparencyScoreHistory.overall_score)

        if peer_group:
            query = query.filter(TransparencyScoreHistory.peer_group == peer_group)

        scores = [row[0] for row in query.all() if row[0] is not None]

        if not scores:
            return {
                "count": 0,
                "mean": 0.0,
                "median": 0.0,
                "min": 0.0,
                "max": 0.0,
                "std_dev": 0.0,
                "distribution": {},
            }

        # Calculate statistics
        mean = sum(scores) / len(scores)
        sorted_scores = sorted(scores)
        median = sorted_scores[len(sorted_scores) // 2]
        std_dev = (sum((s - mean) ** 2 for s in scores) / len(scores)) ** 0.5

        # Calculate distribution by grade
        distribution = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
        for score in scores:
            if score >= 90:
                distribution["A"] += 1
            elif score >= 80:
                distribution["B"] += 1
            elif score >= 70:
                distribution["C"] += 1
            elif score >= 60:
                distribution["D"] += 1
            else:
                distribution["F"] += 1

        return {
            "count": len(scores),
            "mean": round(mean, 2),
            "median": round(median, 2),
            "min": round(min(scores), 2),
            "max": round(max(scores), 2),
            "std_dev": round(std_dev, 2),
            "distribution": distribution,
        }

    def _calculate_rank(
        self, politician_id: int, score: float, peer_group: str
    ) -> Optional[int]:
        """Calculate rank for a politician"""
        if not self.db:
            return None

        count = (
            self.db.query(TransparencyScoreHistory)
            .filter(
                TransparencyScoreHistory.overall_score > score,
                TransparencyScoreHistory.peer_group == peer_group,
            )
            .count()
        )

        return count + 1

    def _calculate_rankings(
        self, scores: List[TransparencyScore], peer_group: str
    ) -> List[TransparencyScore]:
        """Calculate rankings for a list of scores"""
        # Sort by score descending
        sorted_scores = sorted(scores, key=lambda s: s.overall_score, reverse=True)

        # Assign ranks
        for i, score in enumerate(sorted_scores):
            score.rank = i + 1

        return sorted_scores

    def _store_score(self, score: TransparencyScore) -> None:
        """Store score in database"""
        if not self.db:
            return

        history = TransparencyScoreHistory(
            politician_id=score.politician_id,
            overall_score=score.overall_score,
            voting_record_score=score.factor_scores[
                TransparencyFactor.VOTING_RECORD
            ].score,
            promise_fulfillment_score=score.factor_scores[
                TransparencyFactor.PROMISE_FULFILLMENT
            ].score,
            public_communication_score=score.factor_scores[
                TransparencyFactor.PUBLIC_COMMUNICATION
            ].score,
            document_release_score=score.factor_scores[
                TransparencyFactor.DOCUMENT_RELEASE
            ].score,
            conflict_disclosure_score=score.factor_scores[
                TransparencyFactor.CONFLICT_DISCLOSURE
            ].score,
            meeting_transparency_score=score.factor_scores[
                TransparencyFactor.MEETING_TRANSPARENCY
            ].score,
            rank=score.rank,
            peer_group=score.peer_group,
            calculated_at=score.calculated_at,
            notes=score.notes,
        )

        self.db.add(history)
        self.db.commit()

    def _store_factor_metrics(
        self, politician_id: int, factor_scores: Dict[TransparencyFactor, FactorScore]
    ) -> None:
        """Store individual factor metrics in database"""
        if not self.db:
            return

        for factor, score in factor_scores.items():
            metric = FactorMetrics(
                politician_id=politician_id,
                factor=factor.value,
                raw_value=score.raw_value,
                max_value=score.max_value,
                data_points=score.data_points,
                recorded_at=score.last_updated,
            )
            self.db.add(metric)

        self.db.commit()

    def export_scores(
        self, politician_ids: Optional[List[int]] = None, format: str = "json"
    ) -> str:
        """Export scores in specified format"""
        if not self.db:
            raise RuntimeError("Database session not set")

        import json

        query = self.db.query(TransparencyScoreHistory)

        if politician_ids:
            query = query.filter(
                TransparencyScoreHistory.politician_id.in_(politician_ids)
            )

        records = query.all()

        data = [
            {
                "politician_id": r.politician_id,
                "overall_score": r.overall_score,
                "voting_record": r.voting_record_score,
                "promise_fulfillment": r.promise_fulfillment_score,
                "public_communication": r.public_communication_score,
                "document_release": r.document_release_score,
                "conflict_disclosure": r.conflict_disclosure_score,
                "meeting_transparency": r.meeting_transparency_score,
                "rank": r.rank,
                "peer_group": r.peer_group,
                "calculated_at": r.calculated_at.isoformat(),
            }
            for r in records
        ]

        if format == "json":
            return json.dumps(data, indent=2)
        elif format == "csv":
            if not data:
                return ""
            headers = list(data[0].keys())
            lines = [",".join(headers)]
            lines.extend(
                ",".join(str(data.get(h, "")) for h in headers) for data in data
            )
            return "\n".join(lines)

        raise ValueError(f"Unsupported format: {format}")


# ==========================================================================
# Singleton Instance
# ==========================================================================

_transparency_service: Optional[TransparencyScoringService] = None


def get_transparency_service() -> TransparencyScoringService:
    """Get or create the singleton transparency scoring service"""
    global _transparency_service
    if _transparency_service is None:
        _transparency_service = TransparencyScoringService()
    return _transparency_service


def reset_transparency_service():
    """Reset service singleton (for testing)"""
    global _transparency_service
    _transparency_service = None
