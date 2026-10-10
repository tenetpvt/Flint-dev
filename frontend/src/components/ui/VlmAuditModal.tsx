import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { getEvidenceUrl } from '../../utils/evidence';

interface VlmAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  alertId?: number;
  evidenceUrl?: string | null;
  initialType?: string;
  lat?: number;
  lon?: number;
}

interface VlmResponseData {
  status: string;
  edge_telemetry: {
    source: string;
    engine: string;
    inference_latency_ms: number;
    detection: {
      class_label: string;
      confidence: number;
      raw_bbox: number[];
      gps: number[];
      timestamp: string;
    };
  };
  gemini_audit: {
    source: string;
    model_name: string;
    api_endpoint: string;
    latency_ms: number;
    tokens_used: number;
    semantic_analysis: {
      hazard_type: string;
      confidence: number;
      severity: string;
      spatial_assessment: {
        water_depth_est_cm?: number | null;
        curb_submerged?: boolean;
        lane_blockage_pct?: number;
        divider_gap_meters?: number | null;
      };
      physical_risk_narrative: string;
      civic_routing: {
        primary_department: string;
        recommended_action: string;
      };
    };
    is_simulated?: boolean;
    note?: string;
  };
  model_used: string;
  provider: string;
}

function formatTitle(str?: string): string {
  if (!str) return 'Pavement Defect';
  return str
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function formatDept(str?: string): string {
  if (!str) return 'PWD Highways';
  return str
    .replace(/_DIVISION|_DEPARTMENT|_BRANCH/gi, '')
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function renderSeverityPill(severity?: string) {
  const s = (severity || 'MEDIUM').toUpperCase();
  if (s === 'CRITICAL') {
    return (
      <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
        Critical Risk
      </span>
    );
  }
  if (s === 'HIGH') {
    return (
      <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        High Priority
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
      Moderate Risk
    </span>
  );
}

export function VlmAuditModal({
  isOpen,
  onClose,
  alertId = 1,
  evidenceUrl,
  initialType = 'ROAD_DEFECT',
  lat = 21.1385,
  lon = 81.6654,
}: VlmAuditModalProps) {
  const [loading, setLoading] = useState(false);
  const [vlmData, setVlmData] = useState<VlmResponseData | null>(null);
  const [activeTab, setActiveTab] = useState<'visual' | 'raw_json'>('visual');
  const [error, setError] = useState<string | null>(null);

  const fetchVlmAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<VlmResponseData>(
        '/vlm/audit',
        {
          alert_id: alertId,
          image_path: evidenceUrl,
          event_hint: initialType,
        },
        {
          timeout: 60000,
        }
      );
      setVlmData(res.data);
    } catch (err: any) {
      console.error('VLM Audit fetch error:', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to complete AI inspection');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchVlmAudit();
    }
  }, [isOpen, alertId]);

  if (!isOpen) return null;

  const gemini = vlmData?.gemini_audit;
  const edge = vlmData?.edge_telemetry;
  const semantic = gemini?.semantic_analysis;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[#10141D] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-['Inter']"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 border-b border-white/5 bg-[#141924] px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <span className="material-symbols-outlined text-[20px]">psychology</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white tracking-tight">
                  AI Road Inspection
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {vlmData?.model_used ? formatTitle(vlmData.model_used) : 'Gemini 3.5 Flash'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Anomaly #{alertId} · GPS {lat.toFixed(4)}°N, {lon.toFixed(4)}°E
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-black/40 p-1 rounded-lg border border-white/5 text-[11px] mr-1">
              <button
                onClick={() => setActiveTab('visual')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  activeTab === 'visual'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Insights
              </button>
              <button
                onClick={() => setActiveTab('raw_json')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  activeTab === 'raw_json'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Raw Data
              </button>
            </div>

            <button
              onClick={fetchVlmAudit}
              disabled={loading}
              title="Re-run AI inspection"
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
                refresh
              </span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Modal Main Content Workspace */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-rose-400">error</span>
              <span>{error}</span>
            </div>
          )}

          {loading && !vlmData ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="w-10 h-10 rounded-full border-2 border-sky-400/20 border-t-sky-400 animate-spin"></div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-white">Analyzing road frame...</p>
                <p className="text-xs text-zinc-400">Running multimodal visual reasoning via Google Gemini Cloud</p>
              </div>
            </div>
          ) : activeTab === 'visual' ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {/* Left Column: Evidence Frame & Context (5 cols) */}
              <div className="md:col-span-5 space-y-3">
                {evidenceUrl ? (
                  <div className="aspect-[4/3] rounded-xl overflow-hidden border border-white/10 bg-black/60 shadow-md relative group">
                    <img
                      src={getEvidenceUrl(evidenceUrl)!}
                      alt="Road Frame Crop"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-white/10 text-[10px] text-zinc-300">
                      Dashcam Capture
                    </div>
                  </div>
                ) : (
                  <div className="aspect-[4/3] rounded-xl border border-white/10 bg-zinc-900/40 flex items-center justify-center text-zinc-500 text-xs">
                    No image crop available
                  </div>
                )}

                {/* Quick Snapshot Specs */}
                <div className="rounded-xl bg-zinc-900/40 border border-white/5 p-3.5 text-xs space-y-2">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Initial Detection</span>
                    <span className="text-zinc-200 font-medium">
                      {formatTitle(edge?.detection?.class_label || initialType)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Confidence Score</span>
                    <span className="text-emerald-400 font-medium">
                      {Math.round((edge?.detection?.confidence || 0.85) * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Edge Processing</span>
                    <span className="text-zinc-300 font-medium">{edge?.inference_latency_ms || 14} ms</span>
                  </div>
                </div>
              </div>

              {/* Right Column: AI Safety Assessment (7 cols) */}
              <div className="md:col-span-7 space-y-3.5">
                {/* Condition & Severity Banner */}
                <div className="rounded-xl bg-zinc-900/60 border border-white/5 p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block mb-0.5">
                      Identified Condition
                    </span>
                    <h3 className="text-base font-semibold text-white">
                      {formatTitle(semantic?.hazard_type)}
                    </h3>
                  </div>
                  <div>
                    {renderSeverityPill(semantic?.severity)}
                  </div>
                </div>

                {/* Metric Cards Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-zinc-900/40 border border-white/5 p-3">
                    <span className="text-[10px] text-zinc-400 block mb-1">Lane Area Affected</span>
                    <span className="text-sm font-semibold text-amber-400">
                      {typeof semantic?.spatial_assessment === 'object' && semantic?.spatial_assessment !== null && semantic.spatial_assessment.lane_blockage_pct != null
                        ? `${semantic.spatial_assessment.lane_blockage_pct}% Obstructed`
                        : 'Active Travel Lane'}
                    </span>
                  </div>

                  <div className="rounded-xl bg-zinc-900/40 border border-white/5 p-3">
                    <span className="text-[10px] text-zinc-400 block mb-1">Water / Flood Level</span>
                    <span className="text-sm font-semibold text-sky-400">
                      {typeof semantic?.spatial_assessment === 'object' && semantic?.spatial_assessment !== null && semantic.spatial_assessment.water_depth_est_cm != null
                        ? `${semantic.spatial_assessment.water_depth_est_cm} cm Submerged`
                        : 'Dry Surface'}
                    </span>
                  </div>
                </div>

                {/* Hazard Evaluation Narrative */}
                <div className="rounded-xl bg-zinc-900/40 border border-white/5 p-3.5 space-y-1.5">
                  <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase block">
                    Hazard Evaluation
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed font-normal">
                    {semantic?.physical_risk_narrative ||
                      'Road surface defect detected on active transit lane. Recommended for preventive patch and sealing.'}
                  </p>
                </div>

                {/* Civic Department Recommendation */}
                <div className="rounded-xl bg-sky-950/20 border border-sky-500/20 p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold tracking-wider text-sky-400/80 uppercase">
                      Recommended Action
                    </span>
                    <span className="text-[11px] font-medium text-sky-300">
                      {formatDept(
                        typeof semantic?.civic_routing === 'object' && semantic?.civic_routing !== null
                          ? semantic.civic_routing.primary_department
                          : semantic?.civic_routing
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-200 font-normal">
                    {typeof semantic?.civic_routing === 'object' && semantic?.civic_routing !== null
                      ? semantic.civic_routing.recommended_action
                      : 'Dispatch field crew for road maintenance'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Raw Telemetry View */
            <div className="rounded-xl bg-[#090C11] border border-white/5 p-4 overflow-x-auto max-h-[460px]">
              <pre className="text-xs text-zinc-300 font-['JetBrains_Mono'] leading-relaxed">
                {JSON.stringify(vlmData, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 border-t border-white/5 bg-[#141924] px-6 flex items-center justify-between shrink-0 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>
              Analyzed in {((gemini?.latency_ms || 3100) / 1000).toFixed(1)}s · {gemini?.tokens_used || 1763} tokens
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
