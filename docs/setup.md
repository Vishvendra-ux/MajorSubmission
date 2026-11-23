# SUMIND-IQ Setup & Local Development Guide

SUMIND-IQ runs on a unified **Node.js + TypeScript** stack with **zero Python dependencies**.

---

## 1. Prerequisites
- **Node.js** `v20+` and **npm** `v10+`
- *Optional (for cloud/containerized production)*: MongoDB 7 / MongoDB Atlas, Redis 7, AWS S3 bucket, and a Gemini LLM API key. If absent locally, SUMIND-IQ activates documented embedded fallbacks automatically and reports live status on `/api/v1/health`.

---

## 2. Quick Local Startup (Recommended)

### Step 1 — Install Dependencies
```bash
npm install --prefix backend
npm install --prefix frontend
```

### Step 2 — Configure Environment (Optional)
```bash
cp .env.example .env
# Edit .env to add MONGODB_URI, REDIS_URL, AWS_S3_BUCKET, or LLM_API_KEY as needed
```

### Step 3 — Start Backend & Frontend Servers
```bash
# Terminal 1 — Node.js + Express.js Backend (Port 8000)
npm run dev --prefix backend

# Terminal 2 — React + Tailwind CSS Frontend (Port 5173)
npm run dev --prefix frontend
```

On first startup in `development` mode, the backend automatically seeds roles, permissions, workspaces, demo documents, embeddings, summaries, and demonstration accounts:
- **Admin**: `admin@sumind-iq.demo` / `Admin@12345`
- **Manager**: `manager@sumind-iq.demo` / `Manager@12345`
- **Employee**: `employee@sumind-iq.demo` / `Employee@12345`
- **Isolated Tenant**: `isolated@zenith.demo` / `Zenith@12345`

### Access URLs
- **Frontend Application**: `http://127.0.0.1:5173`
- **Backend API**: `http://127.0.0.1:8000`
- **Swagger OpenAPI Docs**: `http://127.0.0.1:8000/api/docs`
- **Health Telemetry**: `http://127.0.0.1:8000/api/v1/health`

---

## 3. Running with Docker Compose (MongoDB + Redis + Express + Nginx)

```bash
docker compose -f infrastructure/docker-compose.yml up --build
```

For production overrides:
```bash
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.prod.yml up -d --build
```
