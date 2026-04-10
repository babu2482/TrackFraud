"""
Claim Detection Service for The Glass House

This module provides NLP-powered promise and claim detection from politician
speeches, press releases, tweets, and other public statements.

It extracts structured information about campaign promises including:
- The actual promise text
- Deadline/timeline
- Topic categorization
- Confidence scores
- Source attribution
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import nltk
import numpy as np
import spacy
from nltk.sentiment import SentimentIntensityAnalyzer
from spacy.tokens import Doc

# Download required NLTK data
nltk.download("vader_lexicon", quiet=True)

logger = logging.getLogger(__name__)


class ClaimType(Enum):
    """Types of political claims and promises"""

    CAMPAIGN_PROMISE = "campaign_promise"
    POLICY_COMMITMENT = "policy_commitment"
    LEGISLATIVE_ACTION = "legislative_action"
    SPENDING_PROMISE = "spending_promise"
    REGULATORY_ACTION = "regulatory_action"
    EXECUTIVE_ACTION = "executive_action"
    FOREIGN_POLICY = "foreign_policy"
    DOMESTIC_POLICY = "domestic_policy"
    ECONOMIC_PROMISE = "economic_promise"
    SOCIAL_POLICY = "social_policy"
    INFRASTRUCTURE = "infrastructure"
    EDUCATION = "education"
    HEALTHCARE = "healthcare"
    ENVIRONMENT = "environment"
    IMMIGRATION = "immigration"
    JUSTICE_REFORM = "justice_reform"
    DEFENSE = "defense"
    TAX_POLICY = "tax_policy"
    TRADE_POLICY = "trade_policy"
    GENERAL_STATEMENT = "general_statement"


class ConfidenceLevel(Enum):
    """Confidence levels for detected claims"""

    HIGH = "high"  # 80-100%
    MEDIUM = "medium"  # 60-79%
    LOW = "low"  # 40-59%
    UNCERTAIN = "uncertain"  # <40%


@dataclass
class Timeline:
    """Represents the timeline/deadline of a promise"""

    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_immediate: bool = False
    timeframe_text: Optional[str] = None
    deadline_type: Optional[str] = None  # "specific_date", "term", "election", "vague"

    @property
    def is_past_deadline(self) -> bool:
        """Check if the deadline has passed"""
        if self.end_date and datetime.now() > self.end_date:
            return True
        return False

    def days_until_deadline(self) -> Optional[int]:
        """Calculate days until deadline"""
        if not self.end_date:
            return None
        return (self.end_date - datetime.now()).days


@dataclass
class Metrics:
    """Success metrics for evaluating promise fulfillment"""

    metric_type: str  # "quantitative", "qualitative", "binary"
    target_value: Optional[Any] = None
    current_value: Optional[Any] = None
    unit: Optional[str] = None  # "dollars", "percentage", "count", etc.
    threshold: Optional[float] = None
    evaluation_criteria: Optional[str] = None

    def is_met(self) -> Optional[bool]:
        """Check if metrics are met (if quantitative)"""
        if not self.current_value or not self.threshold:
            return None
        return self.current_value >= self.threshold


@dataclass
class DetectedClaim:
    """Represents a detected political claim or promise"""

    claim_id: str
    text: str
    politician_name: str
    politician_id: Optional[str] = None
    source_url: Optional[str] = None
    source_type: Optional[str] = None  # speech, tweet, press_release, interview
    publication_date: Optional[datetime] = None
    claim_type: Optional[ClaimType] = None
    topic_tags: List[str] = field(default_factory=list)
    confidence_score: float = 0.0
    confidence_level: ConfidenceLevel = ConfidenceLevel.UNCERTAIN
    timeline: Optional[Timeline] = None
    metrics: List[Metrics] = field(default_factory=list)
    sentiment_score: float = 0.0
    context_before: Optional[str] = None
    context_after: Optional[str] = None
    related_claims: List[str] = field(default_factory=list)
    verification_status: str = "pending"
    fulfillment_status: str = "not_started"
    fulfillment_score: float = 0.0
    extracted_entities: Dict[str, Any] = field(default_factory=dict)
    nlp_metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses"""
        return {
            "claim_id": self.claim_id,
            "text": self.text,
            "politician_name": self.politician_name,
            "politician_id": self.politician_id,
            "source_url": self.source_url,
            "source_type": self.source_type,
            "publication_date": self.publication_date.isoformat()
            if self.publication_date
            else None,
            "claim_type": self.claim_type.value if self.claim_type else None,
            "topic_tags": self.topic_tags,
            "confidence_score": round(self.confidence_score, 2),
            "confidence_level": self.confidence_level.value,
            "timeline": {
                "start_date": self.timeline.start_date.isoformat()
                if self.timeline and self.timeline.start_date
                else None,
                "end_date": self.timeline.end_date.isoformat()
                if self.timeline and self.timeline.end_date
                else None,
                "is_immediate": self.timeline.is_immediate if self.timeline else False,
                "timeframe_text": self.timeline.timeframe_text
                if self.timeline
                else None,
                "deadline_type": self.timeline.deadline_type if self.timeline else None,
                "is_past_deadline": self.timeline.is_past_deadline
                if self.timeline
                else None,
            }
            if self.timeline
            else None,
            "metrics": [vars(m) for m in self.metrics],
            "sentiment_score": round(self.sentiment_score, 2),
            "verification_status": self.verification_status,
            "fulfillment_status": self.fulfillment_status,
            "fulfillment_score": round(self.fulfillment_score, 2),
        }


