from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RecordingStatus(str, enum.Enum):
    PENDING = "PENDING"
    RECORDING = "RECORDING"
    PROCESSING = "PROCESSING"   # Phase 2 state
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Recording(Base):
    """
    Stores metadata for a meeting recording.

    Phase 1: Created when recording starts/stops via LiveKit Egress.
             The file is stored but NOT processed (Phase 2 concern).
    Phase 2: status will transition through PROCESSING → COMPLETED
             after the audio pipeline runs.
    """

    __tablename__ = "recordings"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    meeting_id: Mapped[str] = mapped_column(
        ForeignKey("meetings.id"), nullable=False, unique=True, index=True
    )
    status: Mapped[RecordingStatus] = mapped_column(
        Enum(RecordingStatus), default=RecordingStatus.PENDING, nullable=False
    )
    # LiveKit Egress job ID (returned when egress starts)
    egress_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Where the recording file ends up (object storage path)
    storage_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(tz=timezone.utc),
        nullable=False,
    )

    # Relationships
    meeting: Mapped["Meeting"] = relationship("Meeting", back_populates="recording")  # noqa: F821
