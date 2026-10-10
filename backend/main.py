from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import sqlalchemy
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

from routers import api, simulation

app = FastAPI(title="FLINT Urban Intelligence API")

# Setup CORS
cors_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
if cors_env.strip() == "*":
    origins = ["*"]
    allow_credentials = False
else:
    origins = [orig.strip() for orig in cors_env.split(",") if orig.strip()]
    allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles

# Static evidence images & video streams mount
evidence_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "edge", "evidence_crops"))
videos_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "edge"))
os.makedirs(evidence_dir, exist_ok=True)
app.mount("/evidence", StaticFiles(directory=evidence_dir), name="evidence")
app.mount("/videos", StaticFiles(directory=videos_dir), name="videos")

app.include_router(api.router, prefix="/api")
app.include_router(simulation.router, prefix="/api/simulation")

@app.on_event("startup")
async def startup_event():
    import asyncio
    from sse import sse_manager
    sse_manager._loop = asyncio.get_running_loop()

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "HEALTHY", "timestamp": "2026-09-01T21:00:00Z"}


# Database Status
from database import engine as db_engine, DATABASE_URL
try:
    with db_engine.connect() as conn:
        db_mode = "SUPABASE (CLOUD)" if "supabase" in DATABASE_URL.lower() else "SQLITE (EDGE FALLBACK)"
        db_status = f"OPERATIONAL [{db_mode}]"
except Exception as e:
    db_status = f"UNAVAILABLE ({str(e)})"

@app.get("/")
def read_root():
    return {"status": "FLINT API is running"}

@app.get("/api/system-status")
def system_status():
    return {
        "API": "OPERATIONAL",
        "DATABASE": db_status,
        "SIMULATION ENGINE": "INACTIVE",
        "ALERT STREAM": "DISCONNECTED",
        "MAP SERVICE": "OPERATIONAL",
        "AI PIPELINE": "SIMULATED",
        "EDGE LAYER": "NOT CONNECTED",
    }
