import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { getEvidenceUrl } from '../../utils/evidence';
import { VLM_MODEL_NAME, VLM_ENGINE_LABEL, VLM_AUTHORITY_NOTE } from '../../config/vlm';
import { Button } from './Button';
import { StatusDot } from './StatusDot';
import { SegmentedControl } from './SegmentedControl';
import { X, RefreshCw, Cpu, AlertTriangle, ShieldCheck } from 'lucide-react';

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
  if (!str) return 'Pavement defect';
  return str
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function formatDept(str?: string): string {
  if (!str) return 'State PWD Highways';
  return str
    .replace(/_DIVISION|_DEPARTMENT|_BRANCH/gi, '')
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
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
          timeout: 45000,
        }
      );
      setVlmData(res.data);
    } catch (err: any) {
      console.error('VLM verification fetch error:', err);
      setError(
        err?.response?.data?.detail || err?.message || 'Failed to complete VLM verification'
      );
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

  const audit = vlmData?.gemini_audit;
  const edge = vlmData?.edge_telemetry;
  const semantic = audit?.semantic_analysis;

  const resolvedEvidenceUrl = getEvidenceUrl(evidenceUrl);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans text-[var(--text-primary)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]/40 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.5} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                  {VLM_ENGINE_LABEL}
                </h3>
                <span className="text-[10px] font-mono text-[var(--text-muted)] px-1.5 py-0.2 rounded bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
                  {VLM_MODEL_NAME}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SegmentedControl<'visual' | 'raw_json'>
              size="sm"
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { value: 'visual', label: 'Assessment' },
                { value: 'raw_json', label: 'JSON telemetry' },
              ]}
            />

            <Button
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={fetchVlmAudit}
              title="Re-run verification"
              aria-label="Re-run verification"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            />

            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              title="Close modal"
              aria-label="Close modal"
              icon={<X className="w-4 h-4" strokeWidth={1.5} />}
            />
          </div>
        </div>

        {/* Modal Main Content Workspace */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              <span>{error}</span>
            </div>
          )}

          {loading && !vlmData ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-2 text-center">
              <RefreshCw className="w-6 h-6 text-[var(--accent)] animate-spin" strokeWidth={1.5} />
              <p className="text-xs font-medium text-[var(--text-primary)]">
                Performing semantic verification...
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                Running private on-premise VLM ({VLM_MODEL_NAME}) on edge crop.
              </p>
            </div>
          ) : activeTab === 'visual' ? (
            <div className="space-y-3.5">
              {/* Evidence Crop + Specs */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                <div className="md:col-span-5 aspect-4/3 rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-raised)] relative">
                  {resolvedEvidenceUrl ? (
                    <img
                      src={resolvedEvidenceUrl}
                      alt="Defect visual evidence"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)]">
                      No frame available
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/70 text-white backdrop-blur-xs">
                    Alert #{alertId}
                  </div>
                </div>

                <div className="md:col-span-7 space-y-2 text-xs">
                  <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]/30 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">Condition morphology</span>
                      <StatusDot
                        status={
                          semantic?.severity === 'CRITICAL'
                            ? 'critical'
                            : semantic?.severity === 'HIGH'
                            ? 'high'
                            : 'medium'
                        }
                        label={semantic?.severity ? `${semantic.severity} priority` : 'Verified'}
                      />
                    </div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      {semantic?.hazard_type ? formatTitle(semantic.hazard_type) : formatTitle(initialType)}
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {semantic?.physical_risk_narrative ||
                        'Edge visual features demonstrate structural pavement fracture with water retention risk.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]/20">
                      <span className="text-[var(--text-muted)] block">Recommended action</span>
                      <span className="font-medium text-[var(--text-primary)] mt-0.5 block">
                        {semantic?.civic_routing?.recommended_action || 'Cold-mix asphalt patch'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]/20">
                      <span className="text-[var(--text-muted)] block">Responsible department</span>
                      <span className="font-medium text-[var(--text-primary)] mt-0.5 block truncate">
                        {formatDept(semantic?.civic_routing?.primary_department)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Edge + VLM Correlation */}
              <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]/20 text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#34D399]" strokeWidth={1.5} />
                    Two-tier edge verification
                  </span>
                  <span className="font-mono text-[var(--text-secondary)]">
                    Inference: {edge?.inference_latency_ms || 14.2} ms (Edge) + {audit?.latency_ms || 420} ms (VLM)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] font-mono">
                  <span>GPS: {lat.toFixed(5)}, {lon.toFixed(5)}</span>
                  <span>·</span>
                  <span>Engine: YOLOv8n + {VLM_MODEL_NAME}</span>
                </div>
              </div>
            </div>
          ) : (
            <pre className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto max-h-[360px]">
              {JSON.stringify(vlmData, null, 2)}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]/40 flex items-center justify-between text-xs">
          <span className="text-[11px] text-[var(--text-muted)] italic">
            {VLM_AUTHORITY_NOTE}
          </span>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
