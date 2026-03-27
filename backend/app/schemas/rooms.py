from uuid import UUID

from pydantic import BaseModel, Field


class RoomCreatedResponse(BaseModel):
    room_id: UUID
    share_token: str


class ClientIdBody(BaseModel):
    client_id: str = Field(..., min_length=4, max_length=128)


class RoomStatusPublic(BaseModel):
    room_id: UUID
    status: str
    participant_count: int
    is_full: bool
    in_room: bool
    may_end_call: bool


class JoinResponse(BaseModel):
    participant_count: int
