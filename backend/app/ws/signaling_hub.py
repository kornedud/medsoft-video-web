import asyncio
import uuid

from starlette.websockets import WebSocket, WebSocketState


class SignalingHub:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._sockets: dict[uuid.UUID, dict[str, WebSocket]] = {}

    async def attach(
        self,
        room_id: uuid.UUID,
        client_id: str,
        ws: WebSocket,
    ) -> str | None:
        async with self._lock:
            m = self._sockets.setdefault(room_id, {})
            if client_id in m:
                old = m[client_id]
                if old.client_state == WebSocketState.CONNECTED:
                    try:
                        await old.close(code=1000, reason="replaced")
                    except Exception:
                        pass
                m[client_id] = ws
                return None
            if len(m) >= 2:
                return "room_full"
            m[client_id] = ws
            return None

    async def detach(
        self,
        room_id: uuid.UUID,
        client_id: str,
        ws: WebSocket | None = None,
    ) -> None:
        async with self._lock:
            m = self._sockets.get(room_id)
            if not m:
                return
            cur = m.get(client_id)
            if cur is None:
                return
            if ws is not None and cur is not ws:
                return
            m.pop(client_id, None)
            if not m:
                self._sockets.pop(room_id, None)

    async def disconnect_room(self, room_id: uuid.UUID) -> None:
        async with self._lock:
            m = self._sockets.pop(room_id, None)
        if not m:
            return
        for ws in m.values():
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.close(code=1000, reason="room ended")
            except Exception:
                pass

    async def get_peer_ws(
        self,
        room_id: uuid.UUID,
        client_id: str,
    ) -> WebSocket | None:
        async with self._lock:
            m = self._sockets.get(room_id, {})
            for cid, ws in m.items():
                if cid != client_id:
                    return ws
            return None

    async def room_socket_count(self, room_id: uuid.UUID) -> int:
        async with self._lock:
            return len(self._sockets.get(room_id, {}))


hub = SignalingHub()
