from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field
from app.schemas.user import UserResponse


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4096)


class ChatMessageResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    meeting_id: str
    user: UserResponse
    content: str
    created_at: datetime
