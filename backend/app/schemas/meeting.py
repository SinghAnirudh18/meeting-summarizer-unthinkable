from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.meeting import MeetingStatus, ParticipantRole
from app.schemas.user import UserResponse


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class ParticipantResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    user: UserResponse
    role: ParticipantRole
    joined_at: datetime | None
    left_at: datetime | None


class MeetingResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    title: str
    room_name: str
    status: MeetingStatus
    host: UserResponse
    start_time: datetime | None
    end_time: datetime | None
    created_at: datetime
    participant_count: int = 0


class MeetingListResponse(BaseModel):
    meetings: list[MeetingResponse]
    total: int


class MeetingJoinResponse(BaseModel):
    """Response when a user successfully joins a meeting."""

    meeting: MeetingResponse
    livekit_token: str
    livekit_url: str
