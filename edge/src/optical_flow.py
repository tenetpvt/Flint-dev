"""
FLINT Dual-Frame Epipolar & Optical Flow Motion Verifier (Improvement 2)
Distinguishes standing water puddles and wet slush from dry shiny asphalt
by checking optical flow consistency across frames sampled ~0.5s apart.
"""

import cv2
import logging
from typing import Tuple, Optional, List
import numpy as np

logger = logging.getLogger("flint.edge.optical_flow")

class OpticalFlowVerifier:
    """
    Evaluates optical flow motion variance across a temporal window (~0.5s).
    Rigid asphalt conforms to camera planar homography motion (low variance),
    whereas standing water exhibits dynamic specular sunlight glints and surface ripples (high variance).
    """

    def __init__(
        self,
        frame_delta_sec: float = 0.50,
        variance_threshold: float = 14.0,
    ):
        self.frame_delta_sec = frame_delta_sec
        self.variance_threshold = variance_threshold
        self.frame_buffer: List[Tuple[float, np.ndarray]] = []

    def push_frame(self, timestamp: float, frame: np.ndarray) -> None:
        """Push a frame into the temporal history buffer."""
        # Store scaled-down grayscale frame to keep computation fast
        h, w = frame.shape[:2]
        small_gray = cv2.cvtColor(cv2.resize(frame, (w // 2, h // 2)), cv2.COLOR_BGR2GRAY)
        self.frame_buffer.append((timestamp, small_gray))

        # Keep at most 2 seconds of history
        cutoff = timestamp - 2.0
        self.frame_buffer = [f for f in self.frame_buffer if f[0] >= cutoff]

    def get_reference_frame(self, current_timestamp: float) -> Optional[np.ndarray]:
        """Find the historical frame closest to (current_timestamp - frame_delta_sec)."""
        target_time = current_timestamp - self.frame_delta_sec
        if not self.frame_buffer:
            return None

        # Find frame closest to target_time
        best_diff = float("inf")
        best_frame = None

        for ts, frame in self.frame_buffer:
            diff = abs(ts - target_time)
            if diff < best_diff:
                best_diff = diff
                best_frame = frame

        # Only accept if within 0.25s of the desired delta
        if best_diff <= 0.25:
            return best_frame
        return None

    def verify_surface(
        self,
        curr_frame: np.ndarray,
        current_timestamp: float,
        bbox: List[int],
    ) -> Tuple[bool, float]:
        """
        Evaluates optical flow variance over a candidate bounding box ROI.
        Returns:
            (is_specular_water, flow_variance):
            - is_specular_water = True if flow variance exceeds threshold (water glint/ripple detected).
            - is_specular_water = False if rigid planar motion conforms (dry asphalt/rigid hole).
        """
        ref_frame = self.get_reference_frame(current_timestamp)
        if ref_frame is None:
            # Not enough temporal history yet
            return False, 0.0

        h_full, w_full = curr_frame.shape[:2]
        scale_x = ref_frame.shape[1] / w_full
        scale_y = ref_frame.shape[0] / h_full

        x1, y1, x2, y2 = bbox
        rx1, ry1 = int(x1 * scale_x), int(y1 * scale_y)
        rx2, ry2 = int(x2 * scale_x), int(y2 * scale_y)

        # Ensure ROI has valid minimum area
        if rx2 - rx1 < 8 or ry2 - ry1 < 8:
            return False, 0.0

        curr_gray = cv2.cvtColor(
            cv2.resize(curr_frame, (ref_frame.shape[1], ref_frame.shape[0])),
            cv2.COLOR_BGR2GRAY,
        )

        roi_prev = ref_frame[ry1:ry2, rx1:rx2]
        roi_curr = curr_gray[ry1:ry2, rx1:rx2]

        try:
            # Fast Gunnar Farneback optical flow on the ROI
            flow = cv2.calcOpticalFlowFarneback(
                roi_prev,
                roi_curr,
                None,
                pyr_scale=0.5,
                levels=2,
                winsize=11,
                iterations=2,
                poly_n=5,
                poly_sigma=1.1,
                flags=0,
            )

            # Compute flow magnitude vector field
            magnitude = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)

            # Variance of the flow field within the candidate ROI
            flow_variance = float(np.var(magnitude))

            is_water = flow_variance >= self.variance_threshold

            if is_water:
                logger.debug(
                    f"Specular water glint detected on ROI {bbox}: variance={flow_variance:.2f} "
                    f"(Threshold: {self.variance_threshold})"
                )

            return is_water, round(flow_variance, 2)

        except Exception as e:
            logger.debug(f"Optical flow calculation error: {e}")
            return False, 0.0
