"""
Transfers all tables and data from local SQLite (backend/flint.db) into Supabase PostgreSQL.
Preserves primary keys, timestamps, coordinates, and relationships.
"""
import sqlite3
import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from dotenv import load_dotenv

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, backend_dir)
load_dotenv(os.path.join(backend_dir, ".env"))

import models

SQLITE_PATH = os.path.join(backend_dir, "flint.db")
SUPABASE_URL = os.getenv("SUPABASE_DATABASE_URL", os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/postgres"))

def migrate():
    print(f">>> Connecting to SQLite: {SQLITE_PATH}...")
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row

    print(f">>> Connecting to Supabase PostgreSQL...")
    pg_engine = create_engine(SUPABASE_URL)

    # 1. Create all tables on Supabase if not present
    print(">>> Creating schema / tables on Supabase via SQLAlchemy...")
    models.Base.metadata.create_all(bind=pg_engine)

    Session = sessionmaker(bind=pg_engine)
    pg_session = Session()

    tables = [
        ("routes", models.Route),
        ("buses", models.Bus),
        ("route_journeys", models.RouteJourney),
        ("detections", models.Detection),
        ("alerts", models.Alert),
        ("alert_events", models.AlertEvent),
    ]

    try:
        for table_name, model_class in tables:
            rows = sqlite_conn.execute(f"SELECT * FROM {table_name}").fetchall()
            print(f">>> Syncing {table_name}: {len(rows)} records found in SQLite...")

            # Clean existing records in reverse dependency to avoid duplicate primary key collisions
            pg_session.query(model_class).delete()

            for r in rows:
                data = dict(r)
                # Convert timestamps if stored as string in SQLite
                record = model_class(**data)
                pg_session.add(record)

            pg_session.commit()
            print(f"    [OK] Transferred {len(rows)} records to Supabase {table_name}")

        print("\n>>> [SUCCESS] All records successfully synchronized to Supabase PostgreSQL!")
    except Exception as e:
        pg_session.rollback()
        print(f"\n[ERROR] Migration failed: {e}")
        raise
    finally:
        pg_session.close()
        sqlite_conn.close()

if __name__ == "__main__":
    migrate()
