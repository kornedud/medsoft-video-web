import json
import logging
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.config import settings
from app.db import async_session_maker
from app.services import room_presence
from app.services import rooms as rooms_service
from app.ws.signaling_hub import hub

logger = logging.getLogger(__name__)

router = APIRouter(tags=["signaling"])

MAX_WS_PAYLOAD = 64 * 1024


def _origin_allowed(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    if origin is None:
        return True
    allowed = {o.strip() for o in settings.frontend_origins.split(",") if o.strip()}
    return origin in allowed


@router.websocket("/ws/room/{share_token}")
async def room_signaling(
    websocket: WebSocket,
    share_token: str,
    client_id: str = Query(..., min_length=4, max_length=128),
) -> None:
    await websocket.accept()
    if not _origin_allowed(websocket):
        await websocket.close(code=1008)
        return

    async with async_session_maker() as session:
        room = await rooms_service.get_room_by_token(session, share_token)

    if room is None:
        await websocket.send_json({"type": "system", "event": "not_found"})
        await websocket.close(code=1008)
        return

    if room.status != "active":
        await websocket.send_json({"type": "system", "event": "room_ended"})
        await websocket.close(code=1000)
        return

    ok, _n = await room_presence.join(room.id, client_id)
    if not ok:
        await websocket.send_json({"type": "system", "event": "room_full"})
        await websocket.close(code=1008)
        return

    err = await hub.attach(room.id, client_id, websocket)
    if err:
        await room_presence.leave(room.id, client_id)
        await websocket.send_json({"type": "system", "event": "room_full"})
        await websocket.close(code=1008)
        return

    room_id = room.id
    try:
        cnt = await room_presence.count(room_id)
        await websocket.send_json(
            {
                "type": "system",
                "event": "connected",
                "participant_count": cnt,
                "client_id": client_id,
            },
        )
        peer = await hub.get_peer_ws(room_id, client_id)
        if peer is not None and peer.client_state == WebSocketState.CONNECTED:
            try:
                await peer.send_json(
                    {"type": "system", "event": "peer_joined", "peer_id": client_id},
                )
            except Exception:
                pass

        while True:
            raw = await websocket.receive_text()
            if len(raw) > MAX_WS_PAYLOAD:
                continue
            try:
                msg: dict[str, Any] = json.loads(raw)
            except json.JSONDecodeError:
                continue
            mtype = msg.get("type")
            if mtype == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if mtype == "signal":
                payload = msg.get("payload")
                peer_ws = await hub.get_peer_ws(room_id, client_id)
                if peer_ws is not None and peer_ws.client_state == WebSocketState.CONNECTED:
                    try:
                        await peer_ws.send_json(
                            {
                                "type": "signal",
                                "from": client_id,
                                "payload": payload,
                            },
                        )
                    except Exception:
                        pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("room ws error: %s", e)
    finally:
        peer = await hub.get_peer_ws(room_id, client_id)
        await hub.detach(room_id, client_id, websocket)
        await room_presence.leave(room_id, client_id)
        if peer is not None and peer.client_state == WebSocketState.CONNECTED:
            try:
                await peer.send_json(
                    {"type": "system", "event": "peer_left", "peer_id": client_id},
                )
            except Exception:
                pass
