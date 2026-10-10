"""
FLINT Tier 2 VLM Manual & Automated Test Script
Sends road evidence images to local Ollama (qwen2.5vl:3b) and validates structured JSON output.
"""
import os
import sys
import json
import base64
import time
import urllib.request

OLLAMA_API = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "qwen2.5vl:3b"

def test_image(image_path: str):
    if not os.path.exists(image_path):
        print(f"Error: Image {image_path} not found.")
        return

    print(f"\n==========================================")
    print(f"Testing VLM on: {image_path}")
    print(f"Model: {MODEL_NAME}")
    print(f"==========================================")

    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode("utf-8")

    prompt = (
        "Analyze this road or traffic surveillance camera frame.\n"
        "Identify road hazards such as potholes, severe cracks, waterlogging, missing dividers, or road blockages.\n"
        "Return ONLY a valid JSON object matching this schema without any markdown formatting:\n"
        "{\n"
        '  "hazard_detected": true,\n'
        '  "hazard_type": "pothole" | "waterlogging" | "missing_divider" | "road_blockage" | "none",\n'
        '  "severity": "low" | "medium" | "high" | "critical",\n'
        '  "description": "<concise 1-sentence assessment of the visual evidence>",\n'
        '  "visual_confidence": <float between 0.0 and 1.0>\n'
        "}"
    )

    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "images": [img_b64],
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.2
        }
    }

    start = time.time()
    req = urllib.request.Request(
        OLLAMA_API,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            elapsed = time.time() - start
            raw_response = data.get("response", "{}")
            print(f"Inference latency: {elapsed:.2f} seconds")
            print("\nVLM Structured JSON Output:")
            parsed = json.loads(raw_response)
            print(json.dumps(parsed, indent=2))
            return parsed
    except Exception as e:
        print(f"VLM Request failed: {e}")
        return None

if __name__ == "__main__":
    img = sys.argv[1] if len(sys.argv) > 1 else "frontend/public/evidence/pothole_01.jpg"
    test_image(img)
