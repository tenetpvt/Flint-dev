# FLINT — Urban Intelligence Platform

<p align="center">
  <strong>Municipal Sensing & Intelligent Urban Operations Platform</strong>
</p>

---

## 📌 Overview

**FLINT** is a real-time urban sensing and road intelligence platform designed for municipal operations. Using public transit buses equipped with edge sensing units, FLINT aggregates continuous road-surface defect monitoring, traffic congestion indicators, and critical safety hazards across city routes (demonstrated in Raipur, Chhattisgarh).

---

## 🏛 System Architecture

```
                 ┌────────────────────────┐
                 │  SIMULATION / FUTURE   │
                 │   EDGE BUS SENSORS     │
                 └───────────┬────────────┘
                             │
                             ▼ POST /api/ingest/detection
                 ┌────────────────────────┐
                 │    FASTAPI BACKEND     │
                 │     (Event Engine)     │
                 └───────────┬────────────┘
                             │
                 ┌───────────┴───────────┐
                 ▼                       ▼
          ┌─────────────┐         ┌──────────────┐
          │  DATABASE   │         │  SSE STREAM  │
          │ (PostgreSQL/│         │ (Live Alerts)│
          │   SQLite)   │         └──────┬───────┘
          └──────┬──────┘                │
                 └───────────┬───────────┘
                             ▼
                 ┌────────────────────────┐
                 │    FLINT DASHBOARD     │
                 ├────────────────────────┤
                 │ • Command Center       │
                 │ • Live GIS Map         │
                 │ • City Analytics       │
                 │ • Live Alert Queue     │
                 │ • Fleet Overview       │
                 │ • System Status        │
                 └────────────────────────┘
```

---

## 💡 Key Edge AI Innovations & Accuracy Guarantees

FLINT incorporates four high-impact architectural techniques designed specifically for real-world municipal transit deployments:

1. **Improvement 4: Bumper Vibration / Accelerometer Fusion (The Ultimate Edge Co-Validation)**
   * Edge devices (or phone/tablet test units) have built-in 3-axis IMU/accelerometers ($Z$-axis bump detection).
   * If YOLO detects a dark depression on the asphalt AND the bus suspension registers a vertical $Z$-axis G-force spike 0.3 seconds later as the wheels hit it: **That is 100% ground-truth confirmation of a deep pothole.** It drops the false-positive rate to near zero.

2. **Improvement 2: Dual-Frame Epipolar / Motion Verification for Water (Simple CV Upgrade)**
   * For waterlogging: instead of just single-frame sky reflectance, look at two frames 0.5s apart.
   * Potholes and road texture move predictably across the frame with the bus's optical flow. Standing water has specular reflection that glints and ripples differently from rigid asphalt texture.
   * Adding optical flow consistency to your Tier 2 trigger eliminates false triggers on dry, shiny asphalt.

3. **Improvement 3: Severity-Weighted Priority Scoring (Municipal Triage)**
   * In the complaint engine, introduce a composite Criticality Index:
     $$\text{Priority} = (\text{Severity Score}) \times (\text{Traffic Density of Corridor}) \times (\text{Number of Unique Bus Confirmations})$$
   * A pothole on GE Road (high transit volume) gets elevated to PWD Priority 1, whereas a surface crack on an empty depot road gets batched into scheduled monthly maintenance.

4. **Two-Tier Edge + Private Sovereign VLM Architecture**
   * **Tier 1 (Edge Specialist):** YOLOv8 + ByteTrack running continuously on the bus (offline-first, zero cloud API bills).
   * **Tier 2 (Selective VLM Verification):** Candidate frames are selectively routed via KDTree geofencing and optical flow triggers to a private on-premise GPU running **Ollama + Qwen3-VL**.

---

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, TanStack React Query, MapLibre GL, React Router
- **Backend**: FastAPI, SQLAlchemy, Alembic, Pydantic v2, Uvicorn
- **Database**: PostgreSQL (Docker-ready) / SQLite (development mode)
- **Map & GIS**: MapLibre GL with ESRI Dark Gray Canvas GIS basemaps

---

## 📁 Repository Structure

```
Flint_SIH/
├── backend/
│   ├── alembic/              # Database migrations
│   ├── routers/              # API router endpoints (/api/buses, /journeys, etc.)
│   ├── database.py           # SQLAlchemy engine & session management
│   ├── models.py             # ORM models (Bus, Route, Journey, Detection, Alert)
│   ├── schemas.py            # Pydantic request/response schemas
│   ├── seeder.py             # Realistic Raipur database seeder
│   ├── generate_evidence.py  # Dummy evidence generator
│   ├── main.py               # FastAPI application entry point
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Backend environment template
├── frontend/
│   ├── src/
│   │   ├── components/layout/# Sidebar, Header, Layout
│   │   ├── components/ui/    # LoadingState, ErrorState
│   │   ├── pages/            # CommandCenter, LiveMap, Analytics, etc.
│   │   ├── services/         # Axios API clients & React Query hooks
│   │   └── utils/            # Map styles & coordinate constants
│   ├── public/evidence/      # Sample detection evidence images
│   ├── package.json          # Node dependencies
│   ├── vite.config.ts        # Vite configuration
│   └── .env.example          # Frontend environment template
├── docker-compose.yml        # PostgreSQL service container definition
├── .gitignore                # Root gitignore protecting secrets & build artifacts
└── README.md
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python 3.10+**
- **Node.js 18+** and **npm**
- *(Optional)* **Docker & Docker Compose** (for PostgreSQL)

---

### 2. Backend Setup

```bash
cd backend

# 1. Create and activate virtual environment
python -m venv venv
# On Windows PowerShell:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env

# 4. Run database migrations
alembic upgrade head

# 5. Seed the database with Raipur routes & buses
python seeder.py

# 6. Generate placeholder evidence images
python generate_evidence.py

# 7. Start backend development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
Backend will be live at `http://localhost:8000` (Swagger docs at `http://localhost:8000/docs`).

---

### 3. Frontend Setup

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start frontend development server
npm run dev
```
Frontend will be live at `http://localhost:5173`.

---

## ⚙️ Environment Configuration

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:8000
VITE_MAP_STYLE_URL=
```

### Backend (`backend/.env`)
```env
# For SQLite:
DATABASE_URL=sqlite:///./flint.db

# For PostgreSQL (Docker):
# DATABASE_URL=postgresql://flint:flintpassword@localhost:5432/flint

CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## 🗺 Application Routes

| Route | Page | Purpose |
|---|---|---|
| `/command-center` | **Command Center** | High-level fleet KPIs, real-time Raipur GIS map, and Route Report review cards |
| `/live-map` | **Live Map** | Interactive MapLibre GIS map with layer filters (Defects, Traffic, Safety), bus markers, and route details |
| `/analytics` | **Analytics** | Emerged defect patterns, route severity rankings, and affected area intelligence |
| `/live-alerts` | **Live Alerts** | Critical & High severity event queue with full lifecycle tracking (`NEW` → `ACKNOWLEDGED` → `RESOLVED`) |
| `/fleet` | **Fleet** | Real-time status and telemetry table for municipal buses |
| `/system-status` | **System Status** | Pipeline health and sensor connectivity status |

---

## ☁️ Vercel Deployment Guide

FLINT is configured for immediate deployment to **Vercel** with full client-side SPA routing (`/command-center`, `/live-alerts`, `/analytics`, etc.).

### Step 1: Push Code to GitHub
Ensure all your changes are committed and pushed to your GitHub repository:
```bash
git add .
git commit -m "chore: prepare repository for Vercel deployment"
git push origin main
```

### Step 2: Import into Vercel
1. Log into your [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** > **Project** and select your `Flint_SIH` repository.
3. Choose either deployment method:
   - **Method A (Default Root Import)**:
     Leave Root Directory as `./`. FLINT includes a root `vercel.json` that automatically runs `cd frontend && npm install && npm run build` and serves `frontend/dist`.
   - **Method B (Vercel Monorepo Setting - Recommended)**:
     In the import screen, click **Edit** next to **Root Directory** and select `frontend`. Vercel will detect Vite automatically. `frontend/vercel.json` provides the necessary SPA routing rewrites.

### Step 3: Configure Environment Variables
In Vercel's **Environment Variables** section, configure:
| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | URL of your deployed FLINT backend | `https://flint-api.onrender.com` |
| `VITE_MAP_STYLE_URL` | Carto Dark Matter GIS style URL | `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` |

### Step 4: Deploy Backend API
Deploy the `backend/` directory to any Python/FastAPI host (e.g. **Render**, **Railway**, or **Fly.io**):
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port 8000`
- **Environment Variables**:
  - `DATABASE_URL`: `sqlite:///./flint.db` (or PostgreSQL connection string)
  - `CORS_ORIGINS`: `https://your-app.vercel.app` *(Note: `*.vercel.app` domains are also automatically permitted via built-in regex)*

---

## 🔒 Security & Git Hygiene

Sensitive `.env` files, virtual environments (`venv/`), database binaries (`*.db`), and build outputs (`dist/`, `node_modules/`, `.vercel/`) are strictly ignored via `.gitignore`. Always distribute `.env.example` without credentials.

