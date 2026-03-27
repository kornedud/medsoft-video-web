import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, get_current_user_optional
from app.db import get_db
from app.models.user import User
from app.schemas.auth import MessageResponse
from app.schemas.rooms import (
    ClientIdBody,
    JoinResponse,
    RoomCreatedResponse,
    RoomStatusPublic,
)
from app.services import room_presence
from app.services import rooms as rooms_service
from app.ws.signaling_hub import hub

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.post("", response_model=RoomCreatedResponse)
async def create_room(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RoomCreatedResponse:
    room = await rooms_service.create_room(db, user.id)
    return RoomCreatedResponse(room_id=room.id, share_token=room.share_token)


@router.get("/by-token/{share_token}", response_model=RoomStatusPublic)
async def room_status(
    share_token: str,
    db: AsyncSession = Depends(get_db),
    client_id: str | None = Query(None, min_length=4, max_length=128),
    user: User | None = Depends(get_current_user_optional),
) -> RoomStatusPublic:
    room = await rooms_service.get_room_by_token(db, share_token)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Комната не найдена.")
    n = await room_presence.count(room.id)
    in_room = (
        bool(client_id) and await room_presence.has_client(room.id, client_id)
    )
    may_end = user is not None and user.id == room.creator_user_id
    return RoomStatusPublic(
        room_id=room.id,
        status=room.status,
        participant_count=n,
        is_full=n >= 2,
        in_room=in_room,
        may_end_call=may_end,
    )


@router.post("/by-token/{share_token}/join", response_model=JoinResponse)
async def join_room(
    share_token: str,
    body: ClientIdBody,
    db: AsyncSession = Depends(get_db),
) -> JoinResponse:
    room = await rooms_service.get_room_by_token(db, share_token)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Комната не найдена.")
    if room.status != "active":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Звонок завершён.",
        )
    ok, n = await room_presence.join(room.id, body.client_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Комната занята: уже два участника.",
        )
    return JoinResponse(participant_count=n)


@router.post("/by-token/{share_token}/leave", response_model=MessageResponse)
async def leave_room(
    share_token: str,
    body: ClientIdBody,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    room = await rooms_service.get_room_by_token(db, share_token)
    if room is None:
        return MessageResponse(message="OK")
    await room_presence.leave(room.id, body.client_id)
    return MessageResponse(message="OK")


@router.post("/{room_id}/end", response_model=MessageResponse)
async def end_room(
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    room = await rooms_service.get_room_by_id(db, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Комната не найдена.")
    if room.creator_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Завершить звонок может только создатель комнаты.",
        )
    if room.status != "active":
        return MessageResponse(message="Комната уже завершена.")
    await rooms_service.end_room(db, room)
    await hub.disconnect_room(room.id)
    return MessageResponse(message="Звонок завершён.")
