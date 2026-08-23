"""
Pydantic schemas for Phase 2 audio jobs and meeting intelligence.
"""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from app.models.audio import AudioJobStatus


class TranscriptSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    start_time: float
    end_time: float
    speaker: str
    text: str
    sequence_order: int


class MeetingSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    executive_summary: str
    key_topics: list[str] = Field(default_factory=list)
    key_takeaways: list[str] = Field(default_factory=list)


class DecisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    decision_text: str
    speaker: str
    timestamp_seconds: float
    context_snippet: str | None = None


class ActionItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task: str
    owner: str
    deadline: str | None = None
    timestamp_seconds: float
    status: str


class ActionItemUpdate(BaseModel):
    status: str  # Pending / Completed


class AudioJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    meeting_id: str | None = None
    file_name: str
    storage_path: str
    status: AudioJobStatus
    progress: int
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class MeetingIntelligenceResponse(BaseModel):
    job: AudioJobResponse
    summary: MeetingSummaryResponse | None = None
    transcript_segments: list[TranscriptSegmentResponse] = Field(default_factory=list)
    decisions: list[DecisionResponse] = Field(default_factory=list)
    action_items: list[ActionItemResponse] = Field(default_factory=list)


class Citation(BaseModel):
    speaker: str = "Participant"
    timestamp_seconds: float = 0.0
    snippet: str = ""


class AskQuestionRequest(BaseModel):
    question: str


class AskQuestionResponse(BaseModel):
    answer: str
    citations: list[Citation] = Field(default_factory=list)
