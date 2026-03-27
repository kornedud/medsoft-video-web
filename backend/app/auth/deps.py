from fastapi import Depends, HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.session import SESSION_COOKIE_NAME, decode_session_token
from app.db import get_db
from app.models.user import User


async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    raw = request.cookies.get(SESSION_COOKIE_NAME)
    if not raw:
        return None
    try:
        user_id = decode_session_token(raw)
    except (BadSignature, SignatureExpired, KeyError, ValueError, TypeError):
        return None
    r = await db.execute(select(User).where(User.id == user_id))
    return r.scalar_one_or_none()


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    raw = request.cookies.get(SESSION_COOKIE_NAME)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется войти в систему.",
        )
    try:
        user_id = decode_session_token(raw)
    except (BadSignature, SignatureExpired, KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия недействительна. Войдите снова.",
        )
    r = await db.execute(select(User).where(User.id == user_id))
    user = r.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден.",
        )
    return user
