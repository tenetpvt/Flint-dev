"""
FLINT Defect Model Transfer Learning Engine
Fine-tunes pothole_yolov8.pt on RDD2022 India (potholes + consolidated cracks)
with bus-elevation perspective and high-speed motion-blur augmentations.
"""

import os
import shutil
from ultralytics import YOLO

BASE_WEIGHTS = "edge/models/pothole_yolov8.pt"
DATA_YAML = r"A:\CODING\BIG_DATA\flint_rdd_india_yolo\rdd_india.yaml"
OUTPUT_PROJECT = r"A:\CODING\BIG_DATA\training_runs"
OUTPUT_NAME = "flint_rdd_india"
DEPLOY_PATH = "edge/models/flint_india_yolov8.pt"

def train():
    if not os.path.exists(BASE_WEIGHTS):
        raise FileNotFoundError(f"Base model '{BASE_WEIGHTS}' not found!")
    if not os.path.exists(DATA_YAML):
        raise FileNotFoundError(f"Dataset descriptor '{DATA_YAML}' not found. Run prepare_rdd_yolo.py first!")

    print(f"===========================================================")
    print(f"  FLINT Defect Model Transfer Learning Starting:")
    print(f"  Base Weights:    {BASE_WEIGHTS}")
    print(f"  Dataset:         {DATA_YAML}")
    print(f"  Output Project:  {OUTPUT_PROJECT}")
    print(f"===========================================================")

    # Initialize model with strong pre-trained pothole weights
    model = YOLO(BASE_WEIGHTS)

    # Execute transfer learning
    results = model.train(
        data=DATA_YAML,
        epochs=35,
        imgsz=640,
        batch=8,              # Optimized for 4GB RTX 3050 Laptop GPU
        device=0,             # NVIDIA RTX 3050
        workers=0,            # Single process on Windows to prevent WinError 1455 DLL paging exhaustion
        project=OUTPUT_PROJECT,
        name=OUTPUT_NAME,
        exist_ok=True,
        
        # Transfer learning learning rate (conservative to preserve existing crater features)
        lr0=0.001,
        lrf=0.01,
        weight_decay=0.0005,
        
        # Augmentations for bus camera height and speed
        perspective=0.0005,   # Simulates elevated bus-windshield perspective
        scale=0.5,            # Multi-scale zooming for distant & close craters
        shear=2.0,            # Simulates camera tilt/vibration
        mosaic=1.0,           # Composite 4 images into 1 for small/distant crater scale invariance
        fliplr=0.5,           # Mirror flipping
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
    )

    # Locate best.pt
    best_weights = os.path.join(OUTPUT_PROJECT, OUTPUT_NAME, "weights", "best.pt")
    if os.path.exists(best_weights):
        os.makedirs(os.path.dirname(DEPLOY_PATH), exist_ok=True)
        shutil.copy2(best_weights, DEPLOY_PATH)
        print(f"\n[+] Successfully deployed fine-tuned weights -> {DEPLOY_PATH}")
        print(f"===========================================================")
        print(f"  Fine-Tuned Model Ready for Inference:")
        print(f"  Target Classes: 0: 'pothole', 1: 'crack'")
        print(f"  Active File:    {DEPLOY_PATH}")
        print(f"===========================================================")
    else:
        print(f"[!] Warning: Could not locate best weights at {best_weights}")

if __name__ == "__main__":
    train()
