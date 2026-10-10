---
name: flint-stack-orchestrator
description: >-
  Procedures for orchestrating, running, and verifying the multi-service FLINT platform.
  Use when launching the FastAPI backend, running the React MapLibre dashboard, testing API ingestion
  endpoints, monitoring Server-Sent Events (SSE), or validating frontend build integrity for Vercel.
---

# FLINT Stack Orchestrator & Deployment Guard

This skill defines the procedures to run and verify the FLINT multi-service stack across the backend, frontend, and edge simulation.

## Service Ports & Architecture

* **Central Backend (FastAPI):** Port `8000` (`http://localhost:8000`)
* **Dashboard Frontend (Vite + React):** Port `5173` (`http://localhost:5173`)
* **Edge Ingestion Endpoint:** `POST http://localhost:8000/api/ingest/detection`
* **Live GIS Basemap:** ESRI Dark Gray Canvas tiles with MapLibre GL

## Multi-Service Startup Sequence

### 1. Launch Central Backend (Terminal 1)
```powershell
cd a:\CODING\PROJECTS\Flint_SIH\backend
.\venv\Scripts\python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
* **Verify Health:** Open `http://localhost:8000/docs` in browser or run `curl http://localhost:8000/api/analytics/summary`.

### 2. Launch React Dashboard (Terminal 2)
```powershell
cd a:\CODING\PROJECTS\Flint_SIH\frontend
npm run dev
```
* **Verify Dashboard:** Open `http://localhost:5173/command-center`.

### 3. Run Edge Ingestion Feed (Terminal 3)
```powershell
cd a:\CODING\PROJECTS\Flint_SIH
python edge/main.py --video edge/sample_drive.mp4 --conf 0.40
```

## Critical Deployment Guards

* **Preserve Directory Name `frontend/`:**
  * NEVER rename `frontend/` to `dashboard/` or anything else.
  * Root `package.json` scripts (`"build": "npm run build --prefix frontend"`) and `vercel.json` expect `frontend/`. Renaming it breaks automated Vercel CI/CD deployments.
* **Map Layer Z-Index Discipline:**
  * Route polyline overlays render via SVG overlay paths directly positioned over the map.
  * Interactive marker popups must retain higher CSS z-indices than underlying map tile containers.
