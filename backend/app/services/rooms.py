import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.room import Room
from app.services import room_presence


def _new_share_token() -> str:
    return secrets.token_urlsafe(24)


async def create_room(session: AsyncSession, creator_user_id: int) -> Room:
    room = Room(
        share_token=_new_share_token(),
        creator_user_id=creator_user_id,
        status="active",
    )
    session.add(room)
    await session.flush()
    await session.refresh(room)
    return room


async def get_room_by_token(session: AsyncSession, share_token: str) -> Room | None:
    r = await session.execute(
        select(Room).where(Room.share_token == share_token),
    )
    return r.scalar_one_or_none()


async def get_room_by_id(session: AsyncSession, room_id: uuid.UUID) -> Room | None:
    r = await session.execute(select(Room).where(Room.id == room_id))
    return r.scalar_one_or_none()


async def end_room(session: AsyncSession, room: Room) -> None:
    room.status = "ended"
    room.ended_at = datetime.now(timezone.utc)
    await room_presence.clear_room(room.id)
