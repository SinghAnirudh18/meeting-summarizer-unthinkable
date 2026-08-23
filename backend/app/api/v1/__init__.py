"""API v1 router — aggregates all sub-routers."""
from fastapi import APIRouter

from app.api.v1 import auth, meetings, recordings, chat, audio

router = APIRouter(prefix="/api/v1")

router.include_router(auth.router)
router.include_router(meetings.router)
router.include_router(recordings.router)
router.include_router(chat.router)
router.include_router(audio.router)
