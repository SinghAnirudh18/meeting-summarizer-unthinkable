"""
Audio Router — Phase 2 Uploaded Audio Intelligence endpoints.
"""
from __future__ import annotations

import asyncio
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_session
from app.core.dependencies import get_current_user
from app.models.audio import (
    ActionItem,
    AudioJob,
    AudioJobStatus,
    Decision,
    MeetingSummary,
    TranscriptSegment,
)
from app.models.user import User
from app.schemas.audio import (
    ActionItemResponse,
    ActionItemUpdate,
    AskQuestionRequest,
    AskQuestionResponse,
    AudioJobResponse,
    MeetingIntelligenceResponse,
)
from app.services.groq_service import groq_service
from app.services.local_llm_service import local_llm_service
from app.services.whisper_service import whisper_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audio", tags=["Audio Intelligence"])

AUDIO_STORAGE_DIR = Path(__file__).parent.parent.parent.parent / "storage" / "audio"
AUDIO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".webm", ".ogg", ".aac", ".flac"}
MEDIA_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
}


@router.post("/upload", response_model=AudioJobResponse, status_code=status.HTTP_201_CREATED)
async def upload_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> AudioJobResponse:
    """
    Upload an audio file (MP3, WAV, M4A, WebM, OGG).
    Creates an AudioJob and processes it via Groq Whisper & Groq LLMs.
    """
    file_ext = Path(file.filename or "audio.webm").suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{file_ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # 1. Create AudioJob record
    job = AudioJob(
        user_id=current_user.id,
        file_name=file.filename or "uploaded_audio.webm",
        storage_path="",
        status=AudioJobStatus.UPLOADING,
        progress=10,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    # 2. Save audio file to storage
    file_path = AUDIO_STORAGE_DIR / f"{job.id}{file_ext}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    job.storage_path = str(file_path)
    job.status = AudioJobStatus.TRANSCRIBING
    job.progress = 30
    session.add(job)
    await session.commit()

    try:
        # 3. Transcribe audio via Python GPU Whisper in threadpool
        segments_data = await asyncio.to_thread(whisper_service.transcribe, str(file_path))

        # 4. Generate LLM Intelligence, Summary & Speaker Diarization from raw transcript
        try:
            summary_data, decisions_data, actions_data, formatted_segments = await asyncio.to_thread(
                groq_service.extract_intelligence, segments_data, job.file_name
            )
        except Exception as llm_err:
            logger.warning("Groq intelligence extraction error: %s. Using local LLM fallback...", llm_err)
            summary_data, decisions_data, actions_data, formatted_segments = await asyncio.to_thread(
                local_llm_service.extract_intelligence, segments_data, job.file_name
            )

        # Store AI-diarized transcript segments
        final_segments = formatted_segments if formatted_segments else segments_data
        for idx, seg_info in enumerate(final_segments):
            segment = TranscriptSegment(
                job_id=job.id,
                start_time=seg_info.get("start_time", 0.0),
                end_time=seg_info.get("end_time", 0.0),
                speaker=seg_info.get("speaker", f"Speaker {(idx % 2) + 1}"),
                text=seg_info.get("text", ""),
                sequence_order=seg_info.get("sequence_order", idx),
            )
            session.add(segment)

        summary = MeetingSummary(
            job_id=job.id,
            executive_summary=summary_data["executive_summary"],
            key_topics=summary_data.get("key_topics", []),
            key_takeaways=summary_data.get("key_takeaways", []),
        )
        session.add(summary)

        for dec in decisions_data:
            decision = Decision(
                job_id=job.id,
                decision_text=dec["decision_text"],
                speaker=dec.get("speaker", "Participant"),
                timestamp_seconds=dec.get("timestamp_seconds", 0.0),
                context_snippet=dec.get("context_snippet"),
            )
            session.add(decision)

        for act in actions_data:
            action = ActionItem(
                job_id=job.id,
                task=act["task"],
                owner=act.get("owner", "Unassigned"),
                deadline=act.get("deadline"),
                timestamp_seconds=act.get("timestamp_seconds", 0.0),
                status=act.get("status", "Pending"),
            )
            session.add(action)

        # Complete Job
        job.status = AudioJobStatus.COMPLETED
        job.progress = 100
        job.updated_at = datetime.now(tz=timezone.utc)
        session.add(job)
        await session.commit()
        await session.refresh(job)

        logger.info("AudioJob %s completed with %d extracted segments", job.id, len(segments_data))
        return AudioJobResponse.model_validate(job)

    except Exception as exc:
        logger.error("Audio processing failed for job %s: %s", job.id, exc, exc_info=True)
        try:
            await session.rollback()
            job.status = AudioJobStatus.FAILED
            job.error_message = str(exc)
            session.add(job)
            await session.commit()
        except Exception as rollback_err:
            logger.error("Failed to persist error state for job %s: %s", job.id, rollback_err)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio processing failed: {exc}",
        )


@router.get("/jobs", response_model=list[AudioJobResponse])
async def list_audio_jobs(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[AudioJobResponse]:
    """List all audio jobs for the current user."""
    result = await session.execute(
        select(AudioJob)
        .where(AudioJob.user_id == current_user.id)
        .order_by(AudioJob.created_at.desc())
    )
    jobs = result.scalars().all()
    return [AudioJobResponse.model_validate(j) for j in jobs]


@router.get("/jobs/{job_id}", response_model=MeetingIntelligenceResponse)
async def get_job_intelligence(
    job_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> MeetingIntelligenceResponse:
    """Fetch complete meeting intelligence for a given audio job."""
    result = await session.execute(
        select(AudioJob)
        .where(AudioJob.id == job_id, AudioJob.user_id == current_user.id)
        .options(
            selectinload(AudioJob.transcript_segments),
            selectinload(AudioJob.summary),
            selectinload(AudioJob.decisions),
            selectinload(AudioJob.action_items),
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio job not found")

    return MeetingIntelligenceResponse(
        job=AudioJobResponse.model_validate(job),
        summary=job.summary,
        transcript_segments=job.transcript_segments,
        decisions=job.decisions,
        action_items=job.action_items,
    )


@router.patch("/actions/{action_id}", response_model=ActionItemResponse)
async def toggle_action_item(
    action_id: str,
    payload: ActionItemUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> ActionItemResponse:
    """Toggle action item status (Pending / Completed)."""
    result = await session.execute(
        select(ActionItem).where(ActionItem.id == action_id)
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action item not found")

    action.status = payload.status
    session.add(action)
    await session.commit()
    await session.refresh(action)
    return ActionItemResponse.model_validate(action)


@router.get("/jobs/{job_id}/stream")
async def stream_audio_file(
    job_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Stream audio file for playback in browser."""
    result = await session.execute(
        select(AudioJob).where(AudioJob.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio job not found")

    file_path = Path(job.storage_path) if job.storage_path else None
    if not file_path or not file_path.exists():
        matching = list(AUDIO_STORAGE_DIR.glob(f"{job_id}.*"))
        if matching:
            file_path = matching[0]
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found on disk")

    ext = file_path.suffix.lower()
    media_type = MEDIA_TYPES.get(ext, "application/octet-stream")
    return FileResponse(
        file_path,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{job.file_name}"'},
    )


@router.get("/jobs/{job_id}/download")
async def download_audio_file(
    job_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Download audio file for an audio job."""
    result = await session.execute(
        select(AudioJob).where(AudioJob.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio job not found")

    file_path = Path(job.storage_path) if job.storage_path else None
    if not file_path or not file_path.exists():
        matching = list(AUDIO_STORAGE_DIR.glob(f"{job_id}.*"))
        if matching:
            file_path = matching[0]
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found on disk")

    ext = file_path.suffix.lower()
    media_type = MEDIA_TYPES.get(ext, "application/octet-stream")
    return FileResponse(
        file_path,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{job.file_name}"'},
    )


@router.post("/jobs/{job_id}/ask", response_model=AskQuestionResponse)
async def ask_job_question(
    job_id: str,
    payload: AskQuestionRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> AskQuestionResponse:
    """Ask a question about an audio job transcript and get an LLM answer."""
    result = await session.execute(
        select(AudioJob)
        .where(AudioJob.id == job_id, AudioJob.user_id == current_user.id)
        .options(
            selectinload(AudioJob.transcript_segments),
            selectinload(AudioJob.summary),
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio job not found")

    segments_data = [
        {
            "start_time": s.start_time,
            "end_time": s.end_time,
            "speaker": s.speaker,
            "text": s.text,
            "sequence_order": s.sequence_order,
        }
        for s in job.transcript_segments
    ]
    summary_text = job.summary.executive_summary if job.summary else "No summary"

    res = await asyncio.to_thread(
        local_llm_service.ask_meeting_question,
        segments_data,
        summary_text,
        payload.question,
        job.file_name,
    )
    return AskQuestionResponse(
        answer=res["answer"],
        citations=res.get("citations", []),
    )


@router.post("/jobs/{job_id}/resummarize", response_model=MeetingIntelligenceResponse)
async def resummarize_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> MeetingIntelligenceResponse:
    """Re-run AI summarization and intelligence extraction on existing transcript segments."""
    result = await session.execute(
        select(AudioJob)
        .where(AudioJob.id == job_id, AudioJob.user_id == current_user.id)
        .options(
            selectinload(AudioJob.transcript_segments),
            selectinload(AudioJob.summary),
            selectinload(AudioJob.decisions),
            selectinload(AudioJob.action_items),
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio job not found")

    if not job.transcript_segments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No transcript segments found to summarize.")

    segments_data = [
        {
            "start_time": s.start_time,
            "end_time": s.end_time,
            "speaker": s.speaker,
            "text": s.text,
            "sequence_order": s.sequence_order,
        }
        for s in job.transcript_segments
    ]

    try:
        summary_data, decisions_data, actions_data, formatted_segments = await asyncio.to_thread(
            groq_service.extract_intelligence, segments_data, job.file_name
        )
    except Exception as llm_err:
        logger.warning("Groq re-summarization error: %s. Using local LLM fallback...", llm_err)
        summary_data, decisions_data, actions_data, formatted_segments = await asyncio.to_thread(
            local_llm_service.extract_intelligence, segments_data, job.file_name
        )

    # Rebuild transcript segments with newly identified speakers and cleaned dialogue turns
    if formatted_segments:
        job.transcript_segments.clear()
        await session.flush()
        for idx, fseg in enumerate(formatted_segments):
            seg = TranscriptSegment(
                job_id=job.id,
                start_time=float(fseg.get("start_time", 0.0)),
                end_time=float(fseg.get("end_time", 0.0)),
                speaker=str(fseg.get("speaker") or f"Speaker {(idx % 2) + 1}"),
                text=str(fseg.get("text", "")).strip(),
                sequence_order=idx,
            )
            job.transcript_segments.append(seg)

    # Update or create summary
    if job.summary:
        job.summary.executive_summary = summary_data["executive_summary"]
        job.summary.key_topics = summary_data.get("key_topics", [])
        job.summary.key_takeaways = summary_data.get("key_takeaways", [])
        session.add(job.summary)
    else:
        new_summary = MeetingSummary(
            job_id=job.id,
            executive_summary=summary_data["executive_summary"],
            key_topics=summary_data.get("key_topics", []),
            key_takeaways=summary_data.get("key_takeaways", []),
        )
        session.add(new_summary)

    # Clear old decisions and actions, add new ones
    job.decisions.clear()
    job.action_items.clear()
    await session.flush()

    for dec in decisions_data:
        decision = Decision(
            job_id=job.id,
            decision_text=dec["decision_text"],
            speaker=dec.get("speaker", "Participant"),
            timestamp_seconds=dec.get("timestamp_seconds", 0.0),
            context_snippet=dec.get("context_snippet"),
        )
        job.decisions.append(decision)

    for act in actions_data:
        action = ActionItem(
            job_id=job.id,
            task=act["task"],
            owner=act.get("owner", "Unassigned"),
            deadline=act.get("deadline"),
            timestamp_seconds=act.get("timestamp_seconds", 0.0),
            status=act.get("status", "Pending"),
        )
        job.action_items.append(action)

    job.updated_at = datetime.now(tz=timezone.utc)
    await session.commit()

    # Re-fetch with updated relationships
    reloaded = await session.execute(
        select(AudioJob)
        .where(AudioJob.id == job_id)
        .options(
            selectinload(AudioJob.transcript_segments),
            selectinload(AudioJob.summary),
            selectinload(AudioJob.decisions),
            selectinload(AudioJob.action_items),
        )
    )
    job = reloaded.scalar_one()

    return MeetingIntelligenceResponse(
        job=AudioJobResponse.model_validate(job),
        summary=job.summary,
        transcript_segments=job.transcript_segments,
        decisions=job.decisions,
        action_items=job.action_items,
    )

