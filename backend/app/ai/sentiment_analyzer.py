"""
AI/ML Services - Sentiment Analysis Module

This module provides sentiment analysis capabilities for tracking public opinion
around politicians, bills, and government actions. It integrates with various
data sources to provide real-time sentiment tracking.

Author: The Glass House Team
Version: 1.0.0
"""

import json
import logging
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import httpx
import spacy
import torch
from app.core.config import get_settings
from app.db.database import Base
from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Session, relationship
from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline

# Configure logging
logger = logging.getLogger(__name__)

settings = get_settings()


# ============================================================================
# Enumerations and Constants
# ============================================================================


class SentimentPolarity(Enum):
    """Sentiment polarity classification"""

    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


class SentimentSource(Enum):
    """Source of sentiment data"""

    NEWS_ARTICLE = "news_article"
    SOCIAL_MEDIA = "social_media"
    SPEECH = "speech"
    PRESS_RELEASE = "press_release"
    FORUM = "forum"
    BLOG = "blog"
    OFFICIAL_STATEMENT = "official_statement"


class SentimentModel(Enum):
    """Available sentiment analysis models"""

    SPACY_EN_CORE = "spacy_en_core_sm"
    TRANSFORMERS_BERT = "transformers_bert_base"
    TRANSFORMERS_FINBERT = "transformers_finbert"
    CUSTOM_TRAINED = "custom_trained_political"


# ============================================================================
# Data Models
# ============================================================================


@dataclass
class SentimentAnalysis:
    """Result of a sentiment analysis"""

    text: str
    polarity: SentimentPolarity
    score: float  # -1.0 to 1.0, where -1 is most negative, 1 is most positive
    confidence: float  # 0.0 to 1.0
    model_used: SentimentModel
    source: Optional[SentimentSource] = None
    source_url: Optional[str] = None
    analyzed_at: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SentimentTrend:
    """Sentiment trend over time"""

    politician_id: Optional[str] = None
    politician_name: Optional[str] = None
    topic: Optional[str] = None
    sentiment_series: List[Tuple[datetime, float]] = field(default_factory=list)
    average_sentiment: float = 0.0
    sentiment_change: float = 0.0  # Change over period
    trend_direction: str = "stable"  # "improving", "declining", "stable"
    data_points: int = 0
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None


class PoliticianSentiment(Base):
    """Database model for storing politician sentiment data"""

    __tablename__ = "politician_sentiment"

    id = Column(Integer, primary_key=True, index=True)
    politician_id = Column(Integer, nullable=False, index=True)
    sentiment_score = Column(Float, nullable=False)  # -1.0 to 1.0
    polarity = Column(String(20), nullable=False)  # positive, negative, neutral
    sample_size = Column(Integer, nullable=False)  # Number of samples analyzed
    recorded_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    source_breakdown = Column(Text)  # JSON string of source breakdown
    top_keywords = Column(Text)  # JSON string of top associated keywords
    metadata = Column(Text)  # Additional metadata as JSON

    __table_args__ = (
        Index("idx_politician_sentiment_politician", "politician_id", "recorded_at"),
    )


class SentimentSnapshot(Base):
    """Point-in-time sentiment snapshot"""

    __tablename__ = "sentiment_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    target_type = Column(String(50), nullable=False)  # politician, bill, action
    target_id = Column(Integer, nullable=False, index=True)
    target_name = Column(String(500), nullable=False)
    sentiment_score = Column(Float, nullable=False)
    polarity = Column(String(20), nullable=False)
    confidence = Column(Float, nullable=False)
    source_type = Column(String(50))
    source_url = Column(String(500))
    text_sample = Column(Text)
    analyzed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    model_version = Column(String(50))

    __table_args__ = (
        Index("idx_sentiment_snapshot_target", "target_type", "target_id"),
        Index("idx_sentiment_snapshot_analyzed", "analyzed_at"),
    )


# ============================================================================
# Base Sentiment Analyzer
# ============================================================================


class SentimentAnalyzerBase(ABC):
    """Abstract base class for sentiment analyzers"""

    def __init__(self, model_name: str):
        self.model_name = model_name
        self.model = None
        self.tokenizer = None
        self.initialized = False

    @abstractmethod
    def initialize(self) -> bool:
        """Initialize the sentiment model"""
        pass

    @abstractmethod
    def analyze(self, text: str) -> SentimentAnalysis:
        """Analyze sentiment of given text"""
        pass

    @abstractmethod
    def batch_analyze(self, texts: List[str]) -> List[SentimentAnalysis]:
        """Analyze sentiment of multiple texts"""
        pass

    def cleanup(self):
        """Clean up resources"""
        if self.model is not None:
            del self.model
            self.model = None
        if self.tokenizer is not None:
            del self.tokenizer
            self.tokenizer = None
        self.initialized = False


