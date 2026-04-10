"""
The Glass House - Authentication API Endpoints

Provides endpoints for user registration, login, token refresh,
and user management.
"""

from datetime import datetime
from typing import Optional

from app.core.auth import (
    Token as TokenModel,
)
from app.core.auth import (
    User,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_user,
    get_current_user,
    get_password_hash,
    get_user_by_email,
    refresh_access_token,
    verify_password,
)
from app.core.auth import (
    UserCreate as UserCreateModel,
)
from app.core.auth import (
    UserResponse as UserResponseModel,
)
from app.db.database import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post(
    "/register", response_model=UserResponseModel, status_code=status.HTTP_201_CREATED
)
async def register(
    user_data: UserCreateModel,
    db: Session = Depends(get_db),
):
    """
    Register a new user account.

    Creates a new user with the provided email and password.
    Returns user details without password.
    """
    # Check if user already exists
    existing_user = get_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )

    # Create new user
    user = create_user(db, user_data)

    return UserResponseModel(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("/login", response_model=TokenModel)
async def login(
    db: Session = Depends(get_db),
    email: str = ...,
    password: str = ...,
):
    """
    Authenticate user and return JWT tokens.

    Accepts email and password, returns access and refresh tokens.
    """
    # Authenticate user
    user = await authenticate_user(db, email, password)
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
    user.last_login = datetime.utcnow()
    db.commit()

    return TokenModel(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post("/refresh", response_model=TokenModel)
async def refresh_tokens(
    refresh_token: str,
    db: Session = Depends(get_db),
):
    """
    Refresh access token using refresh token.

    Returns new access and refresh tokens.
    """
    tokens = await refresh_access_token(db, refresh_token)
    return tokens


@router.get("/me", response_model=UserResponseModel)
async def get_current_user_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get current authenticated user's information.

    Returns user profile without sensitive data.
    """
    return UserResponseModel(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
    )


@router.put("/password")
async def change_password(
    old_password: str,
    new_password: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Change user's password.

    Requires current password to set a new password.
    """
    # Verify old password
    if not verify_password(old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # Validate new password
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long",
        )

    if old_password == new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    # Update password
    current_user.hashed_password = get_password_hash(new_password)
    current_user.updated_at = datetime.utcnow()
    db.commit()

    return {
        "message": "Password updated successfully",
        "updated_at": current_user.updated_at.isoformat(),
    }


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    password: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete user account permanently.

    Requires password confirmation. This action cannot be undone.
    """
    # Verify password
    if not verify_password(password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is incorrect",
        )

    # Delete user
    db.delete(current_user)
    db.commit()

    # Return 204 No Content


@router.post("/verify-email")
async def verify_email(
    email: str,
    db: Session = Depends(get_db),
):
    """
    Verify if an email is already registered.

    Useful for checking email availability during registration.
    """
    user = get_user_by_email(db, email)
    return {
        "email": email,
        "is_available": user is None,
    }


@router.get("/token-info")
async def get_token_info(
    current_user: User = Depends(get_current_user),
):
    """
    Get information about the current token.

    Returns token metadata including expiration and role.
    """
    return {
        "email": current_user.email,
        "role": current_user.role,
        "token_type": "access",
        "message": "Token is valid",
    }
