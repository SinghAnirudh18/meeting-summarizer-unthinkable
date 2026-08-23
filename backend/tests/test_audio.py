"""
Unit tests for Phase 2.1 Audio Intelligence upload and job processing API.
"""
from __future__ import annotations

import io
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _get_auth_headers(client: AsyncClient, suffix: str = "audio") -> dict:
    email = f"audiouser_{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123", "full_name": "Audio Tester"},
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123"},
    )
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def test_upload_audio_success(client: AsyncClient):
    """Test uploading an audio file and creating an AudioJob."""
    headers = await _get_auth_headers(client, "upload")
    fake_audio = io.BytesIO(b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00")
    files = {"file": ("test_meeting_audio.wav", fake_audio, "audio/wav")}

    response = await client.post(
        "/api/v1/audio/upload",
        headers=headers,
        files=files,
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["file_name"] == "test_meeting_audio.wav"
    assert data["status"] == "COMPLETED"
    assert data["progress"] == 100
    assert "id" in data


async def test_upload_audio_unsupported_type(client: AsyncClient):
    """Test uploading an unsupported file type."""
    headers = await _get_auth_headers(client, "unsupported")
    fake_file = io.BytesIO(b"test file content")
    files = {"file": ("document.txt", fake_file, "text/plain")}

    response = await client.post(
        "/api/v1/audio/upload",
        headers=headers,
        files=files,
    )
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


async def test_get_job_intelligence(client: AsyncClient):
    """Test retrieving meeting intelligence for an uploaded audio job."""
    headers = await _get_auth_headers(client, "intel")
    fake_audio = io.BytesIO(b"audio content")
    files = {"file": ("sync_audio.mp3", fake_audio, "audio/mp3")}
    upload_res = await client.post(
        "/api/v1/audio/upload",
        headers=headers,
        files=files,
    )
    assert upload_res.status_code == 201
    job_id = upload_res.json()["id"]

    # Get intelligence
    res = await client.get(f"/api/v1/audio/jobs/{job_id}", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["job"]["id"] == job_id
    assert data["summary"] is not None
    assert "executive_summary" in data["summary"]
    assert len(data["transcript_segments"]) > 0
    assert len(data["decisions"]) >= 0
    assert len(data["action_items"]) >= 0


async def test_toggle_action_item(client: AsyncClient):
    """Test toggling action item status."""
    headers = await _get_auth_headers(client, "action")
    fake_audio = io.BytesIO(b"audio content")
    upload_res = await client.post(
        "/api/v1/audio/upload",
        headers=headers,
        files={"file": ("sync.mp3", fake_audio, "audio/mp3")},
    )
    job_id = upload_res.json()["id"]

    intel_res = await client.get(f"/api/v1/audio/jobs/{job_id}", headers=headers)
    actions = intel_res.json()["action_items"]
    assert len(actions) > 0

    action_id = actions[0]["id"]
    patch_res = await client.patch(
        f"/api/v1/audio/actions/{action_id}",
        headers=headers,
        json={"status": "Completed"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "Completed"


async def test_stream_and_download_audio(client: AsyncClient):
    """Test streaming and downloading audio files for an AudioJob."""
    headers = await _get_auth_headers(client, "stream")
    fake_audio = io.BytesIO(b"ID3\x03\x00\x00\x00\x00\x00\x00fake audio mp3 data bytes")
    upload_res = await client.post(
        "/api/v1/audio/upload",
        headers=headers,
        files={"file": ("stream_test.mp3", fake_audio, "audio/mp3")},
    )
    assert upload_res.status_code == 201
    job_id = upload_res.json()["id"]

    # Stream audio
    stream_res = await client.get(f"/api/v1/audio/jobs/{job_id}/stream")
    assert stream_res.status_code == 200
    assert stream_res.headers.get("content-type") == "audio/mpeg"
    assert "stream_test.mp3" in stream_res.headers.get("content-disposition", "")
    assert len(stream_res.content) > 0

    # Download audio
    download_res = await client.get(f"/api/v1/audio/jobs/{job_id}/download")
    assert download_res.status_code == 200
    assert download_res.headers.get("content-type") == "audio/mpeg"
    assert "attachment" in download_res.headers.get("content-disposition", "")


async def test_ask_job_question(client: AsyncClient):
    """Test asking an LLM question about an audio job transcript."""
    headers = await _get_auth_headers(client, "ask")
    fake_audio = io.BytesIO(b"audio content for question")
    upload_res = await client.post(
        "/api/v1/audio/upload",
        headers=headers,
        files={"file": ("architecture_sync.mp3", fake_audio, "audio/mp3")},
    )
    assert upload_res.status_code == 201
    job_id = upload_res.json()["id"]

    ask_res = await client.post(
        f"/api/v1/audio/jobs/{job_id}/ask",
        headers=headers,
        json={"question": "What are the main action items?"},
    )
    assert ask_res.status_code == 200
    data = ask_res.json()
    assert "answer" in data
    assert len(data["answer"]) > 0
    assert isinstance(data["citations"], list)


async def test_resummarize_job(client: AsyncClient):
    """Test re-summarizing an existing audio job transcript."""
    headers = await _get_auth_headers(client, "resummarize")
    fake_audio = io.BytesIO(b"audio content for re-summarization")
    upload_res = await client.post(
        "/api/v1/audio/upload",
        headers=headers,
        files={"file": ("project_recap.mp3", fake_audio, "audio/mp3")},
    )
    assert upload_res.status_code == 201
    job_id = upload_res.json()["id"]

    resummarize_res = await client.post(
        f"/api/v1/audio/jobs/{job_id}/resummarize",
        headers=headers,
    )
    assert resummarize_res.status_code == 200
    data = resummarize_res.json()
    assert data["job"]["id"] == job_id
    assert data["summary"] is not None
    assert "executive_summary" in data["summary"]
    assert len(data["transcript_segments"]) > 0

