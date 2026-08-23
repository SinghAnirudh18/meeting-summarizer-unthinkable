"""Meetings router — create, list, get, join, end."""
from __future__ import annotations

import logging
import secrets
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_session
from app.core.dependencies import get_current_user
from app.core.config import get_settings
from app.models.meeting import Meeting, MeetingParticipant, MeetingStatus, ParticipantRole
from app.models.user import User
from app.schemas.meeting import (
    MeetingCreate,
    MeetingJoinResponse,
    MeetingListResponse,
    MeetingResponse,
)
from app.services import livekit_service

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/meetings", tags=["Meetings"])

_ROOM_NAME_CHARS = string.ascii_lowercase + string.digits


def _generate_room_name(length: int = 12) -> str:
    """Generate a URL-safe random room name."""
    return "".join(secrets.choice(_ROOM_NAME_CHARS) for _ in range(length))


def _serialize_meeting(meeting: Meeting) -> MeetingResponse:
    """Convert a Meeting ORM object to its response schema."""
    return MeetingResponse(
        id=meeting.id,
        title=meeting.title,
        room_name=meeting.room_name,
        status=meeting.status,
        host=meeting.host,
        start_time=meeting.start_time,
        end_time=meeting.end_time,
        created_at=meeting.created_at,
        participant_count=len([p for p in meeting.participants if p.left_at is None]),
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_meeting_or_404(
    meeting_id: str,
    session: AsyncSession,
    load_relations: bool = True,
) -> Meeting:
    query = select(Meeting).where(Meeting.id == meeting_id)
    if load_relations:
        query = query.options(
            selectinload(Meeting.host),
            selectinload(Meeting.participants).selectinload(MeetingParticipant.user),
        )
    result = await session.execute(query)
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return meeting


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    payload: MeetingCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> MeetingResponse:
    """Create a new meeting. The creating user becomes the host."""
    meeting = Meeting(
        title=payload.title,
        room_name=_generate_room_name(),
        host_id=current_user.id,
        status=MeetingStatus.SCHEDULED,
    )
    session.add(meeting)
    await session.flush()  # get meeting.id before adding participant

    # Add host as a participant
    host_participant = MeetingParticipant(
        meeting_id=meeting.id,
        user_id=current_user.id,
        role=ParticipantRole.HOST,
    )
    session.add(host_participant)
    await session.commit()

    # Reload with relationships for serialization
    meeting = await _get_meeting_or_404(meeting.id, session)
    logger.info("Meeting created: %s by %s", meeting.id, current_user.email)
    return _serialize_meeting(meeting)


@router.get("", response_model=MeetingListResponse)
async def list_meetings(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
    skip: int = 0,
    limit: int = 20,
) -> MeetingListResponse:
    """List meetings where the current user is host or participant."""
    # Subquery: meeting IDs the user participated in
    participant_meetings = select(MeetingParticipant.meeting_id).where(
        MeetingParticipant.user_id == current_user.id
    )

    query = (
        select(Meeting)
        .where(Meeting.id.in_(participant_meetings))
        .options(
            selectinload(Meeting.host),
            selectinload(Meeting.participants).selectinload(MeetingParticipant.user),
        )
        .order_by(Meeting.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    count_query = (
        select(func.count(Meeting.id))
        .where(Meeting.id.in_(participant_meetings))
    )

    result = await session.execute(query)
    meetings = result.scalars().all()

    count_result = await session.execute(count_query)
    total = count_result.scalar_one()

    return MeetingListResponse(
        meetings=[_serialize_meeting(m) for m in meetings],
        total=total,
    )


@router.get("/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> MeetingResponse:
    """Get details for a specific meeting."""
    meeting = await _get_meeting_or_404(meeting_id, session)
    return _serialize_meeting(meeting)


@router.post("/{meeting_id}/join", response_model=MeetingJoinResponse)
async def join_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> MeetingJoinResponse:
    """
    Join a meeting.

    - Generates a LiveKit token for the user.
    - Creates/updates a MeetingParticipant record.
    - Transitions meeting status to ACTIVE on first join.
    """
    meeting = await _get_meeting_or_404(meeting_id, session)

    if meeting.status == MeetingStatus.ENDED:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This meeting has ended",
        )

    # Determine if user is host
    is_host = meeting.host_id == current_user.id

    # Upsert participant record
    participant_result = await session.execute(
        select(MeetingParticipant).where(
            MeetingParticipant.meeting_id == meeting_id,
            MeetingParticipant.user_id == current_user.id,
        )
    )
    participant = participant_result.scalar_one_or_none()

    now = datetime.now(tz=timezone.utc)

    if participant:
        participant.joined_at = now
        participant.left_at = None  # Rejoin
    else:
        participant = MeetingParticipant(
            meeting_id=meeting_id,
            user_id=current_user.id,
            role=ParticipantRole.HOST if is_host else ParticipantRole.PARTICIPANT,
            joined_at=now,
        )
        session.add(participant)

    # Transition to ACTIVE if first join
    if meeting.status == MeetingStatus.SCHEDULED:
        meeting.status = MeetingStatus.ACTIVE
        meeting.start_time = now
        session.add(meeting)

    await session.commit()

    # Generate LiveKit token
    livekit_token = livekit_service.generate_token(
        room_name=meeting.room_name,
        user_id=current_user.id,
        user_name=current_user.full_name,
        is_host=is_host,
    )

    # Reload with relationships
    meeting = await _get_meeting_or_404(meeting_id, session)
    logger.info("User %s joined meeting %s", current_user.email, meeting_id)

    return MeetingJoinResponse(
        meeting=_serialize_meeting(meeting),
        livekit_token=livekit_token,
        livekit_url=settings.livekit_url,
    )


@router.post("/{meeting_id}/leave", status_code=status.HTTP_200_OK)
async def leave_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """Mark the user as having left the meeting."""
    participant_result = await session.execute(
        select(MeetingParticipant).where(
            MeetingParticipant.meeting_id == meeting_id,
            MeetingParticipant.user_id == current_user.id,
        )
    )
    participant = participant_result.scalar_one_or_none()
    if participant:
        participant.left_at = datetime.now(tz=timezone.utc)
        session.add(participant)
        await session.commit()
    return {"ok": True}


@router.post("/{meeting_id}/end", response_model=MeetingResponse)
async def end_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> MeetingResponse:
    """
    End a meeting (host only).

    - Updates meeting status to ENDED.
    - Deletes the LiveKit room, disconnecting all participants.
    """
    meeting = await _get_meeting_or_404(meeting_id, session)

    if meeting.host_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the host can end the meeting",
        )

    if meeting.status == MeetingStatus.ENDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Meeting has already ended",
        )

    now = datetime.now(tz=timezone.utc)
    meeting.status = MeetingStatus.ENDED
    meeting.end_time = now
    session.add(meeting)

    # Mark all active participants as left
    participants_result = await session.execute(
        select(MeetingParticipant).where(
            MeetingParticipant.meeting_id == meeting_id,
            MeetingParticipant.left_at.is_(None),
        )
    )
    for p in participants_result.scalars().all():
        p.left_at = now
        session.add(p)

    await session.commit()

    # Delete LiveKit room (non-blocking; failure is logged, not raised)
    await livekit_service.delete_room(meeting.room_name)

    meeting = await _get_meeting_or_404(meeting_id, session)
    logger.info("Meeting ended: %s by %s", meeting_id, current_user.email)
    return _serialize_meeting(meeting)
