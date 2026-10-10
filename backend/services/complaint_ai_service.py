import os
import json
import logging
from typing import Dict, Any, Optional
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("flint.complaint_ai")

DEFAULT_MODEL = "gemini-3.5-flash"
FALLBACK_MODEL = "gemini-3.5-flash-lite"

DRAFT_SYSTEM_PROMPT = """
You are FLINT Urban Intelligence AI, an expert civil infrastructure administrative drafting system for Indian Municipalities and State Public Works Departments (PWD).
Your task is to draft an official, formal, authoritative municipal grievance and civil engineering repair directive for an anomalous road condition identified by on-board transit camera computer vision.

The tone should be administrative, formal, legally grounded, and actionable by Municipal Ward Engineers and PWD Executive Engineers.

You MUST respond strictly with valid, parseable JSON conforming to this schema (do NOT include markdown formatting or conversational text):
{
  "subject": "Formal municipal notice subject line specifying corridor, landmark, and hazard type",
  "legal_statutory_reference": "Citation of relevant standard or municipal act (e.g. Indian Roads Congress IRC:SP:84-2019, Section 133 CrPC, or Chhattisgarh Municipal Corporation Act 1956)",
  "formal_complaint_body": "Comprehensive administrative statement of condition: observed defect morphology, road safety risk for commuters/two-wheelers, and hazard classification",
  "prescribed_civil_action": "Precise engineering directive for repair (e.g. tack coat application, cold-mix asphalt patch, compaction with vibratory steel roller, drainage grade adjustment)",
  "recommended_portal": "PWD_CHHATTISGARH" | "RMC_311" | "NHAI" | "TRAFFIC_POLICE",
  "recommended_sla_hours": 24 or 48 or 72,
  "urgency_classification": "LEVEL 1 (EMERGENCY REPAIR)" | "LEVEL 2 (SCHEDULED INTERVENTION)" | "LEVEL 3 (ROUTINE BATCH)"
}
"""

async def draft_complaint_with_gemini(
    defect_type: str,
    severity: str,
    confidence: float,
    corridor: str,
    street_name: str,
    lat: float,
    lon: float,
    bus_id: str = "BUS-01",
    target_portal: str = "PWD_CHHATTISGARH",
    custom_api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Invokes Google Gemini to draft a formal municipal complaint notice.
    """
    api_key = (custom_api_key or os.getenv("GEMINI_API_KEY", "")).strip()
    if not api_key:
        logger.warning("No Gemini API key available. Generating structured heuristic draft.")
        return _generate_offline_heuristic_draft(defect_type, severity, confidence, corridor, street_name, lat, lon)

    user_prompt = f"""
Draft an official municipal complaint dossier for this detected road anomaly:
- Defect Type: {defect_type.upper()}
- Severity: {severity.upper()}
- Vision Model Confidence: {round(confidence * 100, 1)}%
- Corridor Name: {corridor}
- Street / Km Marker: {street_name}
- Coordinates: Latitude {lat:.6f}, Longitude {lon:.6f}
- Detection Platform: {bus_id} Mobile Edge Vision Node
- Proposed Agency: {target_portal}
"""

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"{DRAFT_SYSTEM_PROMPT}\n\n{user_prompt}"}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 1000
        }
    }

    models_to_try = [DEFAULT_MODEL, FALLBACK_MODEL]
    
    async with httpx.AsyncClient(timeout=25.0) as client:
        for model in models_to_try:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            try:
                response = await client.post(endpoint, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            raw_text = parts[0]["text"].strip()
                            clean_text = raw_text.replace("```json", "").replace("```", "").strip()
                            try:
                                parsed = json.loads(clean_text)
                                parsed["model_used"] = model
                                parsed["ai_generated"] = True
                                return parsed
                            except json.JSONDecodeError:
                                logger.error(f"Failed to parse Gemini response as JSON: {clean_text[:200]}")
                else:
                    logger.warning(f"Gemini API returned {response.status_code} for {model}: {response.text[:200]}")
            except Exception as e:
                logger.error(f"Gemini call error on {model}: {e}")

    return _generate_offline_heuristic_draft(defect_type, severity, confidence, corridor, street_name, lat, lon)


def _generate_offline_heuristic_draft(
    defect_type: str,
    severity: str,
    confidence: float,
    corridor: str,
    street_name: str,
    lat: float,
    lon: float
) -> Dict[str, Any]:
    """Fallback generator when Gemini API is unreachable."""
    is_crit = severity.upper() in ["CRITICAL", "HIGH"]
    return {
        "subject": f"URGENT STATUTORY NOTICE: Structural {defect_type.upper()} on {corridor} ({street_name})",
        "legal_statutory_reference": "IRC:SP:84-2019 Highway Maintenance Norms & Section 133 CrPC Public Nuisance Prevention",
        "formal_complaint_body": (
            f"An anomalous {defect_type.lower()} of {severity.lower()} severity was verified on {corridor} "
            f"at coordinates {lat:.5f}, {lon:.5f}. The surface structural compromise presents an immediate hazard "
            f"to two-wheelers and high-speed corridor transit. Timely rectification is mandated under standard municipal SLA."
        ),
        "prescribed_civil_action": "Square mechanical milling of defect perimeter, application of cationic bituminous emulsion tack coat, cold-mix asphalt infill, and compaction using vibratory steel roller.",
        "recommended_portal": "PWD_CHHATTISGARH" if "Highway" in corridor or "NH" in corridor else "RMC_311",
        "recommended_sla_hours": 24 if is_crit else 48,
        "urgency_classification": "LEVEL 1 (EMERGENCY REPAIR)" if is_crit else "LEVEL 2 (SCHEDULED INTERVENTION)",
        "model_used": "flint_municipal_rules_engine",
        "ai_generated": False
    }