# ============================================================================
# SpaCy Sentiment Analyzer
# ============================================================================


class SpacySentimentAnalyzer(SentimentAnalyzerBase):
    """Sentiment analyzer using SpaCy NLP library"""

    def __init__(self):
        super().__init__(SentimentModel.SPACY_EN_CORE.value)
        self.nlp = None

    def initialize(self) -> bool:
        """Initialize SpaCy model"""
        try:
            logger.info("Initializing SpaCy sentiment model...")
            self.nlp = spacy.load("en_core_web_sm")

            # Add sentiment component if available
            try:
                import spacy_sentiment

                self.nlp.add_pipe("sentiment", config={"ngram": [1, 2]})
            except ImportError:
                logger.warning("spacy_sentiment not installed, using basic analysis")

            self.initialized = True
            logger.info("SpaCy sentiment model initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize SpaCy model: {e}")
            return False

    def analyze(self, text: str) -> SentimentAnalysis:
        """Analyze sentiment using SpaCy"""
        if not self.initialized or not self.nlp:
            raise RuntimeError("Model not initialized. Call initialize() first.")

        if not text or not text.strip():
            return SentimentAnalysis(
                text="",
                polarity=SentimentPolarity.NEUTRAL,
                score=0.0,
                confidence=0.0,
                model_used=SentimentModel.SPACY_EN_CORE,
            )

        doc = self.nlp(text)

        # Extract sentiment score from doc or tokens
        sentiment_score = self._calculate_spacy_sentiment(doc)

        # Determine polarity and confidence
        polarity, confidence = self._classify_sentiment(sentiment_score)

        return SentimentAnalysis(
            text=text[:500],  # Truncate for storage
            polarity=polarity,
            score=sentiment_score,
            confidence=confidence,
            model_used=SentimentModel.SPACY_EN_CORE,
            metadata={
                "tokens": len(list(doc)),
                "entities": [(ent.text, ent.label_) for ent in doc.ents],
            },
        )

    def batch_analyze(self, texts: List[str]) -> List[SentimentAnalysis]:
        """Analyze multiple texts efficiently"""
        return [self.analyze(text) for text in texts]

    def _calculate_spacy_sentiment(self, doc) -> float:
        """Calculate sentiment score from SpaCy doc"""
        # Simple heuristic-based sentiment scoring
        positive_words = {
            "good",
            "great",
            "excellent",
            "amazing",
            "wonderful",
            "success",
            "positive",
            "support",
            "help",
            "improve",
            "benefit",
            "progress",
        }
        negative_words = {
            "bad",
            "terrible",
            "awful",
            "horrible",
            "failure",
            "negative",
            "harm",
            "damage",
            "problem",
            "issue",
            "worry",
            "concern",
            "criticize",
        }

        score = 0.0
        token_count = 0

        for token in doc:
            if token.is_alpha:  # Only count actual words
                token_lower = token.lower_
                if token_lower in positive_words:
                    score += 1
                elif token_lower in negative_words:
                    score -= 1
                token_count += 1

        # Normalize to -1 to 1 range
        if token_count > 0:
            normalized_score = score / min(token_count, 10)  # Cap at 10 for stability
            return max(-1.0, min(1.0, normalized_score))

        return 0.0

    def _classify_sentiment(self, score: float) -> Tuple[SentimentPolarity, float]:
        """Classify sentiment score into polarity with confidence"""
        if score > 0.1:
            polarity = SentimentPolarity.POSITIVE
            confidence = min(1.0, abs(score) * 2)
        elif score < -0.1:
            polarity = SentimentPolarity.NEGATIVE
            confidence = min(1.0, abs(score) * 2)
        else:
            polarity = SentimentPolarity.NEUTRAL
            confidence = 1.0 - abs(score) * 2

        return polarity, confidence


# ============================================================================
# Transformers Sentiment Analyzer
# ============================================================================


class TransformersSentimentAnalyzer(SentimentAnalyzerBase):
    """Sentiment analyzer using HuggingFace Transformers"""

    def __init__(
        self, model_name: str = "distilbert-base-uncased-finetuned-sst-2-english"
    ):
        super().__init__(SentimentModel.TRANSFORMERS_BERT.value)
        self.model_name = model_name
        self.device = 0 if torch.cuda.is_available() else -1

    def initialize(self) -> bool:
        """Initialize Transformers model"""
        try:
            logger.info(f"Initializing Transformers sentiment model: {self.model_name}")

            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(
                self.model_name
            )

            if self.device > 0:
                self.model.to("cuda")

            self.model.eval()
            self.initialized = True

            logger.info("Transformers sentiment model initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize Transformers model: {e}")
            return False

    def analyze(self, text: str) -> SentimentAnalysis:
        """Analyze sentiment using Transformers"""
        if not self.initialized:
            raise RuntimeError("Model not initialized. Call initialize() first.")

        if not text or not text.strip():
            return SentimentAnalysis(
                text="",
                polarity=SentimentPolarity.NEUTRAL,
                score=0.0,
                confidence=0.0,
                model_used=SentimentModel.TRANSFORMERS_BERT,
            )

        with torch.no_grad():
            inputs = self.tokenizer(
                text, return_tensors="pt", truncation=True, max_length=512, padding=True
            )

            if self.device > 0:
                inputs = {k: v.to("cuda") for k, v in inputs.items()}

            outputs = self.model(**inputs)
            probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1)
            predicted_class = torch.argmax(probabilities, dim=-1).item()
            confidence = probabilities[0][predicted_class].item()

            # Map to our polarity system (model-specific mapping)
            if predicted_class == 1:
                polarity = SentimentPolarity.POSITIVE
                score = confidence * 0.9  # Scale to 0.9 for safety
            else:
                polarity = SentimentPolarity.NEGATIVE
                score = -confidence * 0.9

        return SentimentAnalysis(
            text=text[:500],
            polarity=polarity,
            score=score,
            confidence=confidence,
            model_used=SentimentModel.TRANSFORMERS_BERT,
            metadata={
                "raw_probabilities": {
                    "positive": float(probabilities[0][1]),
                    "negative": float(probabilities[0][0]),
                }
            },
        )

    def batch_analyze(self, texts: List[str]) -> List[SentimentAnalysis]:
        """Analyze multiple texts efficiently using batching"""
        results = []

        # Process in batches of 32
        batch_size = 32
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]

            with torch.no_grad():
                inputs = self.tokenizer(
                    batch,
                    return_tensors="pt",
                    truncation=True,
                    max_length=512,
                    padding=True,
                )

                if self.device > 0:
                    inputs = {k: v.to("cuda") for k, v in inputs.items()}

                outputs = self.model(**inputs)
                probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1)

                for j, text in enumerate(batch):
                    predicted_class = torch.argmax(probabilities[j], dim=-1).item()
                    confidence = probabilities[j][predicted_class].item()

                    if predicted_class == 1:
                        polarity = SentimentPolarity.POSITIVE
                        score = confidence * 0.9
                    else:
                        polarity = SentimentPolarity.NEGATIVE
                        score = -confidence * 0.9

                    results.append(
                        SentimentAnalysis(
                            text=text[:500],
                            polarity=polarity,
                            score=score,
                            confidence=confidence,
                            model_used=SentimentModel.TRANSFORMERS_BERT,
                        )
                    )

        return results


# ============================================================================
# Sentiment Analysis Service
# ============================================================================


