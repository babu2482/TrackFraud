"""
The Glass House - Authentication Module

JWT-based authentication with OAuth2 password flow.
Handles user registration, login, token management, and role-based access control.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Union
from uuid import uuid4

from app.config import get_settings
from app.db.database import Base
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Get settings
settings = get_settings()

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme for Bearer tokens
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


# ================================
# Pydantic Models
# ================================


class Token(BaseModel):
    """JWT token response"""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Token payload data"""

    username: Optional[str] = None
    user_id: Optional[str] = None
    role: Optional[str] = "user"


class UserInDB(BaseModel):
    """User database model"""

    id: str
    email: str
    hashed_password: str
    full_name: Optional[str] = None
    is_active: bool = True
    is_superuser: bool = False
    role: str = "user"
    created_at: datetime
    updated_at: Optional[datetime] = None


class UserCreate(BaseModel):
    """User registration request"""

    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    """User login request"""

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """User response"""

    id: str
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime


# ================================
# SQLAlchemy User Model
# ================================


class User(Base):
    """User table for authentication"""

    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    role = Column(String(50), default="user")  # user, moderator, admin
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)


# ================================
# JWT Token Functions
# ================================


def create_access_token(
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None,
    role: str = "user",
) -> str:
    """
    Create JWT access token

    Args:
        subject: Username or email to encode in token
        expires_delta: Optional token expiration
        role: User role

    Returns:
        JWT token string
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode: Dict[str, Any] = {
        "sub": subject,
        "exp": expire,
        "iss": settings.JWT_ISSUER,
        "role": role,
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return encoded_jwt


def create_refresh_token(
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create JWT refresh token

    Args:
        subject: Username or email to encode in token
        expires_delta: Optional token expiration

    Returns:
        JWT token string
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES
        )

    to_encode: Dict[str, Any] = {
        "sub": subject,
        "exp": expire,
        "iss": settings.JWT_ISSUER,
        "type": "refresh",
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return encoded_jwt


def verify_token(token: str, require_role: Optional[str] = None) -> Optional[TokenData]:
    """
    Verify JWT token and extract payload

    Args:
        token: JWT token string
        require_role: Optional required role

    Returns:
        TokenData if valid, None if invalid

    Raises:
        HTTPException if token is invalid or role doesn't match
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["sub", "exp", "iss"]},
        )
        username: str = payload.get("sub")
        role: str = payload.get("role", "user")
        token_type: str = payload.get("type", "access")

        if username is None:
            raise credentials_exception

        if token_type == "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token cannot be used as access token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if require_role and role != require_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        return TokenData(username=username, role=role)

    except JWTError as e:
        logger.warning(f"JWT validation error: {str(e)}")
        raise credentials_exception


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decode JWT token without verification (for logging/debugging)

    Args:
        token: JWT token string

    Returns:
        Decoded payload dictionary
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_signature": False},
        )
        return payload
    except Exception as e:
        logger.error(f"Failed to decode token: {str(e)}")
        return {}


# ================================
# Password Hashing Functions
# ================================


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify plain password against hashed password

    Args:
        plain_password: Plain text password
        hashed_password: Hashed password from database

    Returns:
        True if passwords match
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    return pwd_context.hash(password)


# ================================
# Database Dependency Functions
# ================================


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """
    Get user by email from database

    Args:
        db: Database session
        email: User email

    Returns:
        User object if found, None otherwise
    """
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    """
    Get user by ID from database

    Args:
        db: Database session
        user_id: User ID

    Returns:
        User object if found, None otherwise
    """
    return db.query(User).filter(User.id == user_id).first()