class ClaimDetector:
    """
    NLP-powered claim and promise detection engine

    This service uses advanced NLP techniques to identify and extract
    campaign promises and political claims from various text sources.
    """

    # Keywords and patterns for different claim types
    PROMISE_PATTERNS = [
        r"\bI (will|promise|pledge|commit|guarantee|vow)\b",
        r"\bwe (will|promise|pledge|commit|guarantee|vow|plan|intend)\b",
        r"\bmy administration (will|plans to|intends to)\b",
        r"\bon (my|our) watch, (we|I) will\b",
        r"\b(if elected,? (I|we) (will|shall))\b",
        r"\bI (am committed to|am dedicated to|am determined to)\b",
        r"\bthis (is a|stands as) promise\b",
        r"\byou (can count on|can bet on) (me|us)\b",
    ]

    TIMELINE_PATTERNS = [
        (
            r"\bby (20\d{2}|next year|this year|the end of|the (first|second) term)\b",
            "specific_date",
        ),
        (r"\bwithin (\d+ (days|months|years|weeks))\b", "duration"),
        (r"\b(in|by) (day one|day 1|the first (days?|weeks?|months?))\b", "immediate"),
        (r"\bonce (I am|we are) (elected|president|in office)\b", "election"),
        (r"\bover (the next|my|our) (\d+ years?)\b", "term"),
    ]

    TOPIC_KEYWORDS = {
        ClaimType.HEALTHCARE: [
            "healthcare",
            "health care",
            "medical",
            "insurance",
            "medicare",
            "medicaid",
            "hospitals",
            "doctors",
            "prescription",
            "drugs",
            "pharmaceutical",
            "affordable care",
        ],
        ClaimType.EDUCATION: [
            "education",
            "schools",
            "universities",
            "college",
            "student loans",
            "teachers",
            "classrooms",
            "tuition",
            "K-12",
            "higher education",
        ],
        ClaimType.ECONOMIC_PROMISE: [
            "economy",
            "jobs",
            "employment",
            "unemployment",
            "gdp",
            "growth",
            "prosperity",
            "wages",
            "salaries",
            "middle class",
            "income",
        ],
        ClaimType.TAX_POLICY: [
            "tax",
            "taxes",
            "revenue",
            "income tax",
            "corporate tax",
            "tax cut",
            "tax relief",
            "fiscal",
            "budget",
            "deficit",
            "debt",
        ],
        ClaimType.ENVIRONMENT: [
            "climate",
            "environment",
            "green",
            "renewable",
            "energy",
            "carbon",
            "emissions",
            "pollution",
            "clean energy",
            "global warming",
            "fossil fuels",
        ],
        ClaimType.IMMIGRATION: [
            "immigration",
            "immigrant",
            "border",
            "visa",
            "asylum",
            "refugee",
            "deportation",
            "citizenship",
            "naturalization",
            " DACA",
            "dreamers",
        ],
        ClaimType.INFRASTRUCTURE: [
            "infrastructure",
            "roads",
            "bridges",
            "transportation",
            "highways",
            "rail",
            "ports",
            "airports",
            "broadband",
            "digital",
        ],
        ClaimType.JUSTICE_REFORM: [
            "justice",
            "criminal justice",
            "police",
            "prison",
            "bail",
            "sentencing",
            "reform",
            "law enforcement",
            "court",
        ],
        ClaimType.DEFENSE: [
            "defense",
            "military",
            "army",
            "navy",
            "air force",
            "veterans",
            "troops",
            "war",
            "conflict",
            "national security",
            "pentagon",
        ],
        ClaimType.TRADE_POLICY: [
            "trade",
            "tariff",
            "exports",
            "imports",
            "manufacturing",
            "china",
            "mexico",
            "nfta",
            "wto",
            "protectionism",
            "free trade",
        ],
        ClaimType.FOREIGN_POLICY: [
            "foreign policy",
            "diplomacy",
            "nato",
            "allies",
            "sanctions",
            "embassy",
            "international",
            "treaty",
            "agreement",
        ],
    }

    def __init__(self, model_name: str = "en_core_web_md"):
        """Initialize the claim detector with NLP models"""
        logger.info(f"Initializing ClaimDetector with model: {model_name}")

        try:
            # Load spaCy model
            self.nlp = spacy.load(model_name)
            logger.info("spaCy model loaded successfully")
        except OSError as e:
            logger.warning(f"Could not load spaCy model {model_name}: {e}")
            logger.info("Using fallback regex-based detection")
            self.nlp = None

        # Initialize sentiment analyzer
        self.sia = SentimentIntensityAnalyzer()

        # Compile regex patterns
        self.promise_patterns = [
            re.compile(pattern, re.IGNORECASE) for pattern in self.PROMISE_PATTERNS
        ]
        self.timeline_patterns = [
            (re.compile(pattern), dtype) for pattern, dtype in self.TIMELINE_PATTERNS
        ]

        # Create topic keyword sets for faster lookup
        self.topic_keywords = {
            claim_type: set(keywords)
            for claim_type, keywords in self.TOPIC_KEYWORDS.items()
        }

        # Cache for entity recognition
        self.entity_cache: Dict[str, Any] = {}

    def detect_claims(
        self,
        text: str,
        politician_name: str,
        source_url: Optional[str] = None,
        source_type: Optional[str] = None,
        publication_date: Optional[datetime] = None,
    ) -> List[DetectedClaim]:
        """
        Detect and extract all claims from a text document

        Args:
            text: The text content to analyze
            politician_name: Name of the politician making the claims
            source_url: URL where the statement was published
            source_type: Type of source (speech, tweet, press_release, etc.)
            publication_date: When the statement was made

        Returns:
            List of DetectedClaim objects
        """
        logger.info(
            f"Detecting claims from text ({len(text)} chars) by {politician_name}"
        )

        claims = []

        # Preprocess text
        text = self._preprocess_text(text)

        # Split into sentences for better claim extraction
        sentences = self._split_into_sentences(text)

        for i, sentence in enumerate(sentences):
            # Skip very short sentences
            if len(sentence.split()) < 5:
                continue

            # Check if sentence contains a promise pattern
            if not self._contains_promise_pattern(sentence):
                continue

            # Extract claim from sentence
            claim = self._extract_claim(
                sentence,
                politician_name,
                source_url,
                source_type,
                publication_date,
                context_before=sentences[max(0, i - 1)] if len(sentences) > 1 else None,
                context_after=sentences[min(len(sentences) - 1, i + 1)]
                if len(sentences) > 1
                else None,
            )

            if claim and claim.confidence_score >= 0.4:
                claims.append(claim)

        logger.info(f"Detected {len(claims)} claims from text")
        return claims

    def _preprocess_text(self, text: str) -> str:
        """Preprocess text for NLP analysis"""
        # Normalize whitespace
        text = re.sub(r"\s+", " ", text).strip()

        # Convert to lowercase for pattern matching (but preserve for NLP)
        # Note: We'll keep original case for NLP processing

        return text

    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences"""
        if self.nlp:
            doc = self.nlp(text)
            return [sent.text for sent in doc.sents if len(sent.text.strip()) > 10]
        else:
            # Fallback: split on common sentence endings
            sentences = re.split(r"(?<=[.!?])\s+", text)
            return [s.strip() for s in sentences if len(s.strip()) > 10]

    def _contains_promise_pattern(self, text: str) -> bool:
        """Check if text contains any promise patterns"""
        for pattern in self.promise_patterns:
            if pattern.search(text):
                return True
        return False

    def _extract_claim(
        self,
        text: str,
        politician_name: str,
        source_url: Optional[str],
        source_type: Optional[str],
        publication_date: Optional[datetime],
        context_before: Optional[str] = None,
        context_after: Optional[str] = None,
    ) -> Optional[DetectedClaim]:
        """Extract structured claim from a sentence"""

        # Generate unique claim ID
        claim_id = f"claim_{hash(text + politician_name)}_{datetime.now().timestamp()}"

        # Detect claim type based on content
        claim_type = self._detect_claim_type(text)

        # Extract topic tags
        topic_tags = self._extract_topics(text)

        # Extract timeline information
        timeline = self._extract_timeline(text)

        # Extract metrics if present
        metrics = self._extract_metrics(text)

        # Calculate sentiment
        sentiment_score = self._calculate_sentiment(text)

        # Calculate confidence score
        confidence_score = self._calculate_confidence(
            text, claim_type, topic_tags, timeline, metrics
        )

        # Extract entities using NLP
        extracted_entities = self._extract_entities(text)

        # Create claim object
        claim = DetectedClaim(
            claim_id=claim_id,
            text=text,
            politician_name=politician_name,
            source_url=source_url,
            source_type=source_type,
            publication_date=publication_date,
            claim_type=claim_type,
            topic_tags=topic_tags,
            confidence_score=confidence_score,
            confidence_level=self._get_confidence_level(confidence_score),
            timeline=timeline if timeline else None,
            metrics=metrics,
            sentiment_score=sentiment_score,
            context_before=context_before,
            context_after=context_after,
            extracted_entities=extracted_entities,
            nlp_metadata={
                "word_count": len(text.split()),
                "has_numerical_value": bool(re.search(r"\d+", text)),
                "has_deadline": timeline is not None,
                "has_metrics": len(metrics) > 0,
            },
        )

        return claim

    def _detect_claim_type(self, text: str) -> Optional[ClaimType]:
        """Determine the type of claim based on content"""
        text_lower = text.lower()

        # Check each topic's keywords
        for claim_type, keywords in self.topic_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                return claim_type

        # Check for spending promises
        if re.search(r"\$[\d,.]+", text) or any(
            word in text_lower
            for word in [
                "billion",
                "million",
                "trillion",
                "dollars",
                "funding",
                "spending",
            ]
        ):
            return ClaimType.SPENDING_PROMISE

        # Check for legislative action
        if any(
            word in text_lower for word in ["bill", "law", "legislation", "legislative"]
        ):
            return ClaimType.LEGISLATIVE_ACTION

        # Check for executive action
        if any(
            word in text_lower
            for word in ["executive order", "administrative", "agency"]
        ):
            return ClaimType.EXECUTIVE_ACTION

        return ClaimType.GENERAL_STATEMENT

    def _extract_topics(self, text: str) -> List[str]:
        """Extract topic tags from text"""
        text_lower = text.lower()
        topics = []

        for claim_type, keywords in self.topic_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                topics.append(claim_type.value)

        return list(set(topics))  # Remove duplicates

    def _extract_timeline(self, text: str) -> Optional[Timeline]:
        """Extract timeline/deadline information from text"""
        timeline_info = None

        for pattern, dtype in self.timeline_patterns:
            match = pattern.search(text)
            if match:
                timeline_text = match.group(0)

                # Parse specific dates
                if "20" in timeline_text:
                    year = int(timeline_text[2:4])
                    if year > 2000:
                        timeline_info = Timeline(
                            end_date=datetime(year, 12, 31),
                            timeframe_text=timeline_text,
                            deadline_type="specific_date",
                        )
                        break

                # Parse immediate deadlines
                elif (
                    "day one" in timeline_text.lower()
                    or "day 1" in timeline_text.lower()
                ):
                    timeline_info = Timeline(
                        is_immediate=True,
                        timeframe_text=timeline_text,
                        deadline_type="immediate",
                    )
                    break

                # Parse duration-based deadlines
                elif re.search(r"\d+ (days?|months?|years?|weeks?)", timeline_text):
                    timeline_info = Timeline(
                        timeframe_text=timeline_text, deadline_type="duration"
                    )
                    break

        return timeline_info

    def _extract_metrics(self, text: str) -> List[Metrics]:
        """Extract quantitative metrics from text"""
        metrics = []

        # Look for numerical values with units
        number_patterns = [
            (r"(\$[\d,.]+)", "dollars", "monetary"),
            (r"(\d+(?:\.\d+)?)\s*(millions?|billions?|trillions?)", "count", "scale"),
            (r"(\d+(?:\.\d+)?)\s*%", "percentage", "rate"),
            (r"(\d+)\s*(jobs?|positions|roles)", "count", "employment"),
            (
                r"(\d+(?:\.\d+)?)\s*%?\s*(reduction|increase|growth|decrease)",
                "percentage",
                "change",
            ),
        ]

        for pattern, unit, metric_type in number_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    value_str = match.group(1)

                    # Convert to float
                    if "$" in value_str:
                        value = float(value_str.replace("$", "").replace(",", ""))
                    elif any(
                        word in value_str.lower()
                        for word in ["million", "billion", "trillion"]
                    ):
                        multiplier = {"million": 1e6, "billion": 1e9, "trillion": 1e12}
                        base = float(re.sub(r"[a-zA-Z]", "", value_str))
                        for word, mult in multiplier.items():
                            if word in value_str.lower():
                                value = base * mult
                                break
                    else:
                        value = float(value_str)

                    metrics.append(
                        Metrics(
                            metric_type=metric_type,
                            target_value=value,
                            unit=unit,
                            threshold=value,
                            evaluation_criteria=f"Reach target of {value} {unit}",
                        )
                    )
                except (ValueError, IndexError):
                    continue

        return metrics

    def _calculate_sentiment(self, text: str) -> float:
        """Calculate sentiment score for the text"""
        scores = self.sia.polarity_scores(text)
        return scores["compound"]  # Returns value between -1 and 1

    def _calculate_confidence(
        self,
        text: str,
        claim_type: Optional[ClaimType],
        topic_tags: List[str],
        timeline: Optional[Timeline],
        metrics: List[Metrics],
    ) -> float:
        """
        Calculate confidence score for the detected claim

        Scoring factors:
        - Has clear promise pattern: +20%
        - Has specific timeline: +15%
        - Has measurable metrics: +20%
        - Has identified topic: +10%
        - Sentence length appropriateness: +10%
        - Contains specific numbers: +10%
        - Contains politician name or first-person: +10%
        - Has action verbs: +5%
        """
        score = 0.0

        # Base score for matching promise pattern
        if self._contains_promise_pattern(text):
            score += 0.20

        # Timeline bonus
        if timeline:
            score += 0.15

        # Metrics bonus
        if metrics:
            score += min(0.20, len(metrics) * 0.10)

        # Topic identification bonus
        if claim_type and claim_type != ClaimType.GENERAL_STATEMENT:
            score += 0.10

        # Sentence length bonus (optimal is 10-30 words)
        word_count = len(text.split())
        if 10 <= word_count <= 30:
            score += 0.10
        elif 5 <= word_count < 10 or 30 < word_count <= 50:
            score += 0.05

        # Numerical value bonus
        if re.search(r"\d+", text):
            score += 0.10

        # First-person or politician reference bonus
        if any(
            word in text.lower()
            for word in ["i ", "we ", "my ", "our ", "i'll", "we'll"]
        ):
            score += 0.10

        # Action verb bonus
        action_verbs = [
            "will",
            "promise",
            "pledge",
            "commit",
            "guarantee",
            "ensure",
            "deliver",
            "achieve",
        ]
        if any(verb in text.lower() for verb in action_verbs):
            score += 0.05

        # Cap at 1.0
        return min(1.0, score)

    def _get_confidence_level(self, score: float) -> ConfidenceLevel:
        """Convert numeric confidence score to categorical level"""
        if score >= 0.8:
            return ConfidenceLevel.HIGH
        elif score >= 0.6:
            return ConfidenceLevel.MEDIUM
        elif score >= 0.4:
            return ConfidenceLevel.LOW
        else:
            return ConfidenceLevel.UNCERTAIN

    def _extract_entities(self, text: str) -> Dict[str, Any]:
        """Extract named entities using NLP"""
        if not self.nlp:
            return {}

        doc = self.nlp(text)
        entities = {
            "persons": [],
            "organizations": [],
            "locations": [],
            "dates": [],
            "money": [],
            "percentages": [],
        }

        for ent in doc.ents:
            if ent.label_ == "PERSON":
                entities["persons"].append(ent.text)
            elif ent.label_ == "ORG":
                entities["organizations"].append(ent.text)
            elif ent.label_ in ["GPE", "LOC"]:
                entities["locations"].append(ent.text)
            elif ent.label_ == "DATE":
                entities["dates"].append(ent.text)
            elif ent.label_ == "MONEY":
                entities["money"].append(ent.text)
            elif ent.label_ == "PERCENT":
                entities["percentages"].append(ent.text)

        return entities

    def batch_detect_claims(
        self, documents: List[Dict[str, Any]]
    ) -> List[List[DetectedClaim]]:
        """
        Process multiple documents and extract claims from each

        Args:
            documents: List of dicts with 'text', 'politician_name', and optional metadata

        Returns:
            List of lists of DetectedClaim objects
        """
        all_claims = []

        for doc in documents:
            claims = self.detect_claims(
                text=doc["text"],
                politician_name=doc.get("politician_name", "Unknown"),
                source_url=doc.get("source_url"),
                source_type=doc.get("source_type"),
                publication_date=doc.get("publication_date"),
            )
            all_claims.append(claims)

        return all_claims

    def validate_claim(self, claim: DetectedClaim) -> Tuple[bool, List[str]]:
        """
        Validate a detected claim for quality and completeness

        Returns:
            Tuple of (is_valid, list of validation messages)
        """
        is_valid = True
        messages = []

        # Check minimum confidence
        if claim.confidence_score < 0.4:
            is_valid = False
            messages.append(f"Low confidence score: {claim.confidence_score:.2f}")

        # Check text length
        if len(claim.text) < 20:
            messages.append(f"Short text: {len(claim.text)} characters")

        # Check for politician name
        if not claim.politician_name or claim.politician_name == "Unknown":
            messages.append("Missing politician name")

        # Check for claim type
        if not claim.claim_type:
            messages.append("No claim type detected")

        # Check for topic tags
        if not claim.topic_tags:
            messages.append("No topic tags identified")

        # Check source attribution
        if not claim.source_url:
            messages.append("No source URL provided")

        return is_valid, messages


# Singleton instance for global use
_claim_detector_instance: Optional[ClaimDetector] = None


def get_claim_detector(model_name: str = "en_core_web_md") -> ClaimDetector:
    """Get or create the singleton claim detector instance"""
    global _claim_detector_instance
    if _claim_detector_instance is None:
        _claim_detector_instance = ClaimDetector(model_name=model_name)
    return _claim_detector_instance
