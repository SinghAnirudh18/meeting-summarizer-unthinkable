# 🎯 MeetAI — Production AI Meeting Intelligence & Video Platform

[![Python](https://img.shields.io/badge/Python-3.12-blue.svg?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16%20(Turbopack)-black.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC%20Cloud-ff5900.svg?logo=webrtc&logoColor=white)](https://livekit.io)
[![Whisper](https://img.shields.io/badge/ASR-Faster--Whisper%20GPU-green.svg)](https://github.com/SYSTRAN/faster-whisper)
[![Groq](https://img.shields.io/badge/LLM-Groq%20Llama%20%26%20Compound-orange.svg)](https://groq.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**MeetAI** is a modern, enterprise-ready meeting platform that pairs real-time WebRTC video conferencing with an automated **AI Meeting Intelligence Engine**. It transcribes recorded audio via GPU Whisper, identifies conversation participants via conversational diarization, synthesizes detailed executive summaries, extracts key decisions and action items, and features an interactive AI Copilot with audio timestamp citations.

---

## 🌟 Key Features

### 1. 🎙️ GPU Whisper Speech-to-Text with VAD & Deduplication
- High-speed local transcription using **Faster-Whisper** with CUDA acceleration (and CPU fallback).
- **Voice Activity Detection (VAD)** filtering and hallucination loop prevention to eliminate empty repetitive speech tokens.
- Automatic cloud fallback to **Groq Whisper API** (`whisper-large-v3-turbo`) for sub-second transcription.

### 2. 🧠 AI Speaker Diarization & Participant Identification
- Reconstructs the full conversation into clean, natural speaker dialogue turns.
- Analyzes context, greetings, and name mentions to attribute exact names (e.g. `David (Product)`, `Sarah (Engineering)`, `Steven`).
- Automatically cleans stuttering, micro-splices, and ASR glitches while maintaining 100% fidelity to spoken dialogue.

### 3. 🎯 Deep Executive Synthesis & Summary
- Multi-paragraph, structured executive summaries describing context, discussion points, evaluated solutions, and strategic directions.
- **Key Topics**: Categorized hashtag pills for instant thematic navigation.
- **Key Takeaways**: Concrete bullet points highlighting critical resolutions.

### 4. ⚖️ Decisions & Action Items Tracking
- **Key Decisions**: Extracted explicit/implicit agreements with speaker tags, audio jump timestamps (`▶ 01:18`), and quotation snippets.
- **Action Items**: Concrete tasks with assigned owners, deadlines, audio seek triggers, and interactive completion checkboxes.

### 5. 📜 Dedicated Complete Transcript Studio
- Dedicated route (`/dashboard/intelligence/[id]/transcript`) with full screenplay script and chat-bubble modes.
- Vibrant speaker badge indicators (distinct gradient colors per participant).
- Instant text & speaker search with keyword highlighting.
- One-click formatted script copying (`📋 Copy Script`) and `.txt` file export.

### 6. 🤖 Interactive AI Copilot with Audio Citations
- Grounded conversational Q&A assistant trained on the meeting transcript.
- Clickable citation pills that automatically jump the audio player to the exact second a topic was spoken.

### 7. 📹 HD Video Conferencing & Screen Sharing
- Powered by **LiveKit Cloud** WebRTC SFU for low-latency HD video and spatial audio.
- In-meeting WebSocket real-time chat and live speaking indicators.

---

## 🏗️ Architecture

```text
                           ┌────────────────────────────────────────┐
                           │      FRONTEND (Next.js 16 App Router)  │
                           │     TypeScript • Tailwind CSS • React  │
                           └───────────────────┬────────────────────┘
                                               │
               ┌───────────────────────────────┼───────────────────────────────┐
               ▼                               ▼                               ▼
       REST / WebSocket                 WebRTC Audio/Video              Audio Uploads
               │                               │                               │
               ▼                               ▼                               ▼
     ┌──────────────────┐             ┌──────────────────┐            ┌──────────────────┐
     │  FastAPI Backend │             │  LiveKit Cloud   │            │ Background Task  │
     │  (Python 3.12)   │             │   (WebRTC SFU)   │            │ (Whisper + LLM)  │
     └─────────┬────────┘             └──────────────────┘            └────────┬─────────┘
               │                                                               │
      ┌────────┴────────┐                                             ┌────────┴────────┐
      ▼                 ▼                                             ▼                 ▼
 ┌──────────┐     ┌───────────┐                                 ┌──────────┐     ┌───────────┐
 │PostgreSQL│     │  Redis 7  │                                 │ Faster-  │     │   Groq    │
 │ (Async)  │     │(Sessions) │                                 │ Whisper  │     │ LLM Engine│
 └──────────┘     └───────────┘                                 └──────────┘     └───────────┘
```

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS, Axios |
| **Video & Real-Time** | LiveKit Cloud WebRTC SFU, `@livekit/components-react`, WebSocket Chat |
| **Backend API** | FastAPI (Python 3.12), SQLAlchemy 2.0 (Async), Alembic, Pydantic v2, Structlog |
| **Speech Recognition (ASR)** | Faster-Whisper (CTranslate2 CUDA/CPU), OpenAI-Whisper, Groq Whisper API |
| **LLM & Intelligence** | Groq Cloud API (`openai/gpt-oss-120b`, `qwen/qwen3.6-27b`, `groq/compound`), Local GGUF LLM |
| **Database & Cache** | PostgreSQL 16 (asyncpg), Redis 7 |
| **Testing** | Pytest (asyncio), Next.js Type Check & Production Bundle Verification |

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v20+
- **Python**: v3.12+
- **PostgreSQL 16** & **Redis 7** (or Docker)
- **LiveKit Cloud** account ([livekit.io](https://cloud.livekit.io))
- **Groq API Key** ([console.groq.com](https://console.groq.com))

---

### Method A: Local Development Setup

#### 1. Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

Edit `backend/.env`:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/meeting_platform
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=your-super-secret-key-32-chars-min
GROQ_API_KEY=gsk_your_groq_api_key_here
LIVEKIT_API_KEY=your_livekit_key
LIVEKIT_API_SECRET=your_livekit_secret
LIVEKIT_URL=wss://your-project.livekit.cloud
```

Apply database migrations & start backend:
```bash
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Backend API will be running at: `http://localhost:8000` (Swagger docs at `http://localhost:8000/docs`)

---

#### 2. Frontend Setup
```bash
cd ../frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
```

Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

Start frontend dev server:
```bash
npm run dev
```
Frontend will be accessible at: `http://localhost:3000`

---

### Method B: Docker Compose

```bash
docker compose up --build
```

Services started:
- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:8000`
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`

---

## 📡 API Endpoints

### 🔐 Authentication (`/api/v1/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Register new account |
| `POST` | `/auth/login` | Login and obtain JWT tokens |
| `POST` | `/auth/refresh` | Refresh JWT access token |
| `GET` | `/auth/me` | Fetch authenticated user profile |

### 📹 Meetings (`/api/v1/meetings`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/meetings` | Create a new meeting room |
| `GET` | `/meetings` | List past and active meetings |
| `GET` | `/meetings/{id}` | Get meeting details |
| `POST` | `/meetings/{id}/join` | Generate LiveKit participant token |
| `POST` | `/meetings/{id}/end` | End active meeting |

### 🎙️ Audio & Meeting Intelligence (`/api/v1/audio`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/audio/upload` | Upload audio file, transcribe via Whisper & extract intelligence |
| `GET` | `/audio/jobs` | List all audio processing jobs |
| `GET` | `/audio/jobs/{id}` | Get summary, diarized transcript, decisions & actions |
| `POST` | `/audio/jobs/{id}/resummarize` | Re-run AI diarization & executive synthesis |
| `POST` | `/audio/jobs/{id}/ask` | Ask AI Copilot question with audio citations |
| `PATCH` | `/audio/actions/{id}` | Toggle action item status (`Pending` / `Completed`) |
| `GET` | `/audio/jobs/{id}/stream` | Stream audio with HTTP range request support |
| `GET` | `/audio/jobs/{id}/download` | Download raw meeting audio file |

---

## 🧪 Testing

### Backend Unit & Integration Tests (20 Tests)
```bash
cd backend
pytest
```
All 20 test cases run against an isolated SQLite test database covering auth, meeting workflows, audio uploads, resummarization, and intelligence retrieval.

### Frontend Typecheck & Production Build
```bash
cd frontend
npm run build
```

---

## 📄 License

This project is licensed under the **MIT License**.
