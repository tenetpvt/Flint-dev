"""
FLINT RDD2022 India Dataset Preparation & Class Consolidation
Converts Pascal VOC XML annotations into YOLOv8 format with class consolidation:
  D40 -> 0: 'pothole' (Emergency Repair)
  D00, D10, D20 -> 1: 'crack' (Resurfacing)
Outputs 80/20 train/val splits to A:\\CODING\\BIG_DATA\\flint_rdd_india_yolo
"""

import os
import shutil
import random
import xml.etree.ElementTree as ET
from typing import Dict, List, Tuple

RAW_DIR = r"A:\CODING\BIG_DATA\India\train"
YOLO_DIR = r"A:\CODING\BIG_DATA\flint_rdd_india_yolo"

CLASS_MAP = {
    "D40": 0,  # Pothole
    "D00": 1,  # Longitudinal Crack
    "D10": 1,  # Transverse Crack
    "D20": 1,  # Alligator Crack
}

def parse_xml(xml_path: str) -> Tuple[int, int, List[Tuple[int, float, float, float, float]]]:
    tree = ET.parse(xml_path)
    root = tree.getroot()

    size = root.find("size")
    if size is None:
        return 0, 0, []
    
    w = int(size.find("width").text)
    h = int(size.find("height").text)

    boxes = []
    for obj in root.findall("object"):
        cls_name = obj.find("name").text.strip()
        if cls_name not in CLASS_MAP:
            continue
        
        cls_id = CLASS_MAP[cls_name]
        bnd = obj.find("bndbox")
        xmin = float(bnd.find("xmin").text)
        ymin = float(bnd.find("ymin").text)
        xmax = float(bnd.find("xmax").text)
        ymax = float(bnd.find("ymax").text)

        # Clamp
        xmin = max(0.0, min(float(w), xmin))
        xmax = max(0.0, min(float(w), xmax))
        ymin = max(0.0, min(float(h), ymin))
        ymax = max(0.0, min(float(h), ymax))

        bw = xmax - xmin
        bh = ymax - ymin
        if bw <= 1 or bh <= 1:
            continue

        # Convert to YOLO center format
        x_center = (xmin + bw / 2.0) / w
        y_center = (ymin + bh / 2.0) / h
        norm_w = bw / w
        norm_h = bh / h

        boxes.append((cls_id, x_center, y_center, norm_w, norm_h))

    return w, h, boxes

def prepare_dataset(split_ratio: float = 0.80, seed: int = 42):
    random.seed(seed)
    
    img_dir = os.path.join(RAW_DIR, "images")
    xml_dir = os.path.join(RAW_DIR, "annotations", "xmls")

    if not os.path.exists(img_dir) or not os.path.exists(xml_dir):
        print(f"[!] Raw directories not found in {RAW_DIR}")
        return

    # Create destination directories
    train_img = os.path.join(YOLO_DIR, "images", "train")
    val_img = os.path.join(YOLO_DIR, "images", "val")
    train_lbl = os.path.join(YOLO_DIR, "labels", "train")
    val_lbl = os.path.join(YOLO_DIR, "labels", "val")

    for d in (train_img, val_img, train_lbl, val_lbl):
        os.makedirs(d, exist_ok=True)

    xml_files = [f for f in os.listdir(xml_dir) if f.endswith(".xml")]
    print(f"[*] Processing {len(xml_files)} XML annotations...")

    valid_samples = []
    class_counts = {0: 0, 1: 0}

    for xml_file in xml_files:
        base_name = os.path.splitext(xml_file)[0]
        img_name = f"{base_name}.jpg"
        img_path = os.path.join(img_dir, img_name)
        xml_path = os.path.join(xml_dir, xml_file)

        if not os.path.exists(img_path):
            continue

        w, h, boxes = parse_xml(xml_path)
        if not boxes:
            continue # skip empty images for faster training convergence

        for b in boxes:
            class_counts[b[0]] += 1

        valid_samples.append((img_path, base_name, boxes))

    random.shuffle(valid_samples)
    split_idx = int(len(valid_samples) * split_ratio)
    train_samples = valid_samples[:split_idx]
    val_samples = valid_samples[split_idx:]

    print(f"[+] Total annotated images with defects: {len(valid_samples)}")
    print(f"    - Training split:   {len(train_samples)} images")
    print(f"    - Validation split: {len(val_samples)} images")
    print(f"    - Pothole instances (Class 0): {class_counts[0]}")
    print(f"    - Crack instances   (Class 1): {class_counts[1]}")

    def write_split(samples, dest_img_dir, dest_lbl_dir):
        for img_src, base, boxes in samples:
            # Copy image
            shutil.copy2(img_src, os.path.join(dest_img_dir, f"{base}.jpg"))
            # Write label txt
            lbl_path = os.path.join(dest_lbl_dir, f"{base}.txt")
            with open(lbl_path, "w") as f:
                for b in boxes:
                    f.write(f"{b[0]} {b[1]:.6f} {b[2]:.6f} {b[3]:.6f} {b[4]:.6f}\n")

    print(f"[*] Exporting training set...")
    write_split(train_samples, train_img, train_lbl)
    print(f"[*] Exporting validation set...")
    write_split(val_samples, val_img, val_lbl)

    # Write data.yaml
    yaml_path = os.path.join(YOLO_DIR, "rdd_india.yaml")
    yaml_content = f"""# FLINT RDD2022 India Dataset Configuration
path: {YOLO_DIR.replace(os.sep, '/')}
train: images/train
val: images/val

# Classes
nc: 2
names: ['pothole', 'crack']
"""
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(yaml_content)

    print(f"[+] Saved YOLO descriptor: {yaml_path}")
    print(f"[*] Dataset preparation complete!")
    return yaml_path

if __name__ == "__main__":
    prepare_dataset()
