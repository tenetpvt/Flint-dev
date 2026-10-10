"""
Uploads all evidence crop photos to Supabase Storage bucket 'evidence'.
Enables 100% cloud-hosted media accessible from anywhere without local dependencies.
"""
import os
import glob
import requests
from dotenv import load_dotenv

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
load_dotenv(os.path.join(backend_dir, ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://xuoavkdaiejmqnbadvli.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_KEY", ""))
BUCKET_NAME = os.getenv("SUPABASE_STORAGE_BUCKET", "evidence")

SOURCE_DIRS = [
    os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "evidence"),
    os.path.join(os.path.dirname(__file__), "..", "edge", "evidence_crops"),
]

def upload_all():
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "x-upsert": "true",
    }

    # Ensure bucket exists
    bucket_url = f"{SUPABASE_URL}/storage/v1/bucket"
    r = requests.post(bucket_url, headers=headers, json={"id": BUCKET_NAME, "name": BUCKET_NAME, "public": True})
    if r.status_code in (200, 201):
        print(f"[OK] Supabase Storage Bucket '{BUCKET_NAME}' verified (Public).")
    else:
        print(f"[NOTICE] Bucket status: {r.status_code} {r.text}")

    # Gather unique files
    files_to_upload = {}
    for d in SOURCE_DIRS:
        if os.path.exists(d):
            for ext in ("*.jpg", "*.jpeg", "*.png"):
                for p in glob.glob(os.path.join(d, ext)):
                    fname = os.path.basename(p)
                    if fname not in files_to_upload:
                        files_to_upload[fname] = p

    print(f"\n>>> Found {len(files_to_upload)} unique evidence crop files to upload...")

    success = 0
    failed = 0

    for fname, fpath in sorted(files_to_upload.items()):
        content_type = "image/png" if fname.lower().endswith(".png") else "image/jpeg"
        upload_headers = dict(headers)
        upload_headers["Content-Type"] = content_type

        upload_url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{fname}"

        with open(fpath, "rb") as f:
            data = f.read()

        res = requests.post(upload_url, headers=upload_headers, data=data)
        if res.status_code in (200, 201):
            success += 1
            print(f"  [UPLOADED] {fname} ({len(data)} bytes)")
        else:
            failed += 1
            print(f"  [FAILED] {fname}: {res.status_code} {res.text}")

    print(f"\n>>> [COMPLETE] Successfully uploaded {success} files. Failed: {failed}.")
    print(f">>> Public Storage Base URL: {SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/")

if __name__ == "__main__":
    upload_all()
