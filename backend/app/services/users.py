import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User


def hash_password(plain: str) -> str:
    rounds = max(4, min(settings.bcrypt_rounds, 31))
    salt = bcrypt.gensalt(rounds=rounds)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("ascii")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            password_hash.encode("ascii"),
        )
    except (ValueError, TypeError):
        return False


async def get_user_by_login(session: AsyncSession, login: str) -> User | None:
    r = await session.execute(select(User).where(User.login == login))
    return r.scalar_one_or_none()


async def get_all_users(session: AsyncSession) -> list[User]:
    r = await session.execute(select(User).order_by(User.login))
    return list(r.scalars().all())


async def create_user(session: AsyncSession, login: str, password: str) -> User:
    user = User(login=login, password_hash=hash_password(password))
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return user
