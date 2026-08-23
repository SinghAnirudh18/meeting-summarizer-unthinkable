"""
LiveKit service — wraps the LiveKit server SDK.

All LiveKit interactions are isolated here so the rest of the
application never imports the SDK directly. Swap this module to
switch video providers without touching routes or business logic.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from livekit.api import AccessToken, VideoGrants, LiveKitAPI, DeleteRoomRequest, ListParticipantsRequest

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _get_livekit_api() -> LiveKitAPI:
    """Return an authenticated LiveKit API client."""
    return LiveKitAPI(
        url=settings.livekit_url,
        api_key=settings.livekit_api_key,
        api_secret=settings.livekit_api_secret,
    )


def generate_token(
    room_name: str,
    user_id: str,
    user_name: str,
    is_host: bool = False,
    ttl_seconds: int = 7200,  # 2 hours
) -> str:
    """
    Generate a signed LiveKit access token for a participant.

    Args:
        room_name: The LiveKit room name (== meeting.room_name).
        user_id: Used as the participant identity (unique within a room).
        user_name: Human-readable display name shown in the UI.
        is_host: If True, grants room admin privileges.
        ttl_seconds: Token validity in seconds.

    Returns:
        Signed JWT string.
    """
    grants = VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
        room_admin=is_host,
        room_record=is_host,  # Only hosts can trigger recording
    )

    token = (
        AccessToken(
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
        )
        .with_identity(user_id)
        .with_name(user_name)
        .with_grants(grants)
        .with_ttl(timedelta(seconds=ttl_seconds))
    )

    return token.to_jwt()


async def delete_room(room_name: str) -> None:
    """Delete a LiveKit room (ends the meeting for all participants)."""
    try:
        api = _get_livekit_api()
        async with api:
            await api.room.delete_room(DeleteRoomRequest(room=room_name))
        logger.info("LiveKit room deleted: %s", room_name)
    except Exception as exc:
        # Non-fatal — room may have already been cleaned up by LiveKit
        logger.warning("Failed to delete LiveKit room %s: %s", room_name, exc)


async def list_participants(room_name: str) -> list[dict]:
    """Return current participants in a LiveKit room."""
    try:
        api = _get_livekit_api()
        async with api:
            response = await api.room.list_participants(
                ListParticipantsRequest(room=room_name)
            )
        return [
            {
                "identity": p.identity,
                "name": p.name,
                "joined_at": p.joined_at,
                "is_speaking": p.is_speaking,
            }
            for p in response.participants
        ]
    except Exception as exc:
        logger.warning("Failed to list participants for room %s: %s", room_name, exc)
        return []
