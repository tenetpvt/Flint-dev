"""
FLINT Synthetic Road Video Generator
Generates a realistic synthetic road test video to validate camera ingestion,
Ground ROI polygon masking, and edge inference without requiring external hardware.
"""

import os
import cv2
import argparse
import numpy as np

def generate_test_video(
    output_path: str = "edge/sample_drive.mp4",
    duration_sec: int = 10,
    fps: int = 30,
    width: int = 1280,
    height: int = 720,
) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    total_frames = duration_sec * fps
    horizon_y = int(height * 0.40)

    print(f"Generating {duration_sec}s ({total_frames} frames) synthetic dashcam footage to '{output_path}'...")

    for frame_idx in range(total_frames):
        # 1. Sky & Background (Upper 40%)
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        # Sky gradient (light blue to cyan)
        for y in range(horizon_y):
            ratio = y / horizon_y
            b = int(220 - ratio * 40)
            g = int(180 - ratio * 30)
            r = int(135 - ratio * 20)
            frame[y, :] = (b, g, r)

        # Distant tree line / buildings above horizon
        cv2.rectangle(frame, (0, horizon_y - 30), (width, horizon_y), (40, 90, 40), -1)

        # 2. Road Surface (Lower 60%)
        # Dark asphalt texture with subtle gradient
        for y in range(horizon_y, height):
            depth_ratio = (y - horizon_y) / (height - horizon_y)
            gray = int(50 + depth_ratio * 30)
            frame[y, :] = (gray, gray, gray)

        # Perspective road boundaries (curbs)
        vp_x = width // 2
        vp_y = horizon_y
        left_bottom = (int(width * 0.10), height)
        right_bottom = (int(width * 0.90), height)

        cv2.line(frame, (vp_x - 40, vp_y), left_bottom, (80, 80, 80), 3)
        cv2.line(frame, (vp_x + 40, vp_y), right_bottom, (80, 80, 80), 3)

        # 3. Moving Lane Dashes (simulating forward motion at ~40 km/h)
        speed_offset = (frame_idx * 15) % 120
        for dash_y in range(horizon_y + 10 + speed_offset, height, 120):
            # Scale dash width by perspective depth
            t = (dash_y - horizon_y) / (height - horizon_y)
            dash_w = int(4 + t * 14)
            dash_h = int(12 + t * 30)
            center_x = vp_x
            cv2.rectangle(
                frame,
                (center_x - dash_w // 2, dash_y),
                (center_x + dash_w // 2, min(height - 1, dash_y + dash_h)),
                (255, 255, 255),
                -1,
            )

        # 4. Simulated Road Pothole (Appears periodically between seconds 2-5 and 6-9)
        cycle_frame = frame_idx % (fps * 4)
        if fps * 1 < cycle_frame < fps * 3.5:
            # Animate pothole rolling toward the bus
            progress = (cycle_frame - fps * 1) / (fps * 2.5)
            py = int(horizon_y + 60 + progress * (height - horizon_y - 120))
            px = int(vp_x + 120 + progress * 80)
            p_radius_x = int(15 + progress * 40)
            p_radius_y = int(8 + progress * 20)

            # Draw dark crater ellipse with jagged inner depth
            cv2.ellipse(frame, (px, py), (p_radius_x, p_radius_y), 0, 0, 360, (20, 20, 20), -1)
            cv2.ellipse(frame, (px - 2, py - 1), (p_radius_x - 4, p_radius_y - 3), 0, 0, 360, (10, 10, 10), -1)
            cv2.ellipse(frame, (px, py), (p_radius_x, p_radius_y), 0, 0, 360, (60, 60, 60), 2)

        # 5. Telemetry Stamp
        cv2.putText(
            frame,
            f"SIMULATED BUS DASHCAM | FLINT TEST STREAM | Frame {frame_idx:04d}",
            (30, height - 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (200, 200, 200),
            1,
            cv2.LINE_AA,
        )

        out.write(frame)

    out.release()
    print(f"Test video created successfully: {output_path} ({os.path.getsize(output_path) / 1024:.1f} KB)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic road video for FLINT Edge testing")
    parser.add_argument("--output", default="edge/sample_drive.mp4", help="Output MP4 file path")
    parser.add_argument("--duration", type=int, default=10, help="Duration in seconds")
    parser.add_argument("--fps", type=int, default=30, help="Frames per second")
    args = parser.parse_args()

    generate_test_video(output_path=args.output, duration_sec=args.duration, fps=args.fps)
