import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from itsdangerous import BadSignature, SignatureExpired
from sqlalchemy import select
from starlette.websockets import WebSocketState

from app.auth.session import SESSION_COOKIE_NAME, decode_session_token
from app.db import async_session_maker
from app.models.user import User
from app.ws.presence_hub import presence

logger = logging.getLogger(__name__)

router = APIRouter(tags=["presence"])

MAX_WS_PAYLOAD = 16 * 1024


async def _authenticate_ws(websocket: WebSocket) -> User | None:
    raw = websocket.cookies.get(SESSION_COOKIE_NAME)
    if not raw:
        return None
    try:
        user_id = decode_session_token(raw)
    except (BadSignature, SignatureExpired, KeyError, ValueError, TypeError):
        return None
    async with async_session_maker() as session:
        r = await session.execute(select(User).where(User.id == user_id))
        return r.scalar_one_or_none()


@router.websocket("/ws/presence")
async def presence_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    user = await _authenticate_ws(websocket)
    if user is None:
        await websocket.send_json({"type": "error", "detail": "unauthorized"})
        await websocket.close(code=1008)
        return

    await presence.register(user.id, websocket)

    try:
        online_ids = await presence.get_online_user_ids()
        await websocket.send_json({
            "type": "online_list",
            "user_ids": online_ids,
        })

        await presence.broadcast(
            {"type": "user_online", "user_id": user.id, "login": user.login},
            exclude=user.id,
        )

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

            if mtype == "call_invite":
                target_id = msg.get("target_user_id")
                share_token = msg.get("share_token")
                if not target_id or not share_token:
                    continue
                await presence.send_to_user(int(target_id), {
                    "type": "incoming_call",
                    "from_user_id": user.id,
                    "from_login": user.login,
                    "share_token": share_token,
                })
                continue

            if mtype == "call_cancel":
                target_id = msg.get("target_user_id")
                if not target_id:
                    continue
                await presence.send_to_user(int(target_id), {
                    "type": "call_cancelled",
                    "from_user_id": user.id,
                })
                continue

            if mtype == "call_accept":
                caller_id = msg.get("caller_user_id")
                share_token = msg.get("share_token")
                if not caller_id or not share_token:
                    continue
                await presence.send_to_user(int(caller_id), {
                    "type": "call_accepted",
                    "by_user_id": user.id,
                    "by_login": user.login,
                    "share_token": share_token,
                })
                continue

            if mtype == "call_decline":
                caller_id = msg.get("caller_user_id")
                if not caller_id:
                    continue
                await presence.send_to_user(int(caller_id), {
                    "type": "call_declined",
                    "by_user_id": user.id,
                    "by_login": user.login,
                })
                continue

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("presence ws error: %s", e)
    finally:
        await presence.unregister(user.id, websocket)
        await presence.broadcast(
            {"type": "user_offline", "user_id": user.id},
            exclude=user.id,
        )
