"""Tests for meeting endpoints."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch

pytestmark = pytest.mark.asyncio


async def _create_user_and_login(client: AsyncClient, suffix: str = "") -> str:
    """Helper: register user and return access token."""
    email = f"meetuser{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123", "full_name": f"Meet User {suffix}"},
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123"},
    )
    return login.json()["access_token"]


async def test_create_meeting(client: AsyncClient):
    token = await _create_user_and_login(client, "create")
    resp = await client.post(
        "/api/v1/meetings",
        json={"title": "Test Meeting"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Test Meeting"
    assert data["status"] == "SCHEDULED"
    assert "room_name" in data
    assert "id" in data


async def test_list_meetings(client: AsyncClient):
    token = await _create_user_and_login(client, "list")
    await client.post(
        "/api/v1/meetings",
        json={"title": "Listed Meeting"},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp = await client.get("/api/v1/meetings", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "meetings" in data
    assert data["total"] >= 1


async def test_join_meeting(client: AsyncClient):
    token = await _create_user_and_login(client, "join")
    create_resp = await client.post(
        "/api/v1/meetings",
        json={"title": "Joinable Meeting"},
        headers={"Authorization": f"Bearer {token}"},
    )
    meeting_id = create_resp.json()["id"]

    with patch("app.services.livekit_service.generate_token", return_value="fake-livekit-token"):
        resp = await client.post(
            f"/api/v1/meetings/{meeting_id}/join",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["livekit_token"] == "fake-livekit-token"
    assert data["meeting"]["status"] == "ACTIVE"


async def test_end_meeting(client: AsyncClient):
    token = await _create_user_and_login(client, "end")
    create_resp = await client.post(
        "/api/v1/meetings",
        json={"title": "Ending Meeting"},
        headers={"Authorization": f"Bearer {token}"},
    )
    meeting_id = create_resp.json()["id"]

    with patch("app.services.livekit_service.generate_token", return_value="tok"):
        await client.post(
            f"/api/v1/meetings/{meeting_id}/join",
            headers={"Authorization": f"Bearer {token}"},
        )

    with patch("app.services.livekit_service.delete_room", new_callable=AsyncMock):
        resp = await client.post(
            f"/api/v1/meetings/{meeting_id}/end",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "ENDED"


async def test_join_ended_meeting(client: AsyncClient):
    token = await _create_user_and_login(client, "joinended")
    create_resp = await client.post(
        "/api/v1/meetings",
        json={"title": "Already Ended"},
        headers={"Authorization": f"Bearer {token}"},
    )
    meeting_id = create_resp.json()["id"]

    with patch("app.services.livekit_service.generate_token", return_value="tok"):
        await client.post(
            f"/api/v1/meetings/{meeting_id}/join",
            headers={"Authorization": f"Bearer {token}"},
        )
    with patch("app.services.livekit_service.delete_room", new_callable=AsyncMock):
        await client.post(
            f"/api/v1/meetings/{meeting_id}/end",
            headers={"Authorization": f"Bearer {token}"},
        )

    with patch("app.services.livekit_service.generate_token", return_value="tok"):
        resp = await client.post(
            f"/api/v1/meetings/{meeting_id}/join",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 410


async def test_unauthenticated_access(client: AsyncClient):
    resp = await client.get("/api/v1/meetings")
    assert resp.status_code == 403
