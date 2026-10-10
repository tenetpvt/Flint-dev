import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(env_path)

# Dual-Mode Database Architecture (Supabase Cloud Sync <-> Embedded SQLite Edge Fallback)
database_mode = os.getenv("DATABASE_MODE", "supabase").lower().strip()
supabase_url = os.getenv("SUPABASE_DATABASE_URL")
sqlite_path = os.path.join(BASE_DIR, "flint.db")
default_sqlite_url = f"sqlite:///{sqlite_path}"
sqlite_url = os.getenv("SQLITE_DATABASE_URL") or default_sqlite_url

DATABASE_URL = sqlite_url
if database_mode == "supabase" and supabase_url:
    try:
        # Pre-flight ping to Supabase; falls back to local SQLite if offline/unreachable
        test_engine = create_engine(supabase_url, pool_pre_ping=True)
        with test_engine.connect() as conn:
            pass
        DATABASE_URL = supabase_url
        print("[DATABASE] Successfully connected to Supabase PostgreSQL.")
    except Exception as e:
        print(f"[DATABASE] Supabase unreachable ({e}). Failing over to local SQLite fallback ({sqlite_url}).")
        DATABASE_URL = sqlite_url
else:
    DATABASE_URL = os.getenv("DATABASE_URL", sqlite_url)
    print(f"[DATABASE] Operating in local/offline database mode: {DATABASE_URL}")

# SQLite needs check_same_thread=False
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def ensure_schema_compatibility():
    if DATABASE_URL.startswith("sqlite"):
        try:
            with engine.connect() as conn:
                res = conn.exec_driver_sql("PRAGMA table_info(detections)").fetchall()
                existing_cols = [r[1] for r in res]
                cols_to_add = [
                    ("estimated_area_sq_m", "FLOAT"),
                    ("severity_tier", "VARCHAR"),
                    ("repair_method", "VARCHAR"),
                    ("estimated_cost", "FLOAT"),
                ]
                for col_name, col_type in cols_to_add:
                    if col_name not in existing_cols:
                        conn.exec_driver_sql(f"ALTER TABLE detections ADD COLUMN {col_name} {col_type}")
        except Exception:
            pass

ensure_schema_compatibility()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

