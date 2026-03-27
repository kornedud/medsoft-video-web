import asyncio
import uuid

_lock = asyncio.Lock()
_participants: dict[uuid.UUID, set[str]] = {}


async def join(room_id: uuid.UUID, client_id: str) -> tuple[bool, int]:
    async with _lock:
        s = _participants.setdefault(room_id, set())
        if client_id in s:
            return True, len(s)
        if len(s) >= 2:
            return False, len(s)
        s.add(client_id)
        return True, len(s)


async def leave(room_id: uuid.UUID, client_id: str) -> None:
    async with _lock:
        s = _participants.get(room_id)
        if not s:
            return
        s.discard(client_id)
        if not s:
            del _participants[room_id]


async def clear_room(room_id: uuid.UUID) -> None:
    async with _lock:
        _participants.pop(room_id, None)


async def count(room_id: uuid.UUID) -> int:
    async with _lock:
        return len(_participants.get(room_id, set()))


async def has_client(room_id: uuid.UUID, client_id: str) -> bool:
    async with _lock:
        return client_id in _participants.get(room_id, set())
