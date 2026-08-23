"""
WebSocket chat handler.

Each meeting has a WebSocket endpoint at:
    WS /ws/meetings/{meeting_id}/chat?token=<access_token>

All connected clients receive chat messages in real time.
Messages are also persisted to the database.

Connection lifecycle:
  1. Client connects with ?token= query param.
  2. Token is validated; on failure the connection is closed with 1008.
  3. Client is added to the room's connection set.
  4. Incoming text messages are persisted and broadcast.
  5. On disconnect, client is removed from the connection set.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal, get_async_session
from app.core.security import decode_token
from app.models.chat import ChatMessage
from app.models.meeting import Meeting
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["WebSocket"])

# In-memory connection registry: { meeting_id → set[WebSocket] }
# This is sufficient for a single-server Phase 1 deployment.
# Phase 2/3 will replace this with a Redis pub/sub broadcast.
_connections: dict[str, set[WebSocket]] = defaultdict(set)


async def _authenticate(token: str) -> User | None:
    """Validate an access token and return the User or None."""
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.id == user_id, User.is_active == True))  # noqa: E712
        return result.scalar_one_or_none()


async def _persist_message(meeting_id: str, user_id: str, content: str) -> dict:
    """Persist a chat message and return a serialisable dict."""
    async with AsyncSessionLocal() as session:
        msg = ChatMessage(
            meeting_id=meeting_id,
            user_id=user_id,
            content=content,
        )
        session.add(msg)
        await session.commit()

        result = await session.execute(
            select(ChatMessage)
            .where(ChatMessage.id == msg.id)
            .options(selectinload(ChatMessage.user))
        )
        msg = result.scalar_one()

        return {
            "id": msg.id,
            "meeting_id": msg.meeting_id,
            "user_id": msg.user_id,
            "user_name": msg.user.full_name,
            "user_email": msg.user.email,
            "content": msg.content,
            "created_at": msg.created_at.isoformat(),
        }


async def _broadcast(meeting_id: str, payload: dict) -> None:
    """Send a JSON payload to all connected clients in a meeting room."""
    disconnected: set[WebSocket] = set()
    for ws in list(_connections[meeting_id]):
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            disconnected.add(ws)

    for ws in disconnected:
        _connections[meeting_id].discard(ws)


@router.websocket("/meetings/{meeting_id}/chat")
async def chat_ws(websocket: WebSocket, meeting_id: str) -> None:
    token = websocket.query_params.get("token", "")
    user = await _authenticate(token)

    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    _connections[meeting_id].add(websocket)
    logger.info("WS: %s joined meeting %s chat", user.email, meeting_id)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                content = str(data.get("content", "")).strip()
            except (json.JSONDecodeError, AttributeError):
                content = raw.strip()

            if not content:
                continue

            message_payload = await _persist_message(meeting_id, user.id, content)
            await _broadcast(meeting_id, {"type": "chat_message", "data": message_payload})

    except WebSocketDisconnect:
        logger.info("WS: %s left meeting %s chat", user.email, meeting_id)
    except Exception as exc:
        logger.exception("WS error for meeting %s: %s", meeting_id, exc)
    finally:
        _connections[meeting_id].discard(websocket)
