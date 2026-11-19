# SUMIND-IQ — Setup & Deployment Guide

## 1. Local Development (Standalone Mode)

### Prerequisites
- Python 3.9+ / 3.12 (recommended)
- Node.js 20+ and npm 10+
- Optional: PostgreSQL 16 (`pgvector`), MongoDB 7, Redis 7, Tesseract OCR (if not running on the host, SUMIND-IQ automatically activates its documented local development fallbacks and reports them via `/api/v1/health`).

### Step 1: Environment Configuration
```bash
cp .env.example .env
```

### Step 2: Backend Setup, Migrations & Seed Data
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run Alembic migrations
alembic upgrade head

# Seed [DEMO] accounts and multi-format sample documents
python -m app.db.seed

# Start FastAPI server on http://127.0.0.1:8000
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Step 3: Frontend Setup & Dev Server
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 2. Docker Compose Full-Stack Deployment

To launch the complete polyglot stack (`PostgreSQL 16 + pgvector`, `MongoDB 7`, `Redis 7.4`, `FastAPI Backend`, `Celery Worker`, and `Nginx + React Frontend`):

```bash
docker compose -f infrastructure/docker-compose.yml up --build -d
```

For production hardening:
```bash
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.prod.yml up --build -d
```

---

## 3. Seeded Demonstration Accounts (`[DEMO DATA]`)

| Role | Email | Password | Organisation | Scope |
|---|---|---|---|---|
| **Admin** | `admin@sumind-iq.demo` | `Admin@12345` | Apex Global Technologies (Demo) | Full Org, Users, Roles, Audit, Jobs, System Config, Restricted Docs |
| **Manager** | `manager@sumind-iq.demo` | `Manager@12345` | Apex Global Technologies (Demo) | Engineering & HR Workspaces, Team Docs, Team Analytics |
| **Employee** | `employee@sumind-iq.demo` | `Employee@12345` | Apex Global Technologies (Demo) | Permitted Org & Engineering Docs, Upload, Search, Grounded Assistant |
| **Isolated Tenant** | `isolated@zenith.demo` | `Zenith@12345` | Zenith BioLabs Pvt Ltd | Separate tenant for cross-organisation isolation testing |

