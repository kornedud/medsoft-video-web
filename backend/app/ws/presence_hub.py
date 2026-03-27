import asyncio
import logging

from starlette.websockets import WebSocket, WebSocketState

logger = logging.getLogger(__name__)


class PresenceHub:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._sockets: dict[int, WebSocket] = {}

    async def register(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            old = self._sockets.get(user_id)
            if old is not None and old.client_state == WebSocketState.CONNECTED:
                try:
                    await old.close(code=1000, reason="replaced")
                except Exception:
                    pass
            self._sockets[user_id] = ws

    async def unregister(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            cur = self._sockets.get(user_id)
            if cur is ws:
                del self._sockets[user_id]

    async def get_online_user_ids(self) -> list[int]:
        async with self._lock:
            return [
                uid
                for uid, ws in self._sockets.items()
                if ws.client_state == WebSocketState.CONNECTED
            ]

    async def send_to_user(self, user_id: int, message: dict) -> bool:
        async with self._lock:
            ws = self._sockets.get(user_id)
        if ws is None or ws.client_state != WebSocketState.CONNECTED:
            return False
        try:
            await ws.send_json(message)
            return True
        except Exception:
            return False

    async def broadcast(self, message: dict, exclude: int | None = None) -> None:
        async with self._lock:
            targets = [
                ws
                for uid, ws in self._sockets.items()
                if uid != exclude and ws.client_state == WebSocketState.CONNECTED
            ]
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                pass


presence = PresenceHub()
