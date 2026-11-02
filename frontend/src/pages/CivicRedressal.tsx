import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getStoredGrievances,
  advanceGrievanceStage,
  createGrievance,
  type CivicGrievance,
  type GrievancePortal,
  type GrievanceStatus,
} from '../services/grievances';
import { fetchAlerts, type Alert } from '../services/alerts';
import { getEvidenceUrl } from '../utils/evidence';
import {
  requestAiComplaintDraft,
} from '../services/complaintAi';
import { VLM_MODEL_NAME } from '../config/vlm';
import { Button } from '../components/ui/Button';
import { StatusDot } from '../components/ui/StatusDot';
import { Card } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EmptyState } from '../components/ui/EmptyState';
import {
  ArrowLeft,
  Search,
  Check,
  FileText,
  Send,
  Sparkles,
  Copy,
  Plus,
} from 'lucide-react';

export function CivicRedressal() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [grievances, setGrievances] = useState<CivicGrievance[]>([]);
  const [selectedGrievanceId, setSelectedGrievanceId] = useState<string | null>(null);
  const [isLodgingNew, setIsLodgingNew] = useState(false);

  // Filters
  const [portalFilter, setPortalFilter] = useState<'ALL' | GrievancePortal>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | GrievanceStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form State
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAlertForNew, setSelectedAlertForNew] = useState<Alert | null>(null);
  const [newTargetPortal, setNewTargetPortal] = useState<GrievancePortal>('PWD_CHHATTISGARH');
  const [newSubject, setNewSubject] = useState('');
  const [newLegalRef, setNewLegalRef] = useState('');
  const [newFormalBody, setNewFormalBody] = useState('');
  const [newActionNotes, setNewActionNotes] = useState('');
  const [newSlaHours, setNewSlaHours] = useState(48);

  // AI Progress
  const [isGeneratingAiDraft, setIsGeneratingAiDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Grievances and Alerts
  useEffect(() => {
    const data = getStoredGrievances();
    setGrievances(data);

    fetchAlerts()
      .then((res) => {
        setAlerts(res || []);
        const lodgeAlertId = searchParams.get('lodgeAlertId');
        if (lodgeAlertId) {
          const match = (res || []).find((a) => a.id === Number(lodgeAlertId));
          if (match) {
            setupNewGrievanceForm(match);
          }
        }
      })
      .catch((err) => console.error('Failed to fetch alerts:', err));
  }, [searchParams]);

  const setupNewGrievanceForm = (alert: Alert) => {
    setSelectedAlertForNew(alert);
    setIsLodgingNew(true);
    setSelectedGrievanceId(null);

    const isHighway = alert.title.includes('NH') || alert.type === 'ROAD_DEFECT';
    const initialPortal: GrievancePortal = isHighway ? 'PWD_CHHATTISGARH' : 'RMC_311';
    setNewTargetPortal(initialPortal);
    setNewSubject(`Road hazard escalation: ${alert.title}`);
    setNewLegalRef('IRC:SP:84-2019 Highway Maintenance Standards & Section 133 CrPC');
    setNewFormalBody(
      `Anomalous pavement condition detected with ${Math.round(
        (alert.detection?.confidence || 0.9) * 100
      )}% computer vision confidence. Sub-base structural compromise requires immediate intervention under municipal safety guidelines.`
    );
    setNewActionNotes('Cold-mix asphalt patch, mechanical compaction, and drainage grade adjustment');
    setNewSlaHours(alert.severity === 'CRITICAL' ? 24 : 48);
  };

  const selectedGrievance = useMemo(() => {
    return grievances.find((g) => g.id === selectedGrievanceId) || null;
  }, [grievances, selectedGrievanceId]);

  const isFullViewOpen = isLodgingNew || Boolean(selectedGrievance);

  const handleCloseFullView = () => {
    setIsLodgingNew(false);
    setSelectedGrievanceId(null);
    setSearchParams({});
  };

  // SLA Calculation helper
  const calculateSla = (deadlineIso: string, status: GrievanceStatus) => {
    if (status === 'RESOLVED') {
      return {
        label: 'Resolved within SLA',
        statusType: 'success' as const,
        isOverdue: false,
      };
    }
    const diffMs = new Date(deadlineIso).getTime() - Date.now();
    const diffHours = Math.round(diffMs / (3600 * 1000));
    if (diffHours < 0) {
      return {
        label: `${Math.abs(diffHours)}h overdue`,
        statusType: 'critical' as const,
        isOverdue: true,
      };
    }
    if (diffHours <= 12) {
      return {
        label: `${diffHours}h remaining`,
        statusType: 'high' as const,
        isOverdue: false,
      };
    }
    return {
      label: `${diffHours}h remaining`,
      statusType: 'success' as const,
      isOverdue: false,
    };
  };

  // Filtered list
  const filteredGrievances = useMemo(() => {
    return grievances.filter((g) => {
      if (portalFilter !== 'ALL' && g.targetPortal !== portalFilter) return false;
      if (statusFilter !== 'ALL' && g.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          g.id.toLowerCase().includes(q) ||
          g.ticketRef.toLowerCase().includes(q) ||
          g.streetName.toLowerCase().includes(q) ||
          g.corridor.toLowerCase().includes(q) ||
          g.defectType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [grievances, portalFilter, statusFilter, searchQuery]);

  // Metrics
  const totalCount = grievances.length;
  const inProgressCount = grievances.filter(
    (g) => g.status === 'IN_PROGRESS' || g.status === 'WARD_ASSIGNED'
  ).length;
  const overdueCount = grievances.filter(
    (g) => new Date(g.slaDeadline).getTime() < Date.now() && g.status !== 'RESOLVED'
  ).length;
  const resolvedCount = grievances.filter((g) => g.status === 'RESOLVED').length;

  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRowClick = (grievance: CivicGrievance) => {
    setIsLodgingNew(false);
    setSelectedGrievanceId(grievance.id);
  };

  const handleAdvanceStage = (id: string) => {
    const updated = advanceGrievanceStage(id);
    if (updated) {
      setGrievances(getStoredGrievances());
    }
  };

  // VLM Complaint Drafter Trigger
  const handleGenerateAiDraft = async () => {
    if (!selectedAlertForNew) return;
    setIsGeneratingAiDraft(true);

    try {
      const draft = await requestAiComplaintDraft({
        defect_type: selectedAlertForNew.type,
        severity: selectedAlertForNew.severity,
        confidence: selectedAlertForNew.detection?.confidence || 0.94,
        corridor: 'NH-30 Raipur-Simga Highway Corridor',
        street_name: 'NH-30 Km Marker 14.2 (Simga Bypass)',
        lat: selectedAlertForNew.detection?.lat || 21.1966,
        lon: selectedAlertForNew.detection?.lon || 81.6664,
        bus_id: `BUS-${String(selectedAlertForNew.detection?.journey_id || '01').padStart(2, '0')}`,
        target_portal: newTargetPortal,
      });

      setNewSubject(draft.subject);
      setNewLegalRef(draft.legal_statutory_reference);
      setNewFormalBody(draft.formal_complaint_body);
      setNewActionNotes(draft.prescribed_civil_action);
      if (draft.recommended_portal) {
        setNewTargetPortal(draft.recommended_portal);
      }
      if (draft.recommended_sla_hours) {
        setNewSlaHours(draft.recommended_sla_hours);
      }
    } catch (err) {
      console.error('Failed to generate AI complaint draft:', err);
    } finally {
      setIsGeneratingAiDraft(false);
    }
  };

  const handleSubmitNewGrievance = () => {
    if (!selectedAlertForNew) return;
    setIsSubmitting(true);

    setTimeout(() => {
      const created = createGrievance({
        alertId: selectedAlertForNew.id,
        defectType: selectedAlertForNew.type,
        severity: selectedAlertForNew.severity as any,
        confidence: selectedAlertForNew.detection?.confidence || 0.94,
        lat: selectedAlertForNew.detection?.lat || 21.2415,
        lon: selectedAlertForNew.detection?.lon || 81.6335,
        streetName: newSubject ? `${newSubject.slice(0, 48)}...` : 'NH-30 Simga Highway Corridor',
        corridor: 'NH-30 Raipur-Simga Highway',
        ward: newTargetPortal === 'RMC_311' ? 'Ward 12 - Telibandha Zone' : 'State PWD Division 1',
        targetPortal: newTargetPortal,
        evidenceUrl: selectedAlertForNew.detection?.evidence_url,
        videoTimestampSec: (selectedAlertForNew.detection as any)?.video_timestamp_sec,
        busId: `BUS-${String(selectedAlertForNew.detection?.journey_id || '01').padStart(2, '0')}`,
        actionRequired: `${newActionNotes}\n[Statutory Citation: ${newLegalRef}]`,
      });

      setGrievances(getStoredGrievances());
      setIsSubmitting(false);
      setIsLodgingNew(false);
      setSelectedGrievanceId(created.id);
      setSearchParams({});
    }, 500);
  };

  const handleExportDossier = (g: CivicGrievance) => {
    const content = `
OFFICIAL CIVIC GRIEVANCE DOSSIER
TRACKING ID:       ${g.id}
GOV REFERENCE:     ${g.ticketRef}
SUBMITTED AT:      ${new Date(g.submittedAt).toLocaleString()}
TARGET PORTAL:     ${g.departmentName} (${g.targetPortal})
ASSIGNED OFFICER:  ${g.assignedOfficer} (Phone: ${g.contactPhone})

INCIDENT SPECIFICATIONS:
  - Defect Category:   ${g.defectType}
  - Criticality Tier:  ${g.severity}
  - AI Confidence:     ${(g.confidence * 100).toFixed(1)}% (Dual-Head YOLOv8)
  - Location:          ${g.streetName}
  - GNSS:              ${g.lat.toFixed(6)}, ${g.lon.toFixed(6)}
  - Corridor:          ${g.corridor} · ${g.ward}
  - Unit:              ${g.busId}

MUNICIPAL SLA DIRECTIVE:
  - SLA Deadline:      ${new Date(g.slaDeadline).toLocaleString()}
  - Status:            ${g.status} (Stage ${g.stage} of 4)
  - Action Directive:  ${g.actionRequired}
`.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GRIEVANCE_${g.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getPortalLabel = (portal: GrievancePortal) => {
    switch (portal) {
      case 'PWD_CHHATTISGARH':
        return 'State PWD';
      case 'RMC_311':
        return 'RMC 311';
      case 'NHAI':
        return 'NHAI Cell';
      case 'TRAFFIC_POLICE':
        return 'Traffic Police';
    }
  };

  const getStatusMeta = (status: GrievanceStatus) => {
    switch (status) {
      case 'TRANSMITTED':
        return { label: 'Transmitted', dot: 'info' as const };
      case 'WARD_ASSIGNED':
        return { label: 'Ward assigned', dot: 'high' as const };
      case 'IN_PROGRESS':
        return { label: 'In progress', dot: 'info' as const };
      case 'RESOLVED':
        return { label: 'Resolved', dot: 'success' as const };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden">
      {isFullViewOpen ? (
        /* ========================================================================= */
        /* VIEW A: FULL-WINDOW EXECUTIVE DOSSIER WORKSPACE                           */
        /* ========================================================================= */
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in duration-150">
          {/* Sub-Header */}
          <div className="h-12 px-6 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface)] shrink-0">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                icon={<ArrowLeft className="w-3.5 h-3.5" />}
                onClick={handleCloseFullView}
              >
                Back to complaints
              </Button>
              <span className="text-[var(--border-strong)]">/</span>
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                {isLodgingNew ? 'New statutory complaint' : selectedGrievance?.id}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isLodgingNew ? (
                <Button
                  variant="primary"
                  size="sm"
                  loading={isSubmitting}
                  icon={<Send className="w-3.5 h-3.5" />}
                  onClick={handleSubmitNewGrievance}
                >
                  Authorize & transmit to portal
                </Button>
              ) : selectedGrievance ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FileText className="w-3.5 h-3.5" />}
                  onClick={() => handleExportDossier(selectedGrievance)}
                >
                  Export dossier
                </Button>
              ) : null}
            </div>
          </div>

          {/* Dossier Body */}
          <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
            {isLodgingNew ? (
              /* New Complaint Form */
              <div className="space-y-6">
                <Card className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        Human authority complaint review
                      </h2>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Statutory escalation to municipal portal with VLM assistance ({VLM_MODEL_NAME}).
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={isGeneratingAiDraft}
                      icon={<Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />}
                      onClick={handleGenerateAiDraft}
                    >
                      Draft statutory text
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">
                        Target department portal
                      </label>
                      <select
                        value={newTargetPortal}
                        onChange={(e) => setNewTargetPortal(e.target.value as GrievancePortal)}
                        className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      >
                        <option value="PWD_CHHATTISGARH">State PWD Division 1</option>
                        <option value="RMC_311">RMC 311 Nagar Nigam</option>
                        <option value="NHAI">NHAI Regional Office</option>
                        <option value="TRAFFIC_POLICE">Traffic Police Infrastructure Cell</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">
                        Resolution SLA deadline
                      </label>
                      <select
                        value={newSlaHours}
                        onChange={(e) => setNewSlaHours(Number(e.target.value))}
                        className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      >
                        <option value={24}>24 Hours (Urgent Hazard)</option>
                        <option value={48}>48 Hours (Standard Maintenance)</option>
                        <option value={72}>72 Hours (Corridor Resurfacing)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 text-xs">
                    <div>
                      <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">
                        Subject & statutory headline
                      </label>
                      <input
                        type="text"
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">
                        Statutory / legal reference
                      </label>
                      <input
                        type="text"
                        value={newLegalRef}
                        onChange={(e) => setNewLegalRef(e.target.value)}
                        className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">
                        Formal notice body
                      </label>
                      <textarea
                        rows={4}
                        value={newFormalBody}
                        onChange={(e) => setNewFormalBody(e.target.value)}
                        className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">
                        Prescribed engineering intervention
                      </label>
                      <input
                        type="text"
                        value={newActionNotes}
                        onChange={(e) => setNewActionNotes(e.target.value)}
                        className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                </Card>
              </div>
            ) : selectedGrievance ? (
              /* Grievance Detail Record */
              <div className="space-y-4">
                <Card className="p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                          {selectedGrievance.ticketRef}
                        </span>
                        <StatusDot
                          status={getStatusMeta(selectedGrievance.status).dot}
                          label={getStatusMeta(selectedGrievance.status).label}
                        />
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {selectedGrievance.departmentName} · Assigned to {selectedGrievance.assignedOfficer}
                      </p>
                    </div>

                    {selectedGrievance.status !== 'RESOLVED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleAdvanceStage(selectedGrievance.id)}
                      >
                        Advance stage ({selectedGrievance.stage + 1}/4)
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-2 border-t border-[var(--border-subtle)]">
                    <div>
                      <span className="text-[11px] text-[var(--text-muted)] block">Corridor</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {selectedGrievance.corridor}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--text-muted)] block">SLA deadline</span>
                      <span className="font-mono text-[var(--text-primary)]">
                        {new Date(selectedGrievance.slaDeadline).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--text-muted)] block">Defect</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {selectedGrievance.defectType}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--text-muted)] block">Officer contact</span>
                      <span className="font-mono text-[var(--text-primary)]">
                        {selectedGrievance.contactPhone}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[var(--surface-raised)] p-3 rounded-lg border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed">
                    <span className="font-semibold text-[var(--text-primary)] block mb-1">
                      Action directive:
                    </span>
                    {selectedGrievance.actionRequired}
                  </div>
                </Card>

                {/* Evidence & Timeline */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedGrievance.evidenceUrl && (
                    <Card className="p-3 space-y-2">
                      <span className="text-xs font-semibold text-[var(--text-primary)] block">
                        Verified camera evidence
                      </span>
                      <img
                        src={getEvidenceUrl(selectedGrievance.evidenceUrl)!}
                        alt="Evidence"
                        onError={(e) => {
                          e.currentTarget.src = '/evidence/pothole_01.jpg';
                        }}
                        className="w-full h-44 object-cover rounded-lg border border-[var(--border-subtle)]"
                      />
                    </Card>
                  )}

                  <Card className="p-3 space-y-3">
                    <span className="text-xs font-semibold text-[var(--text-primary)] block">
                      Audit history
                    </span>
                    <div className="space-y-2.5 text-xs">
                      {selectedGrievance.history.map((h, i) => (
                        <div key={i} className="flex gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
                          <div>
                            <div className="font-medium text-[var(--text-primary)]">{h.stage}</div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              {h.actor} · {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{h.note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* VIEW B: MAIN GRIEVANCE DIRECTORY & KPI TILES                              */
        /* ========================================================================= */
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Top 4 Aurora KPI Tiles */}
          <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
            {/* Tile 1: Total Lodged */}
            <div
              className="p-3.5 rounded-xl border transition-all"
              style={{
                background: 'var(--kpi-lavender)',
                borderColor: 'var(--kpi-border)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Active complaints
              </div>
              <div
                className="text-2xl font-semibold tabular-nums mt-1"
                style={{ color: 'var(--kpi-text)' }}
              >
                {totalCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Across all municipal portals
              </div>
            </div>

            {/* Tile 2: Under Repair */}
            <div
              className="p-3.5 rounded-xl border transition-all"
              style={{
                background: 'var(--kpi-sky)',
                borderColor: 'var(--kpi-border)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Under repair
              </div>
              <div
                className="text-2xl font-semibold tabular-nums mt-1"
                style={{ color: 'var(--kpi-text)' }}
              >
                {inProgressCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Work orders assigned
              </div>
            </div>

            {/* Tile 3: SLA Overdue */}
            <div
              className="p-3.5 rounded-xl border transition-all"
              style={{
                background: 'var(--kpi-indigo)',
                borderColor: 'var(--kpi-border)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Overdue complaints
              </div>
              <div
                className={`text-2xl font-semibold tabular-nums mt-1 ${
                  overdueCount > 0 ? 'text-[#F0524F]' : ''
                }`}
                style={{ color: overdueCount > 0 ? '#F0524F' : 'var(--kpi-text)' }}
              >
                {overdueCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {overdueCount === 0 ? 'All within statutory SLA' : 'Exceeded target timeframe'}
              </div>
            </div>

            {/* Tile 4: Resolved */}
            <div
              className="p-3.5 rounded-xl border transition-all"
              style={{
                background: 'var(--kpi-mint)',
                borderColor: 'var(--kpi-border)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                Resolved with proof
              </div>
              <div
                className="text-2xl font-semibold tabular-nums mt-1"
                style={{ color: 'var(--kpi-text)' }}
              >
                {resolvedCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Inspected and closed
              </div>
            </div>
          </div>

          {/* Unified Filter Toolbar */}
          <div className="px-4 py-2 border-y border-[var(--border-subtle)] bg-[var(--surface)] flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Department Filter */}
            <div className="flex items-center gap-1.5">
              <SegmentedControl
                size="sm"
                value={portalFilter}
                onChange={(v) => setPortalFilter(v as any)}
                options={[
                  { value: 'ALL', label: `All (${totalCount})` },
                  { value: 'PWD_CHHATTISGARH', label: 'State PWD' },
                  { value: 'RMC_311', label: 'RMC 311' },
                  { value: 'NHAI', label: 'NHAI' },
                  { value: 'TRAFFIC_POLICE', label: 'Traffic Police' },
                ]}
              />
            </div>

            {/* Search, Status & Primary Action */}
            <div className="flex items-center gap-2 ml-auto">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search ID, street..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg pl-7 pr-2.5 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] w-48"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="ALL">All statuses</option>
                <option value="TRANSMITTED">Transmitted</option>
                <option value="WARD_ASSIGNED">Ward assigned</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="RESOLVED">Resolved</option>
              </select>

              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => {
                  if (alerts.length > 0) {
                    setupNewGrievanceForm(alerts[0]);
                  }
                }}
              >
                Lodge complaint
              </Button>
            </div>
          </div>

          {/* Hairline Quiet Enterprise Table */}
          <div className="flex-1 overflow-auto bg-[var(--surface)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-[11px] sticky top-0 z-10 select-none">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Tracking ID</th>
                  <th className="py-2.5 px-4 font-medium">Hazard</th>
                  <th className="py-2.5 px-4 font-medium">Corridor & location</th>
                  <th className="py-2.5 px-4 font-medium">Department</th>
                  <th className="py-2.5 px-4 font-medium">SLA deadline</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredGrievances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <EmptyState
                        title="No matching complaints"
                        description="Adjust your search query or department filter."
                      />
                    </td>
                  </tr>
                ) : (
                  filteredGrievances.map((g) => {
                    const sla = calculateSla(g.slaDeadline, g.status);
                    const statusMeta = getStatusMeta(g.status);

                    return (
                      <tr
                        key={g.id}
                        onClick={() => handleRowClick(g)}
                        className="hover:bg-[var(--surface-raised)]/60 cursor-pointer transition-colors duration-100"
                      >
                        <td className="py-2.5 px-4 font-mono text-[var(--text-primary)]">
                          <div className="flex items-center gap-1.5">
                            <span>{g.id}</span>
                            <button
                              onClick={(e) => handleCopyId(g.id, e)}
                              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                              title="Copy ID"
                            >
                              {copiedId === g.id ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        <td className="py-2.5 px-4 text-[var(--text-primary)] font-medium">
                          {g.defectType}
                        </td>

                        <td className="py-2.5 px-4 text-[var(--text-secondary)]">
                          <div>{g.streetName}</div>
                          <div className="text-[11px] text-[var(--text-muted)]">{g.corridor}</div>
                        </td>

                        <td className="py-2.5 px-4 text-[var(--text-secondary)]">
                          {getPortalLabel(g.targetPortal)}
                        </td>

                        <td className="py-2.5 px-4">
                          <StatusDot
                            status={sla.statusType}
                            label={sla.label}
                          />
                        </td>

                        <td className="py-2.5 px-4">
                          <StatusDot
                            status={statusMeta.dot}
                            label={statusMeta.label}
                          />
                        </td>

                        <td className="py-2.5 px-4 text-right">
                          <span className="text-[var(--accent)] hover:underline text-xs">
                            Review
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