def create_user(
    db: Session,
    user_create: UserCreate,
    is_superuser: bool = False,
) -> User:
    """
    Create new user in database

    Args:
        db: Database session
        user_create: UserCreate request model
        is_superuser: Whether user is a superuser

    Returns:
        Created User object
    """
    # Check if user already exists
    existing_user = get_user_by_email(db, user_create.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )

    # Create new user
    hashed_password = get_password_hash(user_create.password)
    db_user = User(
        email=user_create.email,
        hashed_password=hashed_password,
        full_name=user_create.full_name,
        is_superuser=is_superuser,
        role="admin" if is_superuser else "user",
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    logger.info(f"User created: {user_create.email}")
    return db_user


def update_last_login(db: Session, user: User) -> None:
    """
    Update user's last login timestamp

    Args:
        db: Database session
        user: User object
    """
    user.last_login = datetime.utcnow()
    db.commit()


# ================================
# FastAPI Dependency Functions
# ================================


async def get_current_user(
    db,
    token: Optional[str] = Depends(oauth2_scheme),
):
    """
    Get current authenticated user from JWT token

    Args:
        db: Database session
        token: JWT token from request

    Returns:
        Authenticated User object

    Raises:
        HTTPException if token is invalid or user not found
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = verify_token(token)
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user = get_user_by_email(db, token_data.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    # Update last login
    update_last_login(db, user)

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
):
    """
    Get current active user (additional validation layer)

    Args:
        current_user: Authenticated user from get_current_user

    Returns:
        Active user object

    Raises:
        HTTPException if user is not active
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    return current_user


async def get_current_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Get current superuser (admin)

    Args:
        current_user: Authenticated user

    Returns:
        Superuser object

    Raises:
        HTTPException if user is not a superuser
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser privileges required",
        )
    return current_user


async def get_current_user_or_none(
    db: Session,
    token: Optional[str] = Depends(oauth2_scheme),
) -> Optional[User]:
    """
    Get current user or None if not authenticated

    Args:
        db: Database session
        token: JWT token from request

    Returns:
        User object if authenticated, None otherwise
    """
    if not token:
        return None

    try:
        token_data = verify_token(token)
        if not token_data:
            return None

        user = get_user_by_email(db, token_data.username)
        if not user or not user.is_active:
            return None

        return user
    except HTTPException:
        return None


# ================================
# Token Management Functions
# ================================


async def refresh_access_token(
    db: Session,
    refresh_token: str,
) -> Token:
    """
    Generate new access token from refresh token

    Args:
        db: Database session
        refresh_token: Valid refresh token

    Returns:
        New Token with access_token and refresh_token

    Raises:
        HTTPException if refresh token is invalid
    """
    try:
        # Verify refresh token
        payload = jwt.decode(
            refresh_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["sub", "exp", "iss", "type"]},
        )

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token type",
            )

        username: str = payload.get("sub")
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        # Get user from database
        user = get_user_by_email(db, username)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
            )

        # Generate new tokens
        access_token = create_access_token(
            subject=user.email,
            role=user.role,
        )
        new_refresh_token = create_refresh_token(subject=user.email)

        return Token(
            access_token=access_token,
            refresh_token=new_refresh_token,
        )

    except JWTError as e:
        logger.warning(f"Refresh token error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )


# ================================
# Login Endpoint Logic
# ================================


async def authenticate_user(
    db: Session,
    email: str,
    password: str,
) -> Optional[User]:
    """
    Authenticate user with email and password

    Args:
        db: Database session
        email: User email
        password: Plain text password

    Returns:
        User object if authentication successful, None otherwise
    """
    user = get_user_by_email(db, email)
    if not user:
        # Perform dummy check to help prevent user enumeration
        pwd_context.verify(password, "invalid_hash")
        return None

    if not verify_password(password, user.hashed_password):
        return None

    if not user.is_active:
        return None

    return user


async def login_for_access_token(
    db: Session,
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> Token:
    """
    Handle user login and return JWT tokens

    Args:
        db: Database session
        form_data: OAuth2 form data with username/password

    Returns:
        Token with access_token and refresh_token

    Raises:
        HTTPException if authentication fails
    """
    # Authenticate user
    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate tokens
    access_token = create_access_token(
        subject=user.email,
        role=user.role,
    )
    refresh_token = create_refresh_token(subject=user.email)

    # Update last login
    update_last_login(db, user)

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
    )
