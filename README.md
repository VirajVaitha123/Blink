# Blink

Accessibility communication app for someone who can only blink. A scanning interface highlights letter groups; the user blinks to lock a selection. A second person can join the same session as a live observer to see text as it's composed.

## Architecture

- **Frontend** (`frontend/`) — Next.js 16 App Router + TypeScript + Tailwind. MediaPipe Face Landmarker runs in-browser for blink detection (no video leaves the device).
- **Backend** (`backend/`) — Python uv workspace.
  - `blink_shared/` — SQLModel tables, config, shared services (flat-layout package).
  - `api/` — FastAPI app. Sessions API + SSE stream endpoint backed by Postgres `LISTEN/NOTIFY` (via `asyncpg`).
  - `alembic/` — DB migrations (initialized on demand).
  - `functions/` — Azure Functions placeholder.
- **Database** — Postgres (local: docker-compose; prod: Azure Database for PostgreSQL).

## Local development

### 1. Start Postgres

```bash
docker compose up -d postgres
```

### 2. Backend

```bash
cd backend
uv sync --all-packages
cp ../.env.example ../.env  # edit if needed
cd api
uv run uvicorn main:app --reload
```

API: http://localhost:8000 — docs at `/docs`.

### 3. Frontend

```bash
cd frontend
npm run dev
```

Frontend: http://localhost:3000.

## Deployment

Local first. Once features are stable we'll provision Azure resources via `az` CLI (Static Web Apps for the frontend, Container Apps or App Service for the API, Azure Database for PostgreSQL flexible server). Terraform comes later.
