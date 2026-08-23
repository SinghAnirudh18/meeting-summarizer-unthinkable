from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.recording import RecordingStatus


class RecordingResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    meeting_id: str
    status: RecordingStatus
    egress_id: str | None
    storage_path: str | None
    duration_seconds: int | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
