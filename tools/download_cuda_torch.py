"""
Resumable Downloader for PyTorch CUDA 12.4 Wheel
Handles network connection resets (WinError 10054) automatically by resuming
from the exact byte offset using HTTP Range headers (HTTP 206 Partial Content).
"""

import os
import sys
import time
import subprocess
import requests

URL = "https://download-r2.pytorch.org/whl/cu124/torch-2.6.0%2Bcu124-cp313-cp313-win_amd64.whl"
DEST_FILE = os.path.abspath("torch-2.6.0+cu124-cp313-cp313-win_amd64.whl")
CHUNK_SIZE = 4 * 1024 * 1024  # 4 MB chunks

def get_remote_size(url: str) -> int:
    """Retrieve total file size from Content-Length header."""
    for attempt in range(5):
        try:
            r = requests.head(url, timeout=15)
            if r.status_code in (200, 206):
                return int(r.headers.get("content-length", 0))
        except Exception as e:
            print(f"[Attempt {attempt + 1}] Head request failed: {e}. Retrying in 2s...")
            time.sleep(2)
    return 0

def download_resumable(url: str, dest_path: str) -> bool:
    """Downloads a file with automatic resumption on socket connection drops."""
    total_size = get_remote_size(url)
    print(f"Target Wheel: {os.path.basename(dest_path)}")
    print(f"Total Size:   {total_size / (1024 * 1024):.1f} MB (2.53 GB)")
    print(f"Destination:  {dest_path}")
    print("-" * 65)

    last_report_time = time.time()
    last_downloaded_bytes = 0

    while True:
        existing_size = os.path.getsize(dest_path) if os.path.exists(dest_path) else 0

        if total_size > 0 and existing_size >= total_size:
            print(f"\n✅ Download complete! Verified {existing_size / (1024 * 1024):.1f} MB.")
            return True

        headers = {}
        if existing_size > 0:
            headers["Range"] = f"bytes={existing_size}-"
            print(f"\n🔄 Resuming download from offset: {existing_size / (1024 * 1024):.1f} MB ({existing_size} bytes)...")
        else:
            print("Starting fresh download...")

        try:
            with requests.get(url, headers=headers, stream=True, timeout=20) as response:
                if response.status_code not in (200, 206):
                    print(f"Unexpected HTTP status {response.status_code}. Retrying in 3s...")
                    time.sleep(3)
                    continue

                with open(dest_path, "ab") as f:
                    for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                        if chunk:
                            f.write(chunk)
                            now = time.time()
                            cur_bytes = os.path.getsize(dest_path)
                            if now - last_report_time >= 5.0:
                                elapsed = now - last_report_time
                                speed_mb = (cur_bytes - last_downloaded_bytes) / (1024 * 1024 * elapsed)
                                pct = (cur_bytes / total_size * 100) if total_size > 0 else 0
                                print(
                                    f"Progress: {cur_bytes / (1024 * 1024):.1f} / {total_size / (1024 * 1024):.1f} MB "
                                    f"({pct:.1f}%) @ {speed_mb:.2f} MB/s"
                                )
                                last_report_time = now
                                last_downloaded_bytes = cur_bytes

        except (requests.exceptions.RequestException, ConnectionResetError, OSError) as err:
            cur_mb = os.path.getsize(dest_path) / (1024 * 1024) if os.path.exists(dest_path) else 0
            print(f"\n⚠️ Socket dropped ({err.__class__.__name__}: {err}). Progress saved at {cur_mb:.1f} MB. Reconnecting in 3s...")
            time.sleep(3)

def install_cuda_wheel(wheel_path: str) -> None:
    """Installs the downloaded wheel and torchvision."""
    python_exe = sys.executable
    pip_cmd = [
        python_exe,
        "-m",
        "pip",
        "install",
        wheel_path,
        "torchvision",
        "--index-url",
        "https://download.pytorch.org/whl/cu124",
    ]
    print("\n📦 Installing downloaded PyTorch CUDA wheel via pip...")
    print("Command:", " ".join(pip_cmd))
    res = subprocess.run(pip_cmd)
    if res.returncode == 0:
        print("\n🎉 SUCCESS! PyTorch CUDA is installed.")
        # Verify CUDA
        verify_cmd = [python_exe, "-c", "import torch; print('CUDA Available:', torch.cuda.is_available(), '| Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None')"]
        subprocess.run(verify_cmd)
    else:
        print("\n❌ Pip install returned code:", res.returncode)

if __name__ == "__main__":
    if download_resumable(URL, DEST_FILE):
        install_cuda_wheel(DEST_FILE)
