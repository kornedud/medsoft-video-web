from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.session import SESSION_COOKIE_NAME, create_session_token
from app.config import settings
from app.db import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    MessageResponse,
    RegisterRequest,
    RegisterResponse,
    UserPublic,
)
from app.services import users as users_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _attach_session_cookie(response: Response, user_id: int) -> None:
    token = create_session_token(user_id)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/register", response_model=RegisterResponse)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> RegisterResponse:
    try:
        user = await users_service.create_user(db, body.login, body.password)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот логин уже занят.",
        )
    return RegisterResponse(id=user.id, login=user.login)


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    user = await users_service.get_user_by_login(db, body.login)
    if user is None or not users_service.verify_password(
        body.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль.",
        )
    _attach_session_cookie(response, user.id)
    return LoginResponse(
        message="Вход выполнен успешно.",
        user=UserPublic(id=user.id, login=user.login),
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response) -> MessageResponse:
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    return MessageResponse(message="Вы вышли из аккаунта.")


@router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic(id=user.id, login=user.login)


@router.get("/users", response_model=list[UserPublic])
async def list_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserPublic]:
    all_users = await users_service.get_all_users(db)
    return [UserPublic(id=u.id, login=u.login) for u in all_users if u.id != user.id]
