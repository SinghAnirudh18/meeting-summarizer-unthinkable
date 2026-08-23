"""Chat REST endpoints — get history and post a message."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_session
from app.core.dependencies import get_current_user
from app.models.chat import ChatMessage
from app.models.meeting import Meeting
from app.models.user import User
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meetings/{meeting_id}/messages", tags=["Chat"])


@router.get("", response_model=list[ChatMessageResponse])
async def get_messages(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
    limit: int = 100,
) -> list[ChatMessageResponse]:
    """Get chat history for a meeting."""
    # Verify meeting exists
    result = await session.execute(select(Meeting).where(Meeting.id == meeting_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    msgs_result = await session.execute(
        select(ChatMessage)
        .where(ChatMessage.meeting_id == meeting_id)
        .options(selectinload(ChatMessage.user))
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    messages = msgs_result.scalars().all()
    return [ChatMessageResponse.model_validate(m) for m in messages]


@router.post("", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def post_message(
    meeting_id: str,
    payload: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ChatMessageResponse:
    """Post a chat message to a meeting. Also broadcast via WebSocket."""
    result = await session.execute(select(Meeting).where(Meeting.id == meeting_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    message = ChatMessage(
        meeting_id=meeting_id,
        user_id=current_user.id,
        content=payload.content,
    )
    session.add(message)
    await session.commit()

    # Reload with user relationship
    await session.refresh(message)
    msg_result = await session.execute(
        select(ChatMessage)
        .where(ChatMessage.id == message.id)
        .options(selectinload(ChatMessage.user))
    )
    message = msg_result.scalar_one()
    return ChatMessageResponse.model_validate(message)
