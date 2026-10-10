"""
FLINT Edge Video Ingestion Engine
Handles RTSP streams, local video files, and camera devices with frame rate sampling.
"""

import cv2
import time
import logging
from typing import Generator, Tuple, Optional
import numpy as np

logger = logging.getLogger("flint.edge.camera")

class CameraStream:
    """
    Robust video ingestion stream supporting video files, RTSP streams, and USB cameras.
    Features frame sampling to conserve edge compute and thermals.
    """

    def __init__(
        self,
        source: str,
        sample_fps: int = 10,
        loop: bool = True,
        width: Optional[int] = None,
        height: Optional[int] = None,
        realtime: bool = True,
    ):
        self.source = source
        self.sample_fps = sample_fps
        self.loop = loop
        self.target_width = width
        self.target_height = height
        self.realtime = realtime
        
        self.cap: Optional[cv2.VideoCapture] = None
        self.raw_fps: float = 30.0
        self.total_frames: int = 0
        self.skip_factor: int = 1
        
        self._init_capture()

    def _init_capture(self) -> None:
        """Initialize or re-initialize OpenCV VideoCapture."""
        if self.cap is not None:
            self.cap.release()

        # Handle numeric string for webcam index
        src = int(self.source) if str(self.source).isdigit() else self.source
        logger.info(f"Connecting to video source: {self.source}")
        
        self.cap = cv2.VideoCapture(src)
        if not self.cap.isOpened():
            logger.error(f"Failed to open video source: {self.source}")
            return

        self.raw_fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        
        # Calculate skip factor to match sample_fps
        if self.sample_fps > 0 and self.raw_fps > self.sample_fps:
            self.skip_factor = max(1, round(self.raw_fps / self.sample_fps))
        else:
            self.skip_factor = 1

        actual_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        logger.info(
            f"Stream opened: {actual_w}x{actual_h} @ {self.raw_fps:.1f} FPS "
            f"(Sampling 1-in-{self.skip_factor} frames -> ~{self.raw_fps / self.skip_factor:.1f} FPS)"
        )

    def frames(self) -> Generator[Tuple[int, float, np.ndarray], None, None]:
        """
        Generator yielding (sampled_frame_idx, timestamp_seconds, bgr_frame).
        Gracefully handles video loops for continuous demo pipelines.
        """
        if self.cap is None or not self.cap.isOpened():
            self._init_capture()
            if not self.cap or not self.cap.isOpened():
                raise RuntimeError(f"Cannot read from source {self.source}")

        raw_frame_idx = 0
        sampled_frame_idx = 0
        start_time = time.time()
        wall_sync_start = time.time()

        while True:
            ret, frame = self.cap.read()

            if not ret:
                if self.loop and self.total_frames > 0:
                    logger.info("Video end reached. Looping back to frame 0...")
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    raw_frame_idx = 0
                    wall_sync_start = time.time()
                    continue
                else:
                    logger.info("Video stream ended.")
                    break

            raw_frame_idx += 1

            # Skip frames to enforce sample_fps
            if raw_frame_idx % self.skip_factor != 0:
                continue

            sampled_frame_idx += 1
            timestamp = (raw_frame_idx / self.raw_fps) if self.raw_fps > 0 else (time.time() - start_time)

            # Real-time 1.0x playback speed regulator:
            # Sleep if processing is faster than video playback wall-clock time
            if self.realtime and self.total_frames > 0:
                elapsed_wall = time.time() - wall_sync_start
                sleep_needed = timestamp - elapsed_wall
                if sleep_needed > 0.005:
                    time.sleep(min(sleep_needed, 0.5))

            if self.target_width and self.target_height:
                if frame.shape[1] != self.target_width or frame.shape[0] != self.target_height:
                    frame = cv2.resize(frame, (self.target_width, self.target_height))

            yield sampled_frame_idx, timestamp, frame

    def release(self) -> None:
        """Release video capture device."""
        if self.cap and self.cap.isOpened():
            self.cap.release()
            logger.info("Camera capture released.")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
