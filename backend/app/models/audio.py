"""
Audio processing & Meeting Intelligence models for Phase 2.
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _uuid_str() -> str:
    return str(uuid4())


class AudioJobStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    UPLOADING = "UPLOADING"
    TRANSCRIBING = "TRANSCRIBING"
    EXTRACTING = "EXTRACTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class AudioJob(Base):
    __tablename__ = "audio_jobs"

    id: Mapped[str] = mapped_column(sa.String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str] = mapped_column(sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True)
    meeting_id: Mapped[str | None] = mapped_column(sa.String(36), sa.ForeignKey("meetings.id"), nullable=True, index=True)

    file_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(sa.String(512), nullable=False)
    status: Mapped[AudioJobStatus] = mapped_column(
        sa.Enum(AudioJobStatus), default=AudioJobStatus.QUEUED, nullable=False, index=True
    )
    progress: Mapped[int] = mapped_column(sa.Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(tz=timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(tz=timezone.utc),
        onupdate=lambda: datetime.now(tz=timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User")
    transcript_segments: Mapped[list["TranscriptSegment"]] = relationship(
        "TranscriptSegment", back_populates="job", cascade="all, delete-orphan", order_by="TranscriptSegment.sequence_order"
    )
    summary: Mapped["MeetingSummary | None"] = relationship(
        "MeetingSummary", back_populates="job", uselist=False, cascade="all, delete-orphan"
    )
    decisions: Mapped[list["Decision"]] = relationship(
        "Decision", back_populates="job", cascade="all, delete-orphan"
    )
    action_items: Mapped[list["ActionItem"]] = relationship(
        "ActionItem", back_populates="job", cascade="all, delete-orphan"
    )


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id: Mapped[str] = mapped_column(sa.String(36), primary_key=True, default=_uuid_str)
    job_id: Mapped[str] = mapped_column(sa.String(36), sa.ForeignKey("audio_jobs.id"), nullable=False, index=True)

    start_time: Mapped[float] = mapped_column(sa.Float, nullable=False)
    end_time: Mapped[float] = mapped_column(sa.Float, nullable=False)
    speaker: Mapped[str] = mapped_column(sa.String(100), default="Speaker 1", nullable=False)
    text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    sequence_order: Mapped[int] = mapped_column(sa.Integer, nullable=False)

    job: Mapped["AudioJob"] = relationship("AudioJob", back_populates="transcript_segments")


class MeetingSummary(Base):
    __tablename__ = "meeting_summaries"

    id: Mapped[str] = mapped_column(sa.String(36), primary_key=True, default=_uuid_str)
    job_id: Mapped[str] = mapped_column(sa.String(36), sa.ForeignKey("audio_jobs.id"), nullable=False, unique=True, index=True)

    executive_summary: Mapped[str] = mapped_column(sa.Text, nullable=False)
    key_topics: Mapped[list] = mapped_column(sa.JSON, default=list, nullable=False)
    key_takeaways: Mapped[list] = mapped_column(sa.JSON, default=list, nullable=False)

    job: Mapped["AudioJob"] = relationship("AudioJob", back_populates="summary")


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(sa.String(36), primary_key=True, default=_uuid_str)
    job_id: Mapped[str] = mapped_column(sa.String(36), sa.ForeignKey("audio_jobs.id"), nullable=False, index=True)

    decision_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    speaker: Mapped[str] = mapped_column(sa.String(100), default="Participant", nullable=False)
    timestamp_seconds: Mapped[float] = mapped_column(sa.Float, default=0.0, nullable=False)
    context_snippet: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    job: Mapped["AudioJob"] = relationship("AudioJob", back_populates="decisions")


class ActionItem(Base):
    __tablename__ = "action_items"

    id: Mapped[str] = mapped_column(sa.String(36), primary_key=True, default=_uuid_str)
    job_id: Mapped[str] = mapped_column(sa.String(36), sa.ForeignKey("audio_jobs.id"), nullable=False, index=True)

    task: Mapped[str] = mapped_column(sa.Text, nullable=False)
    owner: Mapped[str] = mapped_column(sa.String(100), default="Unassigned", nullable=False)
    deadline: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    timestamp_seconds: Mapped[float] = mapped_column(sa.Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(sa.String(50), default="Pending", nullable=False)

    job: Mapped["AudioJob"] = relationship("AudioJob", back_populates="action_items")
