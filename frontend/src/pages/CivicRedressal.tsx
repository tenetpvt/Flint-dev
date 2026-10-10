import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getStoredGrievances,
  advanceGrievanceStage,
  createGrievance,
} from '../services/grievances';
import type {
  CivicGrievance,
  GrievancePortal,
  GrievanceStatus,
} from '../services/grievances';
import { fetchAlerts } from '../services/alerts';
import type { Alert } from '../services/alerts';
import { getEvidenceUrl } from '../utils/evidence';
import {
  requestAiComplaintDraft,
  getStoredGeminiKey,
  setStoredGeminiKey,
  type ComplaintAiDraft,
} from '../services/complaintAi';
import {
  ArrowLeft,
  Clock,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
  Copy,
  Check,
  FileText,
  Send,
  Sparkles,
  Key,
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

  // Gemini API Key State
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [userGeminiKey, setUserGeminiKey] = useState(getStoredGeminiKey());
  const [keyInput, setKeyInput] = useState(getStoredGeminiKey());

  // Form State for Human Authority Review
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
  const [aiDraft, setAiDraft] = useState<ComplaintAiDraft | null>(null);
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
    setAiDraft(null);

    const isHighway = alert.title.includes('NH') || alert.type === 'ROAD_DEFECT';
    const initialPortal: GrievancePortal = isHighway ? 'PWD_CHHATTISGARH' : 'RMC_311';
    setNewTargetPortal(initialPortal);
    setNewSubject(`URGENT: Municipal Road Hazard (${alert.type.toUpperCase()}) on Corridor`);
    setNewLegalRef('IRC:SP:84-2019 Highway Maintenance Standards & Section 133 CrPC');
    setNewFormalBody(
      `Anomalous road condition detected with ${Math.round(
        (alert.detection?.confidence || 0.9) * 100
      )}% computer vision confidence. Sub-base structural compromise requires immediate intervention under municipal safety guidelines.`
    );
    setNewActionNotes('Cold-mix asphalt patch, mechanical vibratory compaction, and drainage grade adjustment');
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
  const calculateSla = (deadlineIso: string) => {
    const diffMs = new Date(deadlineIso).getTime() - Date.now();
    const diffHours = Math.round(diffMs / (3600 * 1000));
    if (diffHours < 0) {
      return {
        label: `${Math.abs(diffHours)}h OVERDUE`,
        color: 'text-red-400 border-red-500/30 bg-red-500/10',
      };
    }
    if (diffHours <= 12) {
      return {
        label: `${diffHours}h remaining`,
        color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      };
    }
    return {
      label: `${diffHours}h remaining`,
      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
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

  const handleSaveGeminiKey = () => {
    setStoredGeminiKey(keyInput);
    setUserGeminiKey(keyInput.trim());
    setIsKeyModalOpen(false);
  };

  // Gemini AI Complaint Drafter Trigger
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

      setAiDraft(draft);
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

  // Human Authority Confirms and Transmits
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
========================================================================
     GOVERNMENT COLLABORATION API — OFFICIAL CIVIC GRIEVANCE DOSSIER
========================================================================
TRACKING ID:       ${g.id}
GOV REFERENCE:     ${g.ticketRef}
SUBMITTED AT:      ${new Date(g.submittedAt).toLocaleString()}
TARGET PORTAL:     ${g.departmentName} (${g.targetPortal})
ASSIGNED OFFICER:  ${g.assignedOfficer} (Phone: ${g.contactPhone})

INCIDENT / DEFECT SPECIFICATIONS:
  - Defect Category:   ${g.defectType.toUpperCase()}
  - Criticality Tier:  ${g.severity}
  - AI Confidence:     ${(g.confidence * 100).toFixed(1)}% (Dual-Head YOLOv8)
  - Location:          ${g.streetName}
  - Geographic GNSS:   ${g.lat.toFixed(6)}, ${g.lon.toFixed(6)}
  - Corridor / Ward:   ${g.corridor} · ${g.ward}
  - Survey Unit:       ${g.busId} (NVIDIA Orin Edge Node)
  - Video Timestamp:   ${g.videoTimestampSec ? `${g.videoTimestampSec.toFixed(1)}s` : 'Continuous'}

MUNICIPAL SLA DIRECTIVE:
  - Resolution Target: < 48 Hours
  - SLA Deadline:      ${new Date(g.slaDeadline).toLocaleString()}
  - Current Status:    ${g.status} (Stage ${g.stage} of 4)
  - Action Directive:  ${g.actionRequired}

AUDIT LOG & INTER-AGENCY TIMELINE:
${g.history
  .map(
    (h, i) =>
      `  [${i + 1}] ${new Date(h.timestamp).toLocaleString()} - ${h.stage}\n      Actor: ${h.actor}\n      Note:  ${h.note}`
  )
  .join('\n')}
========================================================================
Generated by FLINT / Urban Sense AI Municipal Intelligence Platform
    `.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CIVIC_GRIEVANCE_${g.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getPortalBadge = (portal: GrievancePortal) => {
    switch (portal) {
      case 'PWD_CHHATTISGARH':
        return { label: 'State PWD (Div-1)', color: 'bg-sky-500/10 text-sky-400 border-sky-500/25' };
      case 'RMC_311':
        return { label: 'RMC 311 Nagar Nigam', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' };
      case 'NHAI':
        return { label: 'NHAI Regional Cell', color: 'bg-purple-500/10 text-purple-400 border-purple-500/25' };
      case 'TRAFFIC_POLICE':
        return { label: 'Traffic Police Infra', color: 'bg-amber-500/10 text-amber-400 border-amber-500/25' };
    }
  };

  const getStatusBadge = (status: GrievanceStatus) => {
    switch (status) {
      case 'TRANSMITTED':
        return { label: 'Transmitted', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' };
      case 'WARD_ASSIGNED':
        return { label: 'Ward Assigned', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'IN_PROGRESS':
        return { label: 'In Progress', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' };
      case 'RESOLVED':
        return { label: 'Resolved & Closed', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#090C10] overflow-hidden text-[#e2e8f0] font-['Inter']">
      {/* ========================================================================= */}
      {/* VIEW A: FULL-WINDOW EXECUTIVE DOSSIER WORKSPACE (NO NARROW DRAWER)       */}
      {/* ========================================================================= */}
      {isFullViewOpen ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in duration-150">
          {/* Top Clean Sub-Header */}
          <div className="h-16 px-8 flex items-center justify-between border-b border-[#1E2638] bg-[#0E131A] shrink-0">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleCloseFullView}
                className="flex items-center space-x-2 text-xs font-medium text-[#94a3b8] hover:text-white px-3 py-1.5 rounded-lg border border-[#1E2638] hover:bg-[#161D28] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Grievances Directory</span>
              </button>

              <div className="h-4 w-px bg-[#1E2638]"></div>

              <div>
                <span className="text-xs text-[#64748b]">
                  {isLodgingNew ? 'Civic Escalation' : 'Municipal Record'} /{' '}
                </span>
                <span className="text-xs font-semibold text-white font-['JetBrains_Mono']">
                  {isLodgingNew ? 'New Complaint Draft' : selectedGrievance?.id}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Gemini Key Pill */}
              <button
                onClick={() => setIsKeyModalOpen(true)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-[#1E2638] hover:border-sky-500/40 text-xs text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[11px] font-['JetBrains_Mono']">
                  {userGeminiKey ? 'Gemini: Custom Key' : 'Gemini 3.5 Flash'}
                </span>
                <Key className="w-3 h-3 text-[#64748b]" />
              </button>

              {isLodgingNew ? (
                <button
                  onClick={handleSubmitNewGrievance}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-[#002447] text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Transmitting...' : 'Authorize & Transmit to Gov API'}</span>
                </button>
              ) : selectedGrievance ? (
                <button
                  onClick={() => handleExportDossier(selectedGrievance)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#1E2638] hover:bg-[#161D28] text-xs font-medium text-white flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  <span>Export Official Dossier</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Full-Window Scrollable Content: 2-Column Balanced Master Grid */}
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* ------------------------------------------------------------- */}
              {/* LEFT COLUMN: EVIDENCE & TELEMETRY SPECS (5 of 12 cols)        */}
              {/* ------------------------------------------------------------- */}
              <div className="lg:col-span-5 space-y-6">
                {/* Forensic Photo Frame */}
                <div className="rounded-xl border border-[#1E2638] bg-[#0E131A] overflow-hidden p-3 space-y-3 shadow-sm">
                  <div className="aspect-video w-full bg-[#070A0F] rounded-lg overflow-hidden border border-[#1E2638] flex items-center justify-center relative">
                    {isLodgingNew && selectedAlertForNew ? (
                      selectedAlertForNew.detection?.evidence_url ? (
                        <img
                          src={getEvidenceUrl(selectedAlertForNew.detection.evidence_url)!}
                          alt="Defect"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ShieldAlert className="w-8 h-8 text-[#64748b]" />
                      )
                    ) : selectedGrievance?.evidenceUrl ? (
                      <img
                        src={getEvidenceUrl(selectedGrievance.evidenceUrl)!}
                        alt="Defect"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <ShieldAlert className="w-8 h-8 text-[#64748b]" />
                    )}

                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/80 border border-white/10 text-[10px] font-['JetBrains_Mono'] text-white">
                      CONFIDENCE:{' '}
                      {Math.round(
                        (isLodgingNew
                          ? selectedAlertForNew?.detection?.confidence || 0.94
                          : selectedGrievance?.confidence || 0.94) * 100
                      )}
                      %
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs px-1 text-[#94a3b8]">
                    <span>Survey Unit: BUS-01 (Orin Edge Node)</span>
                    <span className="font-['JetBrains_Mono'] text-sky-400">YOLOv8-India Defect Engine</span>
                  </div>
                </div>

                {/* Spatial & Physical Specs */}
                <div className="rounded-xl border border-[#1E2638] bg-[#0E131A] p-5 space-y-3.5 text-xs">
                  <h4 className="text-[11px] font-semibold text-[#64748b] uppercase font-['JetBrains_Mono'] tracking-wider">
                    Physical Incident Lineage
                  </h4>

                  <div className="space-y-2.5">
                    <div className="flex justify-between pb-2 border-b border-[#1E2638]">
                      <span className="text-[#94a3b8]">Hazard Classification:</span>
                      <span className="font-semibold text-white uppercase">
                        {isLodgingNew
                          ? selectedAlertForNew?.type.replace('_', ' ')
                          : selectedGrievance?.defectType.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex justify-between pb-2 border-b border-[#1E2638]">
                      <span className="text-[#94a3b8]">Corridor Alignment:</span>
                      <span className="font-medium text-white">NH-30 Raipur-Simga Highway</span>
                    </div>

                    <div className="flex justify-between pb-2 border-b border-[#1E2638]">
                      <span className="text-[#94a3b8]">GNSS Coordinates:</span>
                      <span className="font-['JetBrains_Mono'] text-sky-400">
                        {isLodgingNew
                          ? `${selectedAlertForNew?.detection?.lat.toFixed(5)}, ${selectedAlertForNew?.detection?.lon.toFixed(5)}`
                          : `${selectedGrievance?.lat.toFixed(5)}, ${selectedGrievance?.lon.toFixed(5)}`}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[#94a3b8]">Municipal Severity Tier:</span>
                      <span className="font-semibold text-red-400 font-['JetBrains_Mono']">
                        {isLodgingNew
                          ? selectedAlertForNew?.severity || 'CRITICAL'
                          : selectedGrievance?.severity || 'CRITICAL'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Government Gateway Sync Status */}
                {!isLodgingNew && selectedGrievance ? (
                  <div className="rounded-xl border border-[#1E2638] bg-[#0E131A] p-5 space-y-4 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span className="font-['JetBrains_Mono'] font-bold text-white">
                          Gateway: {selectedGrievance.ticketRef}
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-['JetBrains_Mono']">SYNCED (HTTP 200)</span>
                    </div>

                    <div className="space-y-1.5 text-xs border-t border-[#1E2638] pt-3">
                      <div className="text-[#94a3b8]">Assigned Authority:</div>
                      <div className="font-medium text-white">{selectedGrievance.departmentName}</div>
                      <div className="text-[11px] text-sky-400 font-['JetBrains_Mono']">
                        {selectedGrievance.assignedOfficer} · {selectedGrievance.contactPhone}
                      </div>
                    </div>

                    {/* Stepper Status Progression */}
                    <div className="space-y-2 pt-2 border-t border-[#1E2638]">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[#94a3b8]">Resolution Lifecycle:</span>
                        <span className="font-['JetBrains_Mono'] text-sky-400">Stage {selectedGrievance.stage} of 4</span>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-['JetBrains_Mono']">
                        {[
                          { step: 1, label: 'Transmitted' },
                          { step: 2, label: 'Assigned' },
                          { step: 3, label: 'In Progress' },
                          { step: 4, label: 'Resolved' },
                        ].map((st) => (
                          <div
                            key={st.step}
                            className={`py-1.5 rounded border transition-colors ${
                              selectedGrievance.stage >= st.step
                                ? 'bg-sky-500/10 border-sky-500/30 text-sky-300 font-semibold'
                                : 'bg-[#121620] border-[#1E2638] text-[#64748b]'
                            }`}
                          >
                            {st.label}
                          </div>
                        ))}
                      </div>

                      {selectedGrievance.stage < 4 && (
                        <button
                          onClick={() => handleAdvanceStage(selectedGrievance.id)}
                          className="w-full mt-2 py-2 px-3 rounded-lg border border-[#1E2638] hover:border-sky-500/40 text-sky-400 hover:text-white text-xs font-['JetBrains_Mono'] flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Simulate Webhook Advance to Stage {selectedGrievance.stage + 1}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ------------------------------------------------------------- */}
              {/* RIGHT COLUMN: EXECUTIVE NOTICE & REVIEW (7 of 12 cols)        */}
              {/* ------------------------------------------------------------- */}
              <div className="lg:col-span-7 space-y-6">
                {isLodgingNew ? (
                  <>
                    {/* Gemini AI Auto-Draft Action Bar */}
                    <div className="rounded-xl border border-sky-500/25 bg-[#0E1522] p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <Sparkles className="w-4 h-4 text-sky-400" />
                          <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-['JetBrains_Mono']">
                            Gemini AI Statutory Notice Drafter
                          </h3>
                        </div>
                        <span className="text-[10px] font-['JetBrains_Mono'] text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                          {userGeminiKey ? 'Custom Key' : 'Default Model'}
                        </span>
                      </div>

                      <p className="text-xs text-[#94a3b8] leading-relaxed">
                        Synthesizes formal Indian municipal terminology, cites standard Indian Roads Congress codes (IRC:SP:84-2019 / Section 133 CrPC), and details engineering compaction directives.
                      </p>

                      <button
                        onClick={handleGenerateAiDraft}
                        disabled={isGeneratingAiDraft}
                        className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-[#002447] font-semibold text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAiDraft ? 'animate-spin' : ''}`} />
                        <span>
                          {isGeneratingAiDraft
                            ? 'Gemini Is Formulating Formal Notice...'
                            : 'Auto-Draft Formal Notice with Gemini AI'}
                        </span>
                      </button>
                    </div>

                    {/* Human Authority Review Zone */}
                    <div className="rounded-xl border border-[#1E2638] bg-[#0E131A] p-6 space-y-5">
                      <div className="flex items-center justify-between pb-3 border-b border-[#1E2638]">
                        <div>
                          <h3 className="text-sm font-semibold text-white">Officer Review & Refinement</h3>
                          <p className="text-xs text-[#64748b] mt-0.5">
                            Verify and edit all fields before official transmission
                          </p>
                        </div>
                        {aiDraft && (
                          <span className="text-[10px] text-emerald-400 font-['JetBrains_Mono'] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                            AI-Draft Ready
                          </span>
                        )}
                      </div>

                      {/* Notice Subject Line */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-[#94a3b8] font-medium flex justify-between">
                          <span>Official Notice Subject:</span>
                          {aiDraft && <span className="text-[10px] text-sky-400">✨ AI-Drafted</span>}
                        </label>
                        <input
                          type="text"
                          value={newSubject}
                          onChange={(e) => setNewSubject(e.target.value)}
                          className="w-full bg-[#121722] border border-[#1E2638] rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500/80 transition-colors"
                        />
                      </div>

                      {/* Statutory Legal Reference */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-[#94a3b8] font-medium">
                          Statutory Code Citation / Act:
                        </label>
                        <input
                          type="text"
                          value={newLegalRef}
                          onChange={(e) => setNewLegalRef(e.target.value)}
                          className="w-full bg-[#121722] border border-[#1E2638] rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500/80 transition-colors"
                        />
                      </div>

                      {/* Statement of Condition & Hazard Narrative */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-[#94a3b8] font-medium">
                          Statement of Hazard & Risk Assessment:
                        </label>
                        <textarea
                          rows={4}
                          value={newFormalBody}
                          onChange={(e) => setNewFormalBody(e.target.value)}
                          className="w-full bg-[#121722] border border-[#1E2638] rounded-lg p-3 text-xs text-white focus:outline-none focus:border-sky-500/80 transition-colors leading-relaxed"
                        />
                      </div>

                      {/* Prescribed Civil Engineering Directive */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-[#94a3b8] font-medium">
                          Prescribed Civil Remedial Directive:
                        </label>
                        <textarea
                          rows={3}
                          value={newActionNotes}
                          onChange={(e) => setNewActionNotes(e.target.value)}
                          className="w-full bg-[#121722] border border-[#1E2638] rounded-lg p-3 text-xs text-white focus:outline-none focus:border-sky-500/80 transition-colors leading-relaxed"
                        />
                      </div>

                      {/* Target Agency Selector */}
                      <div className="space-y-2 pt-1">
                        <label className="text-xs text-[#94a3b8] font-medium">Target Municipal Portal:</label>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {[
                            { id: 'PWD_CHHATTISGARH' as GrievancePortal, name: 'State PWD (Division 1)', desc: 'Highways & Corridors' },
                            { id: 'RMC_311' as GrievancePortal, name: 'RMC 311 Nagar Nigam', desc: 'Drainage & Minor Roads' },
                            { id: 'NHAI' as GrievancePortal, name: 'NHAI Regional Cell', desc: 'Ring Road & Bypass' },
                            { id: 'TRAFFIC_POLICE' as GrievancePortal, name: 'Traffic Police Infra', desc: 'Safety & Roadblocks' },
                          ].map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setNewTargetPortal(p.id)}
                              className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                                newTargetPortal === p.id
                                  ? 'bg-sky-500/10 border-sky-500/60 text-white'
                                  : 'bg-[#121722] border-[#1E2638] text-[#94a3b8] hover:text-white'
                              }`}
                            >
                              <div className="font-semibold text-xs">{p.name}</div>
                              <div className="text-[10px] text-[#64748b] mt-0.5">{p.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* SLA Urgency Tier */}
                      <div className="space-y-2 pt-1">
                        <label className="text-xs text-[#94a3b8] font-medium">Turnaround SLA:</label>
                        <div className="flex space-x-3 text-xs">
                          {[
                            { hours: 24, label: '24h Emergency' },
                            { hours: 48, label: '48h Standard' },
                            { hours: 72, label: '72h Routine' },
                          ].map((s) => (
                            <button
                              key={s.hours}
                              type="button"
                              onClick={() => setNewSlaHours(s.hours)}
                              className={`flex-1 py-2 rounded-lg border text-xs font-['JetBrains_Mono'] transition-colors cursor-pointer ${
                                newSlaHours === s.hours
                                  ? 'bg-sky-500/10 border-sky-500/60 text-sky-400 font-semibold'
                                  : 'bg-[#121722] border-[#1E2638] text-[#94a3b8] hover:text-white'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : selectedGrievance ? (
                  /* Existing Grievance Inspector */
                  <div className="rounded-xl border border-[#1E2638] bg-[#0E131A] p-6 space-y-6">
                    <div className="space-y-1 pb-4 border-b border-[#1E2638]">
                      <div className="text-xs text-[#64748b] font-['JetBrains_Mono']">
                        Ticket Ref: {selectedGrievance.ticketRef}
                      </div>
                      <h3 className="text-base font-semibold text-white">
                        {selectedGrievance.streetName}
                      </h3>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="text-[#64748b] font-medium">Official Maintenance Directive:</div>
                      <div className="p-4 rounded-lg bg-[#121722] border border-[#1E2638] text-[#cbd5e1] leading-relaxed whitespace-pre-line">
                        {selectedGrievance.actionRequired}
                      </div>
                    </div>

                    {selectedGrievance.resolutionNotes && (
                      <div className="space-y-2 text-xs">
                        <div className="text-emerald-400 font-medium">Resolution Verification Proof:</div>
                        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                          {selectedGrievance.resolutionNotes}
                        </div>
                      </div>
                    )}

                    {/* Chronological Audit Trail */}
                    <div className="space-y-3 pt-2">
                      <h4 className="text-xs font-semibold text-[#64748b] uppercase font-['JetBrains_Mono'] tracking-wider">
                        Inter-Agency Webhook Audit Trail
                      </h4>
                      <div className="space-y-2 text-xs">
                        {selectedGrievance.history.map((h, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg bg-[#121722] border border-[#1E2638] flex items-start space-x-3"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0"></span>
                            <div className="flex-1 space-y-0.5">
                              <div className="flex justify-between font-['JetBrains_Mono'] text-[11px]">
                                <span className="font-semibold text-white">{h.stage}</span>
                                <span className="text-[#64748b]">{new Date(h.timestamp).toLocaleTimeString()}</span>
                              </div>
                              <div className="text-[#94a3b8]">{h.note}</div>
                              <div className="text-[10px] text-[#64748b]">Actor: {h.actor}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header Bar */}
          <header className="h-16 px-8 flex items-center justify-between border-b border-[#1E2638] shrink-0 bg-[#0E131A]">
            <div>
              <div className="flex items-center space-x-2 text-xs text-[#64748b]">
                <span>Government Collaboration Gateway</span>
                <span>·</span>
                <span>Raipur, Chhattisgarh</span>
              </div>
              <h2 className="text-base font-semibold text-white tracking-tight mt-0.5">
                Complaints & Municipal Actions
              </h2>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsKeyModalOpen(true)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-[#1E2638] hover:border-sky-500/40 text-xs text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
                title="Configure Google Gemini API Key"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[11px] font-['JetBrains_Mono']">
                  {userGeminiKey ? 'Gemini: Custom Key' : 'Gemini 3.5 Flash'}
                </span>
                <Key className="w-3 h-3 text-[#64748b]" />
              </button>

              <button
                onClick={() => {
                  if (alerts.length > 0) {
                    setupNewGrievanceForm(alerts[0]);
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-[#002447] text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>+ Lodge Complaint</span>
              </button>
            </div>
          </header>

          {/* Minimalist KPI Bar */}
          <div className="px-8 py-3 border-b border-[#1E2638] bg-[#0A0E15] flex items-center space-x-8 shrink-0 overflow-x-auto text-xs">
            <div className="flex flex-col">
              <span className="text-[11px] text-[#64748b]">Lodged Complaints</span>
              <span className="text-sm font-semibold text-white font-['JetBrains_Mono'] mt-0.5">{totalCount}</span>
            </div>
            <div className="w-px h-6 bg-[#1E2638]"></div>

            <div className="flex flex-col">
              <span className="text-[11px] text-sky-400">Under Repair</span>
              <span className="text-sm font-semibold text-white font-['JetBrains_Mono'] mt-0.5">{inProgressCount}</span>
            </div>
            <div className="w-px h-6 bg-[#1E2638]"></div>

            <div className="flex flex-col">
              <span className="text-[11px] text-red-400">SLA At Risk / Overdue</span>
              <span className="text-sm font-semibold text-white font-['JetBrains_Mono'] mt-0.5">{overdueCount}</span>
            </div>
            <div className="w-px h-6 bg-[#1E2638]"></div>

            <div className="flex flex-col">
              <span className="text-[11px] text-emerald-400">Resolved with Proof</span>
              <span className="text-sm font-semibold text-white font-['JetBrains_Mono'] mt-0.5">{resolvedCount}</span>
            </div>
            <div className="w-px h-6 bg-[#1E2638]"></div>

            <div className="flex flex-col">
              <span className="text-[11px] text-[#64748b]">Avg Turnaround</span>
              <span className="text-sm font-semibold text-white font-['JetBrains_Mono'] mt-0.5">34.2 hrs</span>
            </div>
          </div>

          {/* Clean Toolbar */}
          <div className="px-8 py-3.5 border-b border-[#1E2638] bg-[#0E131A] flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Filter Pills */}
            <div className="flex items-center space-x-2 text-xs">
              <button
                onClick={() => setPortalFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  portalFilter === 'ALL'
                    ? 'bg-sky-500/10 border-sky-500/60 text-sky-300 font-semibold'
                    : 'border-[#1E2638] text-[#94a3b8] hover:text-white hover:bg-[#121722]'
                }`}
              >
                All Portals ({totalCount})
              </button>
              <button
                onClick={() => setPortalFilter('PWD_CHHATTISGARH')}
                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  portalFilter === 'PWD_CHHATTISGARH'
                    ? 'bg-sky-500/10 border-sky-500/60 text-sky-300 font-semibold'
                    : 'border-[#1E2638] text-[#94a3b8] hover:text-white hover:bg-[#121722]'
                }`}
              >
                State PWD
              </button>
              <button
                onClick={() => setPortalFilter('RMC_311')}
                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  portalFilter === 'RMC_311'
                    ? 'bg-emerald-500/10 border-emerald-500/60 text-emerald-300 font-semibold'
                    : 'border-[#1E2638] text-[#94a3b8] hover:text-white hover:bg-[#121722]'
                }`}
              >
                RMC 311
              </button>
              <button
                onClick={() => setPortalFilter('NHAI')}
                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  portalFilter === 'NHAI'
                    ? 'bg-purple-500/10 border-purple-500/60 text-purple-300 font-semibold'
                    : 'border-[#1E2638] text-[#94a3b8] hover:text-white hover:bg-[#121722]'
                }`}
              >
                NHAI
              </button>
              <button
                onClick={() => setPortalFilter('TRAFFIC_POLICE')}
                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  portalFilter === 'TRAFFIC_POLICE'
                    ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-semibold'
                    : 'border-[#1E2638] text-[#94a3b8] hover:text-white hover:bg-[#121722]'
                }`}
              >
                Traffic Police
              </button>
            </div>

            {/* Search & Status Filters */}
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#64748b]" />
                <input
                  type="text"
                  placeholder="Search ID, street, defect..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-[#121722] border border-[#1E2638] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#64748b] focus:outline-none focus:border-sky-500/80 w-60"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[#121722] border border-[#1E2638] rounded-lg px-3 py-1.5 text-xs text-[#94a3b8] focus:outline-none focus:border-sky-500/80"
              >
                <option value="ALL">All Statuses</option>
                <option value="TRANSMITTED">Transmitted</option>
                <option value="WARD_ASSIGNED">Ward Assigned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
          </div>

          {/* Full-Width Enterprise Table */}
          <div className="flex-1 overflow-auto bg-[#090C10]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#0E131A] border-b border-[#1E2638] text-[#64748b] text-[11px] sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-6 font-medium">Tracking ID</th>
                  <th className="py-3 px-6 font-medium">Hazard & Evidence</th>
                  <th className="py-3 px-6 font-medium">Corridor & Location</th>
                  <th className="py-3 px-6 font-medium">Department</th>
                  <th className="py-3 px-6 font-medium">SLA Deadline</th>
                  <th className="py-3 px-6 font-medium">Status</th>
                  <th className="py-3 px-6 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2638]/60">
                {filteredGrievances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-[#64748b]">
                      No grievances matching current filter.
                    </td>
                  </tr>
                ) : (
                  filteredGrievances.map((g) => {
                    const sla = calculateSla(g.slaDeadline);
                    const portalBadge = getPortalBadge(g.targetPortal);
                    const statusBadge = getStatusBadge(g.status);
                    const imageSrc = getEvidenceUrl(g.evidenceUrl);

                    return (
                      <tr
                        key={g.id}
                        onClick={() => handleRowClick(g)}
                        className="hover:bg-[#101622] transition-colors cursor-pointer group"
                      >
                        {/* ID */}
                        <td className="py-3.5 px-6">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-['JetBrains_Mono'] font-medium text-sky-400">
                              {g.id}
                            </span>
                            <button
                              onClick={(e) => handleCopyId(g.id, e)}
                              title="Copy Tracking ID"
                              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-white transition-opacity text-[#64748b]"
                            >
                              {copiedId === g.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <div className="text-[10px] text-[#64748b] font-['JetBrains_Mono'] mt-0.5">
                            {g.ticketRef}
                          </div>
                        </td>

                        {/* Defect */}
                        <td className="py-3.5 px-6">
                          <div className="flex items-center space-x-3">
                            <div className="w-11 h-8 rounded bg-[#121722] border border-[#1E2638] overflow-hidden shrink-0 flex items-center justify-center">
                              {imageSrc ? (
                                <img
                                  src={imageSrc}
                                  alt="Defect"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <ShieldAlert className="w-3.5 h-3.5 text-[#64748b]" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-white uppercase text-[11px]">
                                {g.defectType.replace('_', ' ')}
                              </div>
                              <div className="text-[10px] text-[#64748b] font-['JetBrains_Mono']">
                                {Math.round(g.confidence * 100)}% conf
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Corridor */}
                        <td className="py-3.5 px-6">
                          <div className="text-[#cbd5e1] font-medium truncate max-w-xs">{g.streetName}</div>
                          <div className="text-[10px] text-[#64748b] font-['JetBrains_Mono'] mt-0.5">
                            {g.lat.toFixed(4)}, {g.lon.toFixed(4)}
                          </div>
                        </td>

                        {/* Department */}
                        <td className="py-3.5 px-6">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${portalBadge.color}`}
                          >
                            {portalBadge.label}
                          </span>
                          <div className="text-[10px] text-[#64748b] mt-0.5 truncate max-w-[160px]">
                            {g.assignedOfficer}
                          </div>
                        </td>

                        {/* SLA */}
                        <td className="py-3.5 px-6">
                          <span
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] border ${sla.color}`}
                          >
                            <Clock className="w-3 h-3" />
                            <span>{sla.label}</span>
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-6">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${statusBadge.color}`}
                          >
                            {statusBadge.label}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-6 text-right">
                          <span className="text-xs text-sky-400 group-hover:text-white font-medium transition-colors">
                            View Dossier &rarr;
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

      {/* ========================================================================= */}
      {/* GEMINI API KEY MODAL (CLEAN, MINIMALIST DIALOG)                           */}
      {/* ========================================================================= */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#0E131A] border border-[#1E2638] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex justify-between items-start border-b border-[#1E2638] pb-3">
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">Gemini API Settings</h3>
              </div>
              <button
                onClick={() => setIsKeyModalOpen(false)}
                className="text-[#64748b] hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-[#94a3b8] leading-relaxed">
                By default, the platform uses the system Gemini API key from <code className="text-sky-400">backend/.env</code>. Paste a personal API key to override it in your current browser session:
              </p>

              <div className="space-y-1">
                <label className="text-[11px] text-[#64748b] font-medium">Gemini API Key (AI Studio):</label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-[#121722] border border-[#1E2638] rounded-lg p-2.5 text-xs text-white font-['JetBrains_Mono'] focus:outline-none focus:border-sky-500/80"
                />
              </div>

              <div className="p-3 rounded-lg bg-[#121722] border border-[#1E2638] text-[11px] flex justify-between text-[#94a3b8]">
                <span>Active Model Target:</span>
                <span className="text-sky-400 font-['JetBrains_Mono'] font-medium">gemini-3.5-flash</span>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-[#1E2638]">
              <button
                onClick={() => setIsKeyModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-[#94a3b8] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGeminiKey}
                className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-[#002447] font-semibold text-xs transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
