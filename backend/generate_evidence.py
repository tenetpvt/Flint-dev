import os
from PIL import Image, ImageDraw, ImageFont

frontend_public_evidence = os.path.join("..", "frontend", "public", "evidence")
os.makedirs(frontend_public_evidence, exist_ok=True)

images = [
    ("pothole_01.jpg", "Pothole Detection #01", (150, 50, 50)),
    ("pothole_02.jpg", "Pothole Detection #02", (150, 50, 50)),
    ("traffic_01.jpg", "Traffic Congestion #01", (150, 100, 50)),
    ("traffic_02.jpg", "Traffic Congestion #02", (150, 100, 50)),
    ("obstruction_01.jpg", "Road Blockage #01", (150, 50, 50)),
    ("safety_01.jpg", "Safety Hazard #01", (50, 100, 150)),
    ("accident_01.jpg", "Traffic Incident #01", (150, 50, 50))
]


for filename, text, color in images:
    img = Image.new('RGB', (800, 600), color=color)
    d = ImageDraw.Draw(img)
    # Just draw text in the middle
    d.text((300, 280), text, fill=(255, 255, 255))
    img.save(os.path.join(frontend_public_evidence, filename))

print("Evidence images generated.")
