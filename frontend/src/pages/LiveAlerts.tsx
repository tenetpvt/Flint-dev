import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchAlerts, updateAlertStatus } from '../services/alerts';
import type { Alert } from '../services/alerts';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { VlmAuditModal } from '../components/ui/VlmAuditModal';
import { useLiveStream } from '../services/useLiveStream';
import { getEvidenceUrl } from '../utils/evidence';
import { MOCK_ALERTS } from '../services/mockData';
import { getNormalizedSeverity, type SeverityMeta } from '../utils/severity';
import { VLM_MODEL_NAME } from '../config/vlm';
import { Button } from '../components/ui/Button';
import { StatusDot } from '../components/ui/StatusDot';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Search,
  RefreshCw,
  Sparkles,
  MapPin,
  Bus,
  CheckCircle2,
  XCircle,
  FileText,
  Video,
  ZoomIn,
  X,
  ShieldAlert,
} from 'lucide-react';

interface AlertGroup {
  id: string;
  primaryAlert: Alert;
  alerts: Alert[];
  count: number;
  repeatLabel: string;
  latestTimestamp: string;
  normalizedSeverity: SeverityMeta;
  locationLabel: string;
}

export function LiveAlerts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'NEEDS_REVIEW'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNRESOLVED' | 'RESOLVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [isVlmModalOpen, setIsVlmModalOpen] = useState(false);

  const { isConnected } = useLiveStream();

  const { data: alerts = MOCK_ALERTS, isLoading, error, refetch } = useQuery({
    queryKey: ['alerts'],
    queryFn: fetchAlerts,
    initialData: MOCK_ALERTS,
    refetchInterval: 5000,
  });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateAlertStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
  });

  const allAlerts: Alert[] = Array.isArray(alerts) ? alerts : MOCK_ALERTS;

  // Group repeat detections by location proximity and defect type
  const groupedAlerts = useMemo<AlertGroup[]>(() => {
    const groups: AlertGroup[] = [];

    allAlerts.forEach((alert) => {
      const lat = alert.detection?.lat ?? 21.1966;
      const lon = alert.detection?.lon ?? 81.6664;
      const type = alert.type || 'ROAD_DEFECT';

      // Find an existing group within ~300 meters (~0.0028 deg)
      const existing = groups.find((g) => {
        const gLat = g.primaryAlert.detection?.lat ?? 21.1966;
        const gLon = g.primaryAlert.detection?.lon ?? 81.6664;
        const dLat = Math.abs(lat - gLat);
        const dLon = Math.abs(lon - gLon);
        return g.primaryAlert.type === type && dLat < 0.003 && dLon < 0.003;
      });

      if (existing) {
        existing.alerts.push(alert);
        existing.count += 1;
        existing.repeatLabel = `×${existing.count} within 300 m`;
        if (new Date(alert.timestamp) > new Date(existing.latestTimestamp)) {
          existing.latestTimestamp = alert.timestamp;
          existing.primaryAlert = alert;
          existing.normalizedSeverity = getNormalizedSeverity({
            severity: alert.severity,
            confidence: alert.detection?.confidence,
            type: alert.type,
          });
        }
      } else {
        const sevMeta = getNormalizedSeverity({
          severity: alert.severity,
          confidence: alert.detection?.confidence,
          type: alert.type,
        });

        groups.push({
          id: `group-${alert.id}`,
          primaryAlert: alert,
          alerts: [alert],
          count: 1,
          repeatLabel: 'Single detection',
          latestTimestamp: alert.timestamp,
          normalizedSeverity: sevMeta,
          locationLabel: alert.title.includes('NH') ? 'NH-30 Simga Corridor' : 'Raipur Central Ward',
        });
      }
    });

    return groups;
  }, [allAlerts]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    return groupedAlerts.filter((group) => {
      const p = group.primaryAlert;
      if (severityFilter === 'CRITICAL' && group.normalizedSeverity.tier !== 'CRITICAL') return false;
      if (severityFilter === 'HIGH' && group.normalizedSeverity.tier !== 'HIGH') return false;
      if (severityFilter === 'NEEDS_REVIEW' && group.normalizedSeverity.tier !== 'NEEDS_REVIEW') return false;

      if (statusFilter === 'UNRESOLVED' && p.status === 'RESOLVED') return false;
      if (statusFilter === 'RESOLVED' && p.status !== 'RESOLVED') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchType = p.type.toLowerCase().includes(q);
        const matchId = String(p.id).includes(q);
        return matchTitle || matchType || matchId;
      }
      return true;
    });
  }, [groupedAlerts, severityFilter, statusFilter, searchQuery]);

  // Selected Alert
  const selectedAlert: Alert = useMemo(() => {
    if (selectedAlertId) {
      const match = allAlerts.find((a) => a.id === selectedAlertId);
      if (match) return match;
    }
    if (filteredGroups.length > 0) {
      return filteredGroups[0].primaryAlert;
    }
    return allAlerts[0];
  }, [selectedAlertId, allAlerts, filteredGroups]);

  const selectedSeverity = useMemo(() => {
    if (!selectedAlert) return getNormalizedSeverity({});
    return getNormalizedSeverity({
      severity: selectedAlert.severity,
      confidence: selectedAlert.detection?.confidence,
      type: selectedAlert.type,
    });
  }, [selectedAlert]);

  const selectedGroup = useMemo(() => {
    return groupedAlerts.find((g) => g.alerts.some((a) => a.id === selectedAlert?.id));
  }, [groupedAlerts, selectedAlert]);

  const handleStatusChange = (newStatus: string) => {
    if (!selectedAlert) return;
    mutation.mutate({ id: selectedAlert.id, status: newStatus });
  };

  const confidencePct = Math.round((selectedAlert?.detection?.confidence || 0.94) * 100);
  const resolvedEvidence = getEvidenceUrl(selectedAlert?.detection?.evidence_url);

  if (isLoading && allAlerts.length === 0) return <LoadingState message="Connecting to alert queue..." />;
  if (error && allAlerts.length === 0) {
    return <ErrorState message="Could not load live alerts." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)] overflow-hidden font-sans select-none">
      {/* Top Quiet KPI Header */}
      <div className="h-11 px-4 border-b border-[var(--border-subtle)] bg-[var(--surface)] flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-muted)]">Active incidents</span>
            <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
              {groupedAlerts.filter((g) => g.primaryAlert.status !== 'RESOLVED').length}
            </span>
          </div>
          <div className="w-px h-3 bg-[var(--border-subtle)]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-muted)]">Verified critical</span>
            <span className="font-mono font-semibold tabular-nums text-[#F0524F]">
              {groupedAlerts.filter((g) => g.normalizedSeverity.tier === 'CRITICAL').length}
            </span>
          </div>
          <div className="w-px h-3 bg-[var(--border-subtle)]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-muted)]">Awaiting authority review</span>
            <span className="font-mono font-semibold tabular-nums text-[var(--text-secondary)]">
              {groupedAlerts.filter((g) => g.primaryAlert.status === 'NEW').length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#34D399]' : 'bg-[var(--accent)]'}`} />
            <span>{isConnected ? 'Telemetry synchronized' : 'Offline buffer'}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            title="Refresh alerts"
            aria-label="Refresh alerts"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Main Two-Pane Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Grouped Alert Queue (50%) */}
        <div className="w-1/2 flex flex-col border-r border-[var(--border-subtle)] bg-[var(--surface)] overflow-hidden">
          {/* Toolbar */}
          <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]/30 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by defect ID, corridor..."
                  className="w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-md pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none cursor-pointer"
              >
                <option value="ALL">All status</option>
                <option value="UNRESOLVED">Unresolved</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>

            <SegmentedControl<'ALL' | 'CRITICAL' | 'HIGH' | 'NEEDS_REVIEW'>
              size="sm"
              value={severityFilter}
              onChange={setSeverityFilter}
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'CRITICAL', label: 'Critical' },
                { value: 'HIGH', label: 'High' },
                { value: 'NEEDS_REVIEW', label: 'Needs review' },
              ]}
            />
          </div>

          {/* Grouped Alert Cards List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {filteredGroups.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="w-6 h-6" strokeWidth={1.5} />}
                title="No active alerts"
                description="All filtered alerts have been acknowledged or resolved."
              />
            ) : (
              filteredGroups.map((group) => {
                const alert = group.primaryAlert;
                const isSelected = selectedAlert?.id === alert.id;
                const sev = group.normalizedSeverity;

                return (
                  <div
                    key={group.id}
                    onClick={() => setSelectedAlertId(alert.id)}
                    className={`p-3 transition-colors duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--surface-raised)] border-l-2 border-l-[var(--accent)]'
                        : 'hover:bg-[var(--surface-raised)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <StatusDot
                          status={
                            sev.tier === 'CRITICAL'
                              ? 'critical'
                              : sev.tier === 'HIGH'
                              ? 'high'
                              : sev.tier === 'NEEDS_REVIEW'
                              ? 'neutral'
                              : 'medium'
                          }
                          label={sev.label}
                        />
                        {group.count > 1 && (
                          <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-raised)] px-1.5 py-0.2 rounded border border-[var(--border-subtle)]">
                            {group.repeatLabel}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        {new Date(group.latestTimestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-[var(--text-primary)] mb-1">
                      {alert.title}
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] pt-1">
                      <span className="flex items-center gap-1">
                        <Bus className="w-3 h-3 text-[var(--text-secondary)]" strokeWidth={1.5} />
                        BUS-{alert.detection ? String(alert.detection.journey_id).padStart(2, '0') : '01'}
                      </span>
                      <span>
                        Confidence:{' '}
                        <strong className="text-[var(--text-secondary)] tabular-nums">
                          {Math.round((alert.detection?.confidence || 0.94) * 100)}%
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Incident Detail & Authority Decisions (50%) */}
        <div className="w-1/2 flex flex-col bg-[var(--bg-base)] overflow-y-auto">
          {selectedAlert ? (
            <div className="p-4 space-y-4">
              {/* Header Box (Single-Level Card) */}
              <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusDot
                      status={
                        selectedSeverity.tier === 'CRITICAL'
                          ? 'critical'
                          : selectedSeverity.tier === 'HIGH'
                          ? 'high'
                          : selectedSeverity.tier === 'NEEDS_REVIEW'
                          ? 'neutral'
                          : 'medium'
                      }
                      label={`${selectedSeverity.label} priority`}
                    />
                    <span className="text-[11px] text-[var(--text-muted)]">·</span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {selectedAlert.status === 'NEW'
                        ? 'Awaiting authority review'
                        : selectedAlert.status === 'ACKNOWLEDGED'
                        ? 'Acknowledged'
                        : 'Resolved'}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    ALT-{String(selectedAlert.id).padStart(4, '0')}
                  </span>
                </div>

                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  {selectedAlert.title}
                </h2>

                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]">
                  <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                    <MapPin className="w-3 h-3 text-[var(--accent)]" strokeWidth={1.5} />
                    {selectedGroup?.locationLabel || 'NH-30 Raipur Corridor'}
                  </span>
                  <span>
                    GNSS: [{selectedAlert.detection?.lat.toFixed(5)}, {selectedAlert.detection?.lon.toFixed(5)}]
                  </span>
                </div>
              </div>

              {/* Action Buttons: Exactly ONE primary, rest secondary/ghost */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Primary Action: Approve for complaint */}
                <Button
                  variant="primary"
                  size="md"
                  icon={<FileText className="w-4 h-4" strokeWidth={1.5} />}
                  onClick={() => navigate(`/complaints?lodgeAlertId=${selectedAlert.id}`)}
                >
                  Approve for complaint
                </Button>

                {/* Secondary Action: Review evidence (VLM verification) */}
                <Button
                  variant="secondary"
                  size="md"
                  icon={<Sparkles className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.5} />}
                  onClick={() => setIsVlmModalOpen(true)}
                >
                  Review evidence
                </Button>

                {/* Secondary: Acknowledge or Resolve */}
                {selectedAlert.status === 'NEW' && (
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={mutation.isPending}
                    icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />}
                    onClick={() => handleStatusChange('ACKNOWLEDGED')}
                  >
                    Acknowledge
                  </Button>
                )}

                {/* Secondary / Danger: Reject as false positive */}
                {selectedAlert.status !== 'RESOLVED' && (
                  <Button
                    variant="ghost"
                    size="md"
                    disabled={mutation.isPending}
                    icon={<XCircle className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.5} />}
                    onClick={() => handleStatusChange('RESOLVED')}
                  >
                    Reject as false positive
                  </Button>
                )}
              </div>

              {/* Evidence Viewport Card */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] overflow-hidden">
                <div className="px-3.5 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      Evidence capture
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] px-1.5 py-0.2 rounded bg-[var(--surface-raised)]">
                      {VLM_MODEL_NAME} ready
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Video className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      onClick={() =>
                        navigate(
                          `/video-vault?alertId=${selectedAlert.id}&time=${
                            selectedAlert.detection?.video_timestamp_sec || 50.4
                          }`
                        )
                      }
                    >
                      DVR buffer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<ZoomIn className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      onClick={() => setIsEvidenceModalOpen(true)}
                    >
                      Inspect
                    </Button>
                  </div>
                </div>

                <div className="aspect-16/9 bg-black/40 relative flex items-center justify-center overflow-hidden">
                  {resolvedEvidence ? (
                    <img
                      src={resolvedEvidence}
                      alt="Incident evidence snapshot"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-xs text-[var(--text-muted)] flex flex-col items-center gap-1.5">
                      <ShieldAlert className="w-5 h-5 text-[var(--text-muted)]" strokeWidth={1.5} />
                      <span>No visual evidence snapshot available</span>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-mono bg-black/70 text-white backdrop-blur-xs">
                    Bus-{String(selectedAlert.detection?.journey_id || '01').padStart(2, '0')} · {confidencePct}% AI confidence
                  </div>
                </div>

                {/* Thin Confidence Meter */}
                <div className="p-3 border-t border-[var(--border-subtle)] space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--text-muted)]">Model confidence</span>
                    <span className="font-mono text-[var(--text-primary)] font-semibold tabular-nums">
                      {confidencePct}%
                    </span>
                  </div>
                  <div className="w-full h-1 bg-[var(--surface-raised)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-300 rounded-full"
                      style={{ width: `${confidencePct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Metadata Card: Technical Telemetry */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3.5 space-y-2.5 text-xs">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                  Telemetry metadata
                </span>

                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-[var(--text-muted)] block">Incident timestamp</span>
                    <span className="font-mono text-[var(--text-primary)] mt-0.5 block">
                      {new Date(selectedAlert.timestamp).toISOString().replace('T', ' ').slice(0, 19)} UTC
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Sensor node</span>
                    <span className="font-mono text-[var(--text-primary)] mt-0.5 block">
                      BUS-{String(selectedAlert.detection?.journey_id || '01').padStart(2, '0')} (Windshield Dashcam)
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">GNSS coordinates</span>
                    <span className="font-mono text-[var(--text-primary)] mt-0.5 block">
                      {selectedAlert.detection?.lat.toFixed(5)}, {selectedAlert.detection?.lon.toFixed(5)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Cluster status</span>
                    <span className="text-[var(--text-secondary)] mt-0.5 block">
                      {selectedGroup?.repeatLabel || 'Single detection'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<ShieldAlert className="w-6 h-6" strokeWidth={1.5} />}
              title="No incident selected"
              description="Select an incident alert from the left queue to review forensic details."
            />
          )}
        </div>
      </div>

      {/* Full-res Evidence Inspect Modal */}
      {isEvidenceModalOpen && resolvedEvidence && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsEvidenceModalOpen(false)}
        >
          <div
            className="max-w-4xl w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--text-primary)]">
                Forensic evidence inspection · Alert #{selectedAlert.id}
              </span>
              <button
                onClick={() => setIsEvidenceModalOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-raised)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-2 bg-black flex items-center justify-center max-h-[75vh]">
              <img
                src={resolvedEvidence}
                alt="Full resolution evidence"
                className="max-h-[70vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}

      {/* VLM Semantic Verification Modal */}
      <VlmAuditModal
        isOpen={isVlmModalOpen}
        onClose={() => setIsVlmModalOpen(false)}
        alertId={selectedAlert?.id}
        evidenceUrl={selectedAlert?.detection?.evidence_url}
        initialType={selectedAlert?.type}
        lat={selectedAlert?.detection?.lat}
        lon={selectedAlert?.detection?.lon}
      />
    </div>
  );
}