class SentimentAnalysisService:
    """
    High-level service for sentiment analysis operations.

    This service provides a unified interface for sentiment analysis,
    trend tracking, and sentiment data management.
    """

    def __init__(self):
        self.analyzer: Optional[SentimentAnalyzerBase] = None
        self.model_type = SentimentModel.TRANSFORMERS_BERT
        self.initialized = False

    def initialize(
        self, model_type: SentimentModel = SentimentModel.TRANSFORMERS_BERT
    ) -> bool:
        """Initialize the sentiment analysis service"""
        self.model_type = model_type

        try:
            if model_type == SentimentModel.TRANSFORMERS_BERT:
                self.analyzer = TransformersSentimentAnalyzer()
            elif model_type == SentimentModel.SPACY_EN_CORE:
                self.analyzer = SpacySentimentAnalyzer()
            else:
                logger.warning(
                    f"Unknown model type: {model_type}, using Transformers BERT"
                )
                self.analyzer = TransformersSentimentAnalyzer()

            if not self.analyzer or not self.analyzer.initialize():
                logger.error("Failed to initialize sentiment analyzer")
                return False

            self.initialized = True
            logger.info(
                f"Sentiment analysis service initialized with {model_type.value}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to initialize sentiment analysis service: {e}")
            return False

    def analyze_text(
        self,
        text: str,
        source: Optional[SentimentSource] = None,
        source_url: Optional[str] = None,
    ) -> SentimentAnalysis:
        """Analyze sentiment of a text"""
        if not self.initialized or not self.analyzer:
            raise RuntimeError("Service not initialized. Call initialize() first.")

        return self.analyzer.analyze(text)

    def analyze_batch(
        self, texts: List[str], source: Optional[SentimentSource] = None
    ) -> List[SentimentAnalysis]:
        """Analyze sentiment of multiple texts"""
        if not self.initialized or not self.analyzer:
            raise RuntimeError("Service not initialized. Call initialize() first.")

        return self.analyzer.batch_analyze(texts)

    def get_sentiment_trend(
        self, db: Session, politician_id: int, days: int = 30
    ) -> SentimentTrend:
        """Get sentiment trend for a politician over time"""
        from datetime import timedelta

        cutoff_date = datetime.utcnow() - timedelta(days=days)

        # Query sentiment data from database
        sentiments = (
            db.query(PoliticianSentiment)
            .filter(
                PoliticianSentiment.politician_id == politician_id,
                PoliticianSentiment.recorded_at >= cutoff_date,
            )
            .order_by(PoliticianSentiment.recorded_at)
            .all()
        )

        if not sentiments:
            return SentimentTrend(
                politician_id=str(politician_id),
                sentiment_series=[],
                average_sentiment=0.0,
                sentiment_change=0.0,
                trend_direction="stable",
                data_points=0,
                period_start=cutoff_date,
                period_end=datetime.utcnow(),
            )

        # Build sentiment series
        sentiment_series = [(s.recorded_at, s.sentiment_score) for s in sentiments]

        # Calculate metrics
        scores = [s.sentiment_score for s in sentiments]
        average_sentiment = sum(scores) / len(scores)

        # Calculate change over period
        if len(sentiments) >= 2:
            first_half = sentiments[: len(sentiments) // 2]
            second_half = sentiments[len(sentiments) // 2 :]

            first_avg = sum(s.sentiment_score for s in first_half) / len(first_half)
            second_avg = sum(s.sentiment_score for s in second_half) / len(second_half)

            sentiment_change = second_avg - first_avg

            if sentiment_change > 0.1:
                trend_direction = "improving"
            elif sentiment_change < -0.1:
                trend_direction = "declining"
            else:
                trend_direction = "stable"
        else:
            sentiment_change = 0.0
            trend_direction = "stable"

        # Get politician name
        from app.db.models import President

        politician = db.query(President).filter(President.id == politician_id).first()
        politician_name = politician.name if politician else None

        return SentimentTrend(
            politician_id=str(politician_id),
            politician_name=politician_name,
            sentiment_series=sentiment_series,
            average_sentiment=average_sentiment,
            sentiment_change=sentiment_change,
            trend_direction=trend_direction,
            data_points=len(sentiments),
            period_start=cutoff_date,
            period_end=datetime.utcnow(),
        )

    def store_sentiment_snapshot(
        self,
        db: Session,
        target_type: str,
        target_id: int,
        target_name: str,
        analysis: SentimentAnalysis,
    ) -> int:
        """Store sentiment analysis result in database"""
        snapshot = SentimentSnapshot(
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            sentiment_score=analysis.score,
            polarity=analysis.polarity.value,
            confidence=analysis.confidence,
            source_type=analysis.source.value if analysis.source else None,
            source_url=analysis.source_url,
            text_sample=analysis.text[:1000],  # Truncate for storage
            analyzed_at=analysis.analyzed_at,
            model_version=self.model_type.value,
        )

        db.add(snapshot)
        db.commit()
        db.refresh(snapshot)

        logger.info(f"Stored sentiment snapshot {snapshot.id}")
        return snapshot.id

    def cleanup(self):
        """Clean up resources"""
        if self.analyzer:
            self.analyzer.cleanup()
            self.analyzer = None
        self.initialized = False


# ============================================================================
# Singleton Instance
# ============================================================================

_sentiment_service: Optional[SentimentAnalysisService] = None


def get_sentiment_service() -> SentimentAnalysisService:
    """Get singleton instance of sentiment analysis service"""
    global _sentiment_service

    if _sentiment_service is None:
        _sentiment_service = SentimentAnalysisService()
        _sentiment_service.initialize()

    return _sentiment_service


def reset_sentiment_service():
    """Reset sentiment service singleton (for testing)"""
    global _sentiment_service

    if _sentiment_service:
        _sentiment_service.cleanup()
        _sentiment_service = None
