# SUMIND-IQ — Enterprise AI Knowledge Management Platform

**SUMIND-IQ** is a full-stack, multi-tenant enterprise AI knowledge management and grounded Retrieval-Augmented Generation (RAG) platform built on a 100% **JavaScript / TypeScript** stack (**React.js + Tailwind CSS** on the frontend and **Node.js + Express.js + MongoDB** on the backend).

---

## Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React.js + Tailwind CSS (Vite + TypeScript + TanStack Query + Recharts) |
| **Backend** | Node.js + Express.js (TypeScript) |
| **Database** | MongoDB (with persistent local embedded MongoDB document store fallback) |
| **Authentication** | JWT + bcrypt (`jsonwebtoken` + `bcryptjs`) |
| **AI Integration** | LLM API (Gemini API + deterministic zero-hallucination extractive verifier) |
| **Embeddings** | JavaScript Embedding SDK/API (384-d semantic vectors) |
| **Vector Search** | MongoDB Atlas Vector Search (`$vectorSearch` pipeline + hybrid lexical ranking) |
| **Document Processing** | PDF.js (`pdfjs-dist`), Mammoth.js (`mammoth`), SheetJS (`xlsx`), JSZip (`pptx`) |
| **OCR** | Tesseract.js (`tesseract.js`) |
| **File Storage** | AWS S3 (`@aws-sdk/client-s3` + presigned URLs, with local disk fallback) |
| **Background Jobs** | BullMQ + Redis (`bullmq` + `ioredis`, with in-process async worker fallback) |

---

## Quick Start (Zero Python Required)

### 1. Install Dependencies
```bash
npm install --prefix backend
npm install --prefix frontend
```

### 2. Run Backend & Frontend Servers
```bash
# Terminal 1 — Start Node.js + Express.js Backend (Port 8000)
npm run dev --prefix backend

# Terminal 2 — Start React + Tailwind CSS Frontend (Port 5173)
npm run dev --prefix frontend
```

- **Frontend UI**: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- **Backend API**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive API Docs**: [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs)
- **Health Check**: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)

---

## Pre-Seeded Demonstration Accounts

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@sumind-iq.demo` | `Admin@12345` | Full organisation governance, users, roles, audit logs, all 4 demo documents |
| **Manager** | `manager@sumind-iq.demo` | `Manager@12345` | Workspace management, team analytics, 3 non-restricted documents |
| **Employee** | `employee@sumind-iq.demo` | `Employee@12345` | Semantic search, grounded Q&A, summaries on 2 organisation-wide documents |
| **Isolated Tenant** | `isolated@zenith.demo` | `Zenith@12345` | Separate tenant (`Zenith BioLabs`) for cross-tenant isolation verification |

---

## Running Automated Tests

```bash
# Run Backend Integration & Security Suite (Vitest + Supertest)
npm test --prefix backend

# Run Frontend Component & UI Suite (Vitest + Testing Library)
npm test --prefix frontend
```
