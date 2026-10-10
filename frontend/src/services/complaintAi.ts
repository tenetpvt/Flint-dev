import api from './api';

export interface ComplaintAiDraft {
  subject: string;
  legal_statutory_reference: string;
  formal_complaint_body: string;
  prescribed_civil_action: string;
  recommended_portal: 'PWD_CHHATTISGARH' | 'RMC_311' | 'NHAI' | 'TRAFFIC_POLICE';
  recommended_sla_hours: number;
  urgency_classification: string;
  model_used?: string;
  ai_generated?: boolean;
}

const STORAGE_GEMINI_KEY = 'flint_custom_gemini_key';

export function getStoredGeminiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_GEMINI_KEY) || '';
}

export function setStoredGeminiKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (!key.trim()) {
    localStorage.removeItem(STORAGE_GEMINI_KEY);
  } else {
    localStorage.setItem(STORAGE_GEMINI_KEY, key.trim());
  }
}

export async function requestAiComplaintDraft(params: {
  defect_type: string;
  severity: string;
  confidence: number;
  corridor: string;
  street_name: string;
  lat: number;
  lon: number;
  bus_id?: string;
  target_portal?: string;
}): Promise<ComplaintAiDraft> {
  const customKey = getStoredGeminiKey();

  try {
    // 1. Try Central Backend endpoint
    const response = await api.post<{ status: string; draft: ComplaintAiDraft }>(
      '/complaints/draft-ai',
      {
        ...params,
        custom_api_key: customKey || undefined,
      },
      { timeout: 30000 }
    );

    if (response.data && response.data.draft) {
      return response.data.draft;
    }
  } catch (backendErr) {
    console.warn('[FLINT] Backend draft-ai failed, attempting direct Gemini client fallback...', backendErr);
  }

  // 2. Direct client-side Gemini fallback if backend unreachable (e.g. standalone Vercel)
  const activeKey = customKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (activeKey) {
    try {
      const draft = await directGeminiDraft(params, activeKey);
      return draft;
    } catch (directErr) {
      console.error('[FLINT] Direct Gemini call failed:', directErr);
    }
  }

  // 3. Heuristic offline municipal generator fallback
  return getOfflineDraftFallback(params);
}

async function directGeminiDraft(
  params: {
    defect_type: string;
    severity: string;
    confidence: number;
    corridor: string;
    street_name: string;
    lat: number;
    lon: number;
    bus_id?: string;
    target_portal?: string;
  },
  apiKey: string
): Promise<ComplaintAiDraft> {
  const prompt = `
You are FLINT Urban Intelligence AI for Indian Municipalities and State PWD.
Draft an official municipal complaint dossier for this detected road hazard:
- Defect: ${params.defect_type.toUpperCase()}
- Severity: ${params.severity.toUpperCase()}
- Confidence: ${(params.confidence * 100).toFixed(1)}%
- Corridor: ${params.corridor}
- Street / Km Marker: ${params.street_name}
- Coordinates: ${params.lat.toFixed(5)}, ${params.lon.toFixed(5)}
- Survey Unit: ${params.bus_id || 'BUS-01'}

Respond strictly with valid JSON (no markdown):
{
  "subject": "Formal municipal notice subject line",
  "legal_statutory_reference": "IRC:SP:84-2019, Section 133 CrPC or Chhattisgarh Municipal Act citation",
  "formal_complaint_body": "Detailed administrative statement of hazard, physical morphology, and commuter safety risk",
  "prescribed_civil_action": "Exact engineering directive (tack coat, cold-mix asphalt patch, vibratory compaction)",
  "recommended_portal": "PWD_CHHATTISGARH",
  "recommended_sla_hours": 24,
  "urgency_classification": "LEVEL 1 (EMERGENCY REPAIR)"
}
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
    }),
  });

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(clean);
  parsed.model_used = 'gemini-3.5-flash-lite (Direct)';
  parsed.ai_generated = true;
  return parsed;
}

function getOfflineDraftFallback(params: {
  defect_type: string;
  severity: string;
  confidence: number;
  corridor: string;
  street_name: string;
  lat: number;
  lon: number;
}): ComplaintAiDraft {
  const isCrit = params.severity.toUpperCase() === 'CRITICAL';
  return {
    subject: `STATUTORY REPAIR DIRECTIVE: Structural ${params.defect_type.toUpperCase()} on ${params.corridor}`,
    legal_statutory_reference:
      'IRC:SP:84-2019 Highway Maintenance Standards & Section 133 CrPC Public Nuisance Prevention Directive',
    formal_complaint_body: `An acute surface defect (${params.defect_type.toLowerCase()}) of ${params.severity.toLowerCase()} severity was identified at coordinates ${params.lat.toFixed(
      5
    )}, ${params.lon.toFixed(
      5
    )} along ${params.corridor} (${params.street_name}). Sub-base displacement and structural crumbling present an imminent hazard to commuters and two-wheeler operators under heavy transit loads.`,
    prescribed_civil_action:
      'Excavation of compromised pavement matrix, application of cationic bituminous tack coat, laying of dense cold-mix asphalt, followed by mechanical compaction with vibratory steel roller to eliminate water pooling.',
    recommended_portal:
      params.corridor.includes('Highway') || params.corridor.includes('NH') ? 'PWD_CHHATTISGARH' : 'RMC_311',
    recommended_sla_hours: isCrit ? 24 : 48,
    urgency_classification: isCrit ? 'LEVEL 1 (EMERGENCY REPAIR)' : 'LEVEL 2 (SCHEDULED INTERVENTION)',
    model_used: 'flint_municipal_rules_engine',
    ai_generated: false,
  };
}
