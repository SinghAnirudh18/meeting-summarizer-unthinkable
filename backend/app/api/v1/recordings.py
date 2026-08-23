"""
Recording router — Phase 1 stubs.

In Phase 1, these endpoints create/update the Recording record in the database
but do not trigger any actual audio processing. The file lands in LiveKit's
configured egress output location.

Phase 2 will implement:
- Picking up the file from object storage
- Enqueueing a Celery job
- Running the full audio processing pipeline
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.core.dependencies import get_current_user
from app.models.meeting import Meeting, MeetingStatus
from app.models.recording import Recording, RecordingStatus
from app.models.user import User
from app.schemas.recording import RecordingResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meetings/{meeting_id}/recording", tags=["Recording"])


async def _get_meeting_or_404(meeting_id: str, session: AsyncSession) -> Meeting:
    result = await session.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return meeting


@router.post("/start", response_model=RecordingResponse, status_code=status.HTTP_201_CREATED)
async def start_recording(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> RecordingResponse:
    """Start recording a live meeting (host only)."""
    meeting = await _get_meeting_or_404(meeting_id, session)

    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can start recording")

    # Auto-activate meeting if host starts recording
    if meeting.status == MeetingStatus.SCHEDULED:
        meeting.status = MeetingStatus.ACTIVE
        meeting.start_time = datetime.now(tz=timezone.utc)
        session.add(meeting)

    elif meeting.status == MeetingStatus.ENDED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Meeting has ended")

    # Check existing recording record
    result = await session.execute(select(Recording).where(Recording.meeting_id == meeting_id))
    existing = result.scalar_one_or_none()

    now = datetime.now(tz=timezone.utc)

    if existing:
        if existing.status == RecordingStatus.RECORDING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Recording already in progress")
        existing.status = RecordingStatus.RECORDING
        existing.started_at = now
        existing.ended_at = None
        recording = existing
        session.add(recording)
    else:
        recording = Recording(
            meeting_id=meeting_id,
            status=RecordingStatus.RECORDING,
            started_at=now,
        )
        session.add(recording)

    await session.commit()
    await session.refresh(recording)

    logger.info("Recording started for meeting %s", meeting_id)
    return RecordingResponse.model_validate(recording)


@router.post("/stop", response_model=RecordingResponse)
async def stop_recording(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> RecordingResponse:
    """Stop an active recording (host only)."""
    meeting = await _get_meeting_or_404(meeting_id, session)

    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can stop recording")

    result = await session.execute(select(Recording).where(Recording.meeting_id == meeting_id))
    recording = result.scalar_one_or_none()

    if not recording or recording.status != RecordingStatus.RECORDING:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active recording found")

    now = datetime.now(tz=timezone.utc)
    recording.status = RecordingStatus.COMPLETED
    recording.ended_at = now
    if recording.started_at:
        start_time = recording.started_at if recording.started_at.tzinfo else recording.started_at.replace(tzinfo=timezone.utc)
        recording.duration_seconds = int((now - start_time).total_seconds())

    session.add(recording)
    await session.commit()
    await session.refresh(recording)

    logger.info("Recording stopped for meeting %s", meeting_id)
    return RecordingResponse.model_validate(recording)


@router.get("", response_model=RecordingResponse | None)
async def get_recording(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> RecordingResponse | None:
    """Get the recording status for a meeting."""
    await _get_meeting_or_404(meeting_id, session)

    result = await session.execute(select(Recording).where(Recording.meeting_id == meeting_id))
    recording = result.scalar_one_or_none()
    if not recording:
        return None
    return RecordingResponse.model_validate(recording)


import os
import shutil
from pathlib import Path
from fastapi import File, UploadFile
from fastapi.responses import FileResponse

RECORDINGS_DIR = Path(__file__).parent.parent.parent.parent / "storage" / "recordings"
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload", response_model=RecordingResponse)
async def upload_recording(
    meeting_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> RecordingResponse:
    """Upload recorded WebM file from client after recording completes."""
    meeting = await _get_meeting_or_404(meeting_id, session)

    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only host can upload recording")

    filename = f"{meeting_id}.webm"
    file_path = RECORDINGS_DIR / filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    result = await session.execute(select(Recording).where(Recording.meeting_id == meeting_id))
    recording = result.scalar_one_or_none()

    now = datetime.now(tz=timezone.utc)
    if not recording:
        recording = Recording(
            meeting_id=meeting_id,
            status=RecordingStatus.COMPLETED,
            started_at=now,
            ended_at=now,
            storage_path=f"/api/v1/meetings/{meeting_id}/recording/download",
        )
    else:
        recording.status = RecordingStatus.COMPLETED
        recording.ended_at = now
        recording.storage_path = f"/api/v1/meetings/{meeting_id}/recording/download"

    session.add(recording)
    await session.commit()
    await session.refresh(recording)
    return RecordingResponse.model_validate(recording)


@router.get("/download")
async def download_recording_file(
    meeting_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Download or stream recorded WebM video/audio file."""
    filename = f"{meeting_id}.webm"
    file_path = RECORDINGS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Recording file not found")

    # Detect content type: small files are likely audio-only
    file_size = file_path.stat().st_size
    # WebM audio-only files are typically much smaller than video; use audio MIME for < 5MB
    media_type = "audio/webm" if file_size < 5 * 1024 * 1024 else "video/webm"

    return FileResponse(
        file_path,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )

