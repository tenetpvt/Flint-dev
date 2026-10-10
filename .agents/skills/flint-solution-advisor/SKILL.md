---
name: flint-solution-advisor
description: >-
  Architectural guide and review protocol for the FLINT / Urban Sense urban sensing platform.
  Use when the user asks to review architecture, evaluate AI model feasibility, assess municipal triage formulas,
  audit hackathon alignment, or when the user specifies "DONT CODE JUST CHAT".
---

# FLINT Solution Advisor & Review Protocol

This skill guides conceptual evaluations, architectural consultations, and documentation updates for the FLINT (Smart India Hackathon / BEL Hackathon) platform.

## Core Architectural Doctrines

1. **"AI Detects, Human Authority Decides":**
   * The AI never directly submits official government work-orders without human-in-the-loop review on the dashboard.
   * Every municipal grievance draft contains GPS, photo crop, and confidence scores for operator sign-off.

2. **Two-Tier Detection Strategy:**
   * **Tier 1 (Edge Specialist):** Fast, lightweight models (YOLOv8n + ByteTrack) running continuously onboard the bus with zero cloud API costs.
   * **Tier 2 (Private VLM Verification):** Complex semantic hazards (waterlogging, missing median dividers) are selectively triggered via KDTree geofencing or dual-frame optical flow and audited asynchronously on a private on-premise GPU running **Ollama + Qwen3-VL**.

3. **Four Core Accuracy Improvements:**
   * **Improvement 1:** Two-Tier Edge + Private VLM Hybrid.
   * **Improvement 2:** Dual-Frame Epipolar / Motion Verification for Water (0.5s delta optical flow variance $\sigma_{\text{specular}}^2$ prevents dry shiny asphalt false triggers).
   * **Improvement 3:** Severity-Weighted Priority Scoring:
     $$\text{Priority} = (\text{Severity Score}) \times (\text{Traffic Density}) \times (\text{Unique Bus Confirmations})$$
   * **Improvement 4:** Bumper Vibration / Accelerometer Fusion (YOLO detection correlated with vertical $Z$-axis G-force spike $\Delta t \approx 0.3\text{s}$ later provides 100% physical pothole ground-truth).

## Protocol for "DONT CODE JUST CHAT"

When the user requests **"DONT CODE JUST CHAT"** or asks for architectural critique:
1. **Zero Code Changes:** Do NOT edit, generate, or delete source code files (`.py`, `.ts`, `.tsx`, `.js`).
2. **Documentation Only:** If the user requests adding or documenting improvements, update only markdown artifacts:
   * `flow.md` (End-to-end data flow and stage descriptions)
   * `models.md` (Model architectures, mathematical equations, and benchmarks)
   * `datasets.md` (Dataset hygiene, perspective engineering, and class consolidation)
   * `README.md` (High-level architecture summaries)
3. **Structured Constructive Feedback:**
   * Rate the solution on technical feasibility (1–10).
   * Contrast against commercial alternatives (e.g. ₹1–2 Cr survey vans vs. zero-fleet-cost transit sensing).
   * Identify edge failure modes (camera elevation, vibration, night lighting) and provide mathematical or engineering mitigations.
