"""
FLINT RDD2022 India Subset Downloader
Extracts India.zip (502 MB) directly from the FigShare S3 remote archive
into A:\\CODING\\BIG_DATA to keep the FLINT repository clean and lightweight.
"""

import os
import sys
import time
import zipfile
import requests
from remotezip import RemoteZip

OUTPUT_DIR = r"A:\CODING\BIG_DATA"
ZIP_PATH = os.path.join(OUTPUT_DIR, "India.zip")
EXTRACT_DIR = os.path.join(OUTPUT_DIR, "India")
FIGSHARE_URL = "https://ndownloader.figshare.com/files/38030910"

def download_india_subset():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    if os.path.exists(EXTRACT_DIR) and len(os.listdir(EXTRACT_DIR)) > 0:
        print(f"[+] Dataset already extracted in {EXTRACT_DIR}")
        return EXTRACT_DIR

    if not os.path.exists(ZIP_PATH):
        print(f"[*] Resolving FigShare S3 stream for RDD2022...")
        resp = requests.get(FIGSHARE_URL, stream=True, headers={"User-Agent": "Mozilla/5.0"})
        s3_url = resp.url
        print(f"[+] Connected to S3 archive. Extracting 'RDD2022/India.zip' (502 MB)...")
        
        t0 = time.time()
        with RemoteZip(s3_url) as remote_archive:
            info = remote_archive.getinfo("RDD2022/India.zip")
            total_bytes = info.file_size
            print(f"[*] Remote file size: {total_bytes / (1024*1024):.1f} MB")
            
            with remote_archive.open("RDD2022/India.zip") as source, open(ZIP_PATH, "wb") as dest:
                downloaded = 0
                chunk_size = 1024 * 1024 # 1 MB chunks
                while True:
                    chunk = source.read(chunk_size)
                    if not chunk:
                        break
                    dest.write(chunk)
                    downloaded += len(chunk)
                    mb = downloaded / (1024 * 1024)
                    pct = (downloaded / total_bytes) * 100
                    speed = mb / max(0.1, time.time() - t0)
                    sys.stdout.write(f"\r    Downloading India.zip: {mb:5.1f} / {total_bytes/(1024*1024):.1f} MB [{pct:5.1f}%] ({speed:4.1f} MB/s)")
                    sys.stdout.flush()
        
        print(f"\n[+] Downloaded India.zip successfully in {time.time() - t0:.1f}s.")
    else:
        print(f"[+] Found cached archive: {ZIP_PATH}")

    # Extract India.zip
    print(f"[*] Unpacking India.zip into {EXTRACT_DIR}...")
    t0 = time.time()
    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        z.extractall(OUTPUT_DIR)
    print(f"[+] Unpacked in {time.time() - t0:.1f}s.")
    
    # Verification
    img_dir = os.path.join(EXTRACT_DIR, "train", "images")
    xml_dir = os.path.join(EXTRACT_DIR, "train", "annotations", "xmls")
    if os.path.exists(img_dir) and os.path.exists(xml_dir):
        imgs = len(os.listdir(img_dir))
        xmls = len(os.listdir(xml_dir))
        print(f"===========================================================")
        print(f"  RDD2022 India Dataset Verified Successfully:")
        print(f"  Images Location:      {img_dir} ({imgs} images)")
        print(f"  Annotations Location: {xml_dir} ({xmls} XML files)")
        print(f"===========================================================")
    else:
        print(f"[!] Warning: Structure in {EXTRACT_DIR}: {os.listdir(EXTRACT_DIR)}")

    return EXTRACT_DIR

if __name__ == "__main__":
    download_india_subset()
