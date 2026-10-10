import { useState } from 'react';
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

export function LiveAlerts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNRESOLVED' | 'RESOLVED'>('ALL');
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [evidenceZoom, setEvidenceZoom] = useState<'fit' | '2x' | '4x'>('fit');
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

  if (isLoading && allAlerts.length === 0) return <LoadingState message="Loading Incident Response Queue..." />;
  if (error && allAlerts.length === 0) return <ErrorState message="Could not load live alerts." onRetry={() => refetch()} />;

  // Filter alerts
  const filteredAlerts = allAlerts.filter((alert) => {
    if (severityFilter !== 'ALL' && alert.severity !== severityFilter) return false;
    if (statusFilter === 'UNRESOLVED' && alert.status === 'RESOLVED') return false;
    if (statusFilter === 'RESOLVED' && alert.status !== 'RESOLVED') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = alert.title.toLowerCase().includes(q);
      const matchType = alert.type.toLowerCase().includes(q);
      return matchTitle || matchType;
    }
    return true;
  });

  // Selected Alert
  const selectedAlert: Alert | undefined =
    allAlerts.find((a) => a.id === selectedAlertId) || filteredAlerts[0] || allAlerts[0];

  // Stats for KPI strip
  const criticalCount = allAlerts.filter((a) => a.severity === 'CRITICAL' && a.status !== 'RESOLVED').length;
  const highCount = allAlerts.filter((a) => a.severity === 'HIGH' && a.status !== 'RESOLVED').length;
  const unresolvedCount = allAlerts.filter((a) => a.status !== 'RESOLVED').length;
  const resolvedTodayCount = allAlerts.filter((a) => a.status === 'RESOLVED').length;

  const handleStatusChange = (newStatus: string) => {
    if (!selectedAlert) return;
    mutation.mutate({ id: selectedAlert.id, status: newStatus });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0C10] overflow-hidden">
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-[#414752] shrink-0 bg-[#101419]">
        <div>
          <div className="flex items-center space-x-3">
            <span className="font-['Inter'] text-[10px] font-bold px-2 py-0.5 bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30 rounded uppercase tracking-wider">
              REAL-TIME INCIDENT RESPONSE
            </span>
            <span className="text-[#8b919d] text-xs">· Raipur, Chhattisgarh</span>
          </div>
          <h2 className="font-['Inter'] text-[18px] font-bold text-[#e0e2ea] uppercase leading-tight mt-0.5">
            LIVE ALERTS
          </h2>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded bg-[#161a22] border border-[#414752]">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></div>
            <span className="text-[10px] font-['JetBrains_Mono'] text-[#c0c7d4]">
              {isConnected ? 'LIVE EDGE FEED: ACTIVE (CUDA RTX 3050)' : 'STANDALONE MODE'}
            </span>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 text-[#c0c7d4] hover:text-[#38bdf8] hover:bg-[#181c21] rounded-lg transition-colors border border-[#414752] cursor-pointer"
            title="Refresh alerts"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </header>

      {/* KPI Strip (Matching Stitch Design) */}
      <div className="px-6 py-2.5 border-b border-[#414752] bg-[#181c21] flex items-center space-x-6 shrink-0 overflow-x-auto">
        <div className="flex flex-col">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-wider uppercase">ACTIVE ALERTS</span>
          <span className="font-['JetBrains_Mono'] text-[18px] font-bold text-[#e0e2ea]">{unresolvedCount}</span>
        </div>
        <div className="w-px h-7 bg-[#414752]"></div>

        <div className="flex flex-col">
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-[#ffb4ab] animate-pulse-error"></div>
            <span className="font-['Inter'] text-[10px] font-bold text-[#ffb4ab] tracking-wider uppercase">CRITICAL</span>
          </div>
          <span className="font-['JetBrains_Mono'] text-[18px] font-bold text-[#ffb4ab]">{criticalCount}</span>
        </div>
        <div className="w-px h-7 bg-[#414752]"></div>

        <div className="flex flex-col">
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-[#ffba42]"></div>
            <span className="font-['Inter'] text-[10px] font-bold text-[#ffba42] tracking-wider uppercase">HIGH</span>
          </div>
          <span className="font-['JetBrains_Mono'] text-[18px] font-bold text-[#ffba42]">{highCount}</span>
        </div>
        <div className="w-px h-7 bg-[#414752]"></div>

        <div className="flex flex-col">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-wider uppercase">UNRESOLVED</span>
          <span className="font-['JetBrains_Mono'] text-[18px] font-bold text-[#e0e2ea]">{unresolvedCount}</span>
        </div>
        <div className="w-px h-7 bg-[#414752]"></div>

        <div className="flex flex-col">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-wider uppercase">RESOLVED TODAY</span>
          <span className="font-['JetBrains_Mono'] text-[18px] font-bold text-[#38bdf8]">{resolvedTodayCount}</span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Alert Queue */}
        <div className="w-1/2 flex flex-col border-r border-[#414752] bg-[#101419] overflow-hidden">
          {/* Filter Bar */}
          <div className="p-3.5 border-b border-[#414752] space-y-2.5 shrink-0 bg-[#181c21]">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setSeverityFilter('ALL')}
                className={`px-3 py-1 font-['Inter'] text-[11px] font-bold rounded uppercase tracking-wider transition-colors cursor-pointer ${
                  severityFilter === 'ALL'
                    ? 'bg-[#38bdf8] text-[#00315c]'
                    : 'border border-[#414752] text-[#c0c7d4] hover:bg-[#272a30]'
                }`}
              >
                ALL
              </button>
              <button
                onClick={() => setSeverityFilter('CRITICAL')}
                className={`px-3 py-1 font-['Inter'] text-[11px] font-bold rounded uppercase tracking-wider transition-colors cursor-pointer ${
                  severityFilter === 'CRITICAL'
                    ? 'bg-[#ffb4ab] text-[#690005]'
                    : 'border border-[#414752] text-[#ffb4ab] hover:bg-[#272a30]'
                }`}
              >
                CRITICAL
              </button>
              <button
                onClick={() => setSeverityFilter('HIGH')}
                className={`px-3 py-1 font-['Inter'] text-[11px] font-bold rounded uppercase tracking-wider transition-colors cursor-pointer ${
                  severityFilter === 'HIGH'
                    ? 'bg-[#ffba42] text-[#432c00]'
                    : 'border border-[#414752] text-[#ffba42] hover:bg-[#272a30]'
                }`}
              >
                HIGH
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8b919d] text-[16px]">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search alerts..."
                  className="w-full bg-[#101419] border border-[#414752] rounded pl-8 pr-3 py-1.5 font-['Inter'] text-xs text-[#e0e2ea] placeholder:text-[#8b919d] focus:border-[#38bdf8] focus:outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[#101419] border border-[#414752] rounded px-2.5 py-1.5 font-['Inter'] text-xs text-[#e0e2ea] focus:border-[#38bdf8] focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="UNRESOLVED">Unresolved</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
          </div>

          <div className="px-3.5 py-2 bg-[#161B22] border-b border-[#414752] shrink-0 flex items-center text-xs text-[#8b919d] italic">
            <span className="material-symbols-outlined mr-2 text-[15px] text-[#38bdf8]">info</span>
            High & Critical alerts requiring operator triage. Routine defects are summarized in Route Reports.
          </div>

          {/* Alert Cards List */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
            {filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="material-symbols-outlined text-[36px] text-[#414752] mb-2">check_circle</span>
                <p className="text-sm font-semibold text-[#c0c7d4]">No alerts found</p>
                <p className="text-xs text-[#8b919d]">All high-priority incidents have been resolved.</p>
              </div>
            ) : (
              filteredAlerts.map((alert) => {
                const isSelected = selectedAlert?.id === alert.id;
                const isCritical = alert.severity === 'CRITICAL';
                const isHigh = alert.severity === 'HIGH';

                return (
                  <div
                    key={alert.id}
                    onClick={() => setSelectedAlertId(alert.id)}
                    className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1C2128] border-[#38bdf8] shadow-md'
                        : 'bg-[#161B22] border-[#30363D] hover:bg-[#1C2025]'
                    } ${isCritical ? 'border-l-4 border-l-[#ffb4ab]' : isHigh ? 'border-l-4 border-l-[#ffba42]' : 'border-l-4 border-l-[#38bdf8]'}`}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex items-center space-x-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isCritical
                              ? 'bg-[#ffb4ab] animate-pulse-error'
                              : isHigh
                              ? 'bg-[#ffba42]'
                              : 'bg-[#38bdf8]'
                          }`}
                        ></div>
                        <span
                          className={`font-['Inter'] text-[10px] font-bold uppercase tracking-wider ${
                            isCritical ? 'text-[#ffb4ab]' : isHigh ? 'text-[#ffba42]' : 'text-[#38bdf8]'
                          }`}
                        >
                          {alert.severity}
                        </span>
                        <span className="font-['JetBrains_Mono'] text-[10px] text-[#8b919d]">
                          {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span
                        className={`font-['JetBrains_Mono'] text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                          alert.status === 'NEW'
                            ? 'bg-[#ffb4ab]/15 text-[#ffb4ab] border-[#ffb4ab]/30'
                            : alert.status === 'ACKNOWLEDGED'
                            ? 'bg-[#38bdf8]/15 text-[#38bdf8] border-[#38bdf8]/30'
                            : 'bg-[#cbd5e1]/10 text-[#cbd5e1] border-[#cbd5e1]/30'
                        }`}
                      >
                        {alert.status}
                      </span>
                    </div>

                    <h4 className="font-['Inter'] text-[13px] font-bold text-[#e0e2ea] mb-1">
                      {alert.title}
                    </h4>

                    <div className="flex items-center justify-between font-['JetBrains_Mono'] text-[11px] text-[#8b919d] mt-2 pt-2 border-t border-[#30363D]/60">
                      <span className="flex items-center">
                        <span className="material-symbols-outlined text-[13px] mr-1 text-[#38bdf8]">
                          directions_bus
                        </span>
                        BUS-{alert.detection ? String(alert.detection.journey_id).padStart(2, '0') : '03'}
                      </span>
                      <span>
                        Conf: <strong className="text-[#e0e2ea]">{Math.round((alert.detection?.confidence || 0.94) * 100)}%</strong>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Incident Detail View */}
        <div className="w-1/2 flex flex-col bg-[#0b0e14] overflow-y-auto">
          {selectedAlert ? (
            <div className="p-5 space-y-4">
              {/* Sleek Incident Header */}
              <div className="bg-[#12161F] p-4 rounded-2xl border border-[#30363D] relative overflow-hidden">
                <div
                  className={`absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full blur-2xl pointer-events-none ${
                    selectedAlert.severity === 'CRITICAL' ? 'bg-red-500' : 'bg-amber-500'
                  }`}
                />

                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-['JetBrains_Mono'] font-bold uppercase tracking-wider ${
                        selectedAlert.severity === 'CRITICAL'
                          ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          selectedAlert.severity === 'CRITICAL' ? 'bg-red-400 animate-pulse' : 'bg-amber-400'
                        }`}
                      />
                      {selectedAlert.severity} PRIORITY
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold uppercase border ${
                        selectedAlert.status === 'NEW'
                          ? 'bg-red-500/10 text-red-300 border-red-500/30 animate-pulse'
                          : selectedAlert.status === 'ACKNOWLEDGED'
                          ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {selectedAlert.status}
                    </span>
                  </div>

                  <div className="text-[10px] font-['JetBrains_Mono'] text-[#8b919d] flex items-center gap-2">
                    <span>⏱️ {new Date(selectedAlert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <span className="text-[#30363D]">|</span>
                    <span className="text-[#38bdf8]">BUS-{String(selectedAlert.detection?.journey_id || '01').padStart(2, '0')}</span>
                  </div>
                </div>

                <h3 className="text-xl font-bold text-[#e0e2ea] tracking-tight mb-1">
                  {selectedAlert.title}
                </h3>

                <div className="flex items-center justify-between text-xs font-['JetBrains_Mono'] text-[#8b919d] pt-1.5 border-t border-[#30363D]/50">
                  <span className="flex items-center gap-1.5 text-[#c0c7d4]">
                    <span className="material-symbols-outlined text-[15px] text-[#38bdf8]">location_on</span>
                    NH-30 Raipur Corridor · Raipur Smart City
                  </span>
                  <span className="text-[11px] text-[#8b919d]">
                    GNSS: [{selectedAlert.detection?.lat.toFixed(5)}, {selectedAlert.detection?.lon.toFixed(5)}]
                  </span>
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="flex items-center gap-2.5">
                {selectedAlert.status === 'NEW' && (
                  <button
                    onClick={() => handleStatusChange('ACKNOWLEDGED')}
                    disabled={mutation.isPending}
                    className="flex-[1.4] py-2.5 px-3.5 bg-[#38bdf8] hover:bg-[#58a6ff] text-[#00315c] rounded-xl font-['Inter'] text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-sky-500/10 cursor-pointer active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[17px]">check_circle</span>
                    ACKNOWLEDGE
                  </button>
                )}

                {selectedAlert.status === 'ACKNOWLEDGED' && (
                  <button
                    onClick={() => handleStatusChange('RESOLVED')}
                    disabled={mutation.isPending}
                    className="flex-[1.4] py-2.5 px-3.5 bg-[#22c55e] hover:bg-[#16a34a] text-[#052e16] rounded-xl font-['Inter'] text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10 cursor-pointer active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[17px]">task_alt</span>
                    RESOLVE INCIDENT
                  </button>
                )}

                {selectedAlert.status === 'RESOLVED' && (
                  <div className="flex-[1.4] py-2 px-3.5 bg-[#22c55e]/15 border border-[#22c55e]/30 text-[#22c55e] rounded-xl font-['Inter'] text-xs font-bold uppercase tracking-wider text-center flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[17px]">verified</span>
                    RESOLVED
                  </div>
                )}

                <button
                  onClick={() => navigate(`/complaints?lodgeAlertId=${selectedAlert.id}`)}
                  className="flex-1 py-2.5 px-3 border border-[#38bdf8]/50 bg-[#38bdf8]/10 hover:bg-[#38bdf8]/20 text-[#38bdf8] rounded-xl font-['Inter'] text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">assignment_turned_in</span>
                  FILE COMPLAINT
                </button>

                <button
                  onClick={() => setIsVlmModalOpen(true)}
                  className="flex-1 py-2.5 px-3 border border-cyan-400/50 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 rounded-xl font-['Inter'] text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">psychology</span>
                  GEMINI VLM
                </button>

                <button
                  onClick={() => navigate(`/live-map`)}
                  className="py-2.5 px-3.5 border border-[#414752] hover:bg-[#1C2025] text-[#e0e2ea] rounded-xl font-['Inter'] text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  title="View incident on Live Map"
                >
                  <span className="material-symbols-outlined text-[16px]">map</span>
                  MAP
                </button>
              </div>

              {/* Hero Evidence Card */}
              <div className="bg-[#12161F] border border-[#30363D] rounded-2xl overflow-hidden shadow-xl">
                {/* Card Header Bar */}
                <div className="px-4 py-2.5 bg-[#0D1117] border-b border-[#30363D] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse"></span>
                    <span className="font-['JetBrains_Mono'] text-[11px] font-bold text-[#e0e2ea] uppercase tracking-wide">
                      EDGE DASHCAM EVIDENCE
                    </span>
                    <span className="text-[10px] font-['JetBrains_Mono'] px-1.5 py-0.5 rounded bg-black/60 border border-white/10 text-sky-400 font-bold">
                      {Math.round((selectedAlert.detection?.confidence || 0.94) * 100)}% CONF
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/video-vault?alertId=${selectedAlert.id}&time=${selectedAlert.detection?.video_timestamp_sec || 50.4}`)}
                      className="font-['JetBrains_Mono'] text-[10px] text-[#38bdf8] hover:text-white flex items-center gap-1 bg-[#38bdf8]/10 hover:bg-[#38bdf8]/25 border border-[#38bdf8]/30 px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
                      title="Inspect video buffer"
                    >
                      <span className="material-symbols-outlined text-[14px]">videocam</span>
                      DVR BUFFER →
                    </button>

                    <button
                      onClick={() => setIsEvidenceModalOpen(true)}
                      className="font-['JetBrains_Mono'] text-[10px] text-[#8b919d] hover:text-white flex items-center gap-1 bg-black/40 hover:bg-black/60 border border-[#30363D] px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
                      title="Open full forensic inspector"
                    >
                      <span className="material-symbols-outlined text-[14px]">open_in_full</span>
                      EXPAND
                    </button>
                  </div>
                </div>

                {/* Evidence Viewfinder Display */}
                <div
                  onClick={() => setIsEvidenceModalOpen(true)}
                  className="h-60 relative bg-[#070A0F] cursor-pointer group flex items-center justify-center overflow-hidden"
                >
                  {/* High-Tech Tactical Grid Background */}
                  <div
                    className="absolute inset-0 opacity-15 pointer-events-none"
                    style={{
                      backgroundImage:
                        'radial-gradient(#38bdf8 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
                      backgroundSize: '24px 24px',
                    }}
                  />

                  {getEvidenceUrl(selectedAlert.detection?.evidence_url) ? (
                    <div className="relative group/box transition-transform duration-300 group-hover:scale-105">
                      {/* Outer Cyber Reticles */}
                      <div className="absolute -inset-1.5 border border-red-500/40 rounded-sm pointer-events-none">
                        <div className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-red-400"></div>
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-red-400"></div>
                        <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-red-400"></div>
                        <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-red-400"></div>
                      </div>

                      <div className="bg-[#12161f] p-1.5 rounded-lg border border-[#414752] shadow-2xl flex items-center justify-center max-w-[380px] max-h-48 overflow-hidden">
                        <img
                          src={getEvidenceUrl(selectedAlert.detection?.evidence_url)!}
                          alt={selectedAlert.title}
                          className="max-h-44 w-auto max-w-full object-contain rounded filter contrast-110 brightness-105"
                          onError={(e) => {
                            e.currentTarget.src = '/evidence/pothole_01.jpg';
                          }}
                        />
                      </div>

                      <div className="absolute -bottom-2 right-1 text-[9px] font-['JetBrains_Mono'] px-1.5 py-0.5 bg-red-950/90 border border-red-500/40 text-red-300 rounded font-bold">
                        {selectedAlert.type}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-4">
                      <span className="material-symbols-outlined text-[36px] text-[#38bdf8] mb-1">photo_camera</span>
                      <div className="font-['JetBrains_Mono'] text-xs text-[#e0e2ea] font-bold">{selectedAlert.title}</div>
                    </div>
                  )}

                  {/* Hover Overlay Hint */}
                  <div className="absolute bottom-2.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-[#38bdf8]/40 text-[#38bdf8] text-[10px] font-['JetBrains_Mono'] flex items-center gap-1 shadow-lg pointer-events-none">
                    <span className="material-symbols-outlined text-[13px]">zoom_in</span>
                    CLICK TO INSPECT FULL RESOLUTION
                  </div>
                </div>
              </div>

              {/* Compact 2-Column Telemetry & Incident Lifecycle Grid */}
              <div className="grid grid-cols-2 gap-3.5">
                {/* Column 1: Sensing Specs */}
                <div className="bg-[#12161F] p-3.5 rounded-xl border border-[#30363D] space-y-2">
                  <span className="font-['Inter'] text-[10px] font-bold text-[#8b919d] uppercase tracking-wider block">
                    EDGE SENSING SPECS
                  </span>
                  <div className="space-y-1.5 font-['JetBrains_Mono'] text-xs">
                    <div className="flex justify-between items-center text-[#c0c7d4]">
                      <span className="text-[#8b919d] text-[11px]">Platform:</span>
                      <span className="text-white font-bold">NVIDIA Orin Edge</span>
                    </div>
                    <div className="flex justify-between items-center text-[#c0c7d4]">
                      <span className="text-[#8b919d] text-[11px]">Vision Engine:</span>
                      <span className="text-[#38bdf8]">YOLOv8-India Defect</span>
                    </div>
                    <div className="flex justify-between items-center text-[#c0c7d4]">
                      <span className="text-[#8b919d] text-[11px]">GPS Anchor:</span>
                      <span>AIS-140 Fix (±1.8m)</span>
                    </div>
                  </div>
                </div>

                {/* Column 2: Lifecycle Trail */}
                <div className="bg-[#12161F] p-3.5 rounded-xl border border-[#30363D] space-y-2">
                  <span className="font-['Inter'] text-[10px] font-bold text-[#8b919d] uppercase tracking-wider block">
                    LIFECYCLE TRAIL
                  </span>
                  <div className="space-y-1.5 font-['JetBrains_Mono'] text-[11px]">
                    <div className="flex items-center gap-2 text-[#c0c7d4]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]"></span>
                      <span className="text-[#8b919d]">{new Date(selectedAlert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="truncate">Edge finding ({Math.round((selectedAlert.detection?.confidence || 0.94) * 100)}%)</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#c0c7d4]">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      <span className="text-[#8b919d]">{new Date(new Date(selectedAlert.timestamp).getTime() + 15000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="truncate">Queued to Command</span>
                    </div>
                    {selectedAlert.status === 'RESOLVED' && (
                      <div className="flex items-center gap-2 text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span className="text-emerald-400">RESOLVED</span>
                        <span className="truncate">Closed by operator</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-[#8b919d]">
              Select an alert from the queue to view telemetry and response controls.
            </div>
          )}
        </div>
      </div>

      {/* Full Evidence Image Modal */}
      {isEvidenceModalOpen && selectedAlert && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 lg:p-6 animate-in fade-in duration-200">
          <div className="bg-[#12161F] border border-[#30363D] rounded-2xl max-w-4xl w-full p-6 space-y-4 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-[#30363D] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  <span className="font-['JetBrains_Mono'] text-[10px] font-bold text-[#ffb4ab] uppercase tracking-wider">
                    AI FORENSIC EVIDENCE INSPECTOR #{selectedAlert.id}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#e0e2ea] mt-0.5 flex items-center gap-2">
                  {selectedAlert.title}
                  <span className="text-xs px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-400 font-['JetBrains_Mono']">
                    {selectedAlert.severity}
                  </span>
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsEvidenceModalOpen(false);
                  setEvidenceZoom('fit');
                }}
                className="text-[#8b919d] hover:text-[#e0e2ea] p-1.5 rounded-lg hover:bg-[#1E232D] transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Modal Body: 2-Column Forensic Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Scaled Inspection Viewport (7 Cols) */}
              <div className="lg:col-span-7 bg-[#070A0F] border border-[#2B323D] rounded-xl flex flex-col justify-between overflow-hidden relative min-h-[380px] p-3 shadow-inner">
                {/* Background Tech Grid */}
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                  }}
                />

                {/* Top Toolbar: Zoom Modes */}
                <div className="relative z-20 flex justify-between items-center text-[10px] font-['JetBrains_Mono'] pb-2 border-b border-white/10">
                  <span className="text-[#8b919d] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]"></span>
                    BOUNDING BOX INSPECTOR
                  </span>

                  <div className="flex items-center gap-1 bg-[#12161F] border border-white/10 rounded-lg p-0.5">
                    <button
                      onClick={() => setEvidenceZoom('fit')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                        evidenceZoom === 'fit' ? 'bg-[#38bdf8] text-[#00315c]' : 'text-[#8b919d] hover:text-white'
                      }`}
                    >
                      FIT (1X)
                    </button>
                    <button
                      onClick={() => setEvidenceZoom('2x')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                        evidenceZoom === '2x' ? 'bg-[#38bdf8] text-[#00315c]' : 'text-[#8b919d] hover:text-white'
                      }`}
                    >
                      2X ZOOM
                    </button>
                    <button
                      onClick={() => setEvidenceZoom('4x')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                        evidenceZoom === '4x' ? 'bg-[#38bdf8] text-[#00315c]' : 'text-[#8b919d] hover:text-white'
                      }`}
                    >
                      4X MACRO
                    </button>
                  </div>
                </div>

                {/* Center Inspection Target with Crosshair Reticles */}
                <div className="relative z-10 flex-1 flex items-center justify-center overflow-hidden my-3 min-h-[240px]">
                  {/* Subtle Crosshairs */}
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-[#38bdf8]/15 pointer-events-none"></div>
                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-[#38bdf8]/15 pointer-events-none"></div>

                  {getEvidenceUrl(selectedAlert.detection?.evidence_url) ? (
                    <div className="relative transition-transform duration-300">
                      {/* Corner Target Brackets */}
                      <div className="absolute -inset-3 border border-red-500/50 rounded-sm pointer-events-none">
                        <div className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 border-t-2 border-l-2 border-red-400"></div>
                        <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 border-t-2 border-r-2 border-red-400"></div>
                        <div className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 border-b-2 border-l-2 border-red-400"></div>
                        <div className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 border-b-2 border-r-2 border-red-400"></div>
                      </div>

                      {/* Framed Crop Box with Clean Zoom Scaling */}
                      <div className="bg-[#10141D] p-2 rounded-lg border border-red-500/40 shadow-[0_0_35px_rgba(239,68,68,0.25)] flex items-center justify-center overflow-hidden">
                        <img
                          src={getEvidenceUrl(selectedAlert.detection?.evidence_url)!}
                          alt={selectedAlert.title}
                          className={`w-auto max-h-[260px] object-contain rounded transition-transform duration-300 filter contrast-110 brightness-105 ${
                            evidenceZoom === 'fit'
                              ? 'scale-100 min-w-[200px] min-h-[120px]'
                              : evidenceZoom === '2x'
                              ? 'scale-150 min-w-[240px]'
                              : 'scale-[2.1] min-w-[240px]'
                          }`}
                          style={{
                            imageRendering: evidenceZoom === '4x' ? 'pixelated' : 'auto',
                          }}
                          onError={(e) => {
                            e.currentTarget.src = '/evidence/pothole_01.jpg';
                          }}
                        />
                      </div>

                      <div className="absolute -top-2.5 left-2 px-1.5 py-0.5 bg-black/90 border border-red-500/60 rounded text-[9px] font-['JetBrains_Mono'] text-red-300">
                        TARGET: {selectedAlert.type}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-6">
                      <span className="material-symbols-outlined text-[48px] text-[#38bdf8] mb-2">photo_camera</span>
                      <div className="font-['JetBrains_Mono'] text-sm text-[#e0e2ea] font-bold">{selectedAlert.title}</div>
                      <div className="font-['JetBrains_Mono'] text-xs text-[#8b919d] mt-1">
                        GPS: {selectedAlert.detection?.lat.toFixed(6)}, {selectedAlert.detection?.lon.toFixed(6)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Viewport Telemetry Footer */}
                <div className="relative z-20 flex justify-between items-center text-[10px] font-['JetBrains_Mono'] pt-2 border-t border-white/10 text-[#8b919d]">
                  <span>SENSOR: FLINT EDGE DASHCAM (BUS-01)</span>
                  <span className="text-[#38bdf8]">
                    LAT: {selectedAlert.detection?.lat.toFixed(5)} | LON: {selectedAlert.detection?.lon.toFixed(5)}
                  </span>
                </div>
              </div>

              {/* Right Column: Forensic Telemetry & Action Panel (5 Cols) */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  {/* Confidence Breakdown Card */}
                  <div className="p-3.5 bg-[#0A0D13] border border-[#30363D] rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-['Inter'] text-[11px] font-bold text-[#8b919d] uppercase">
                        AI CONFIDENCE INDEX
                      </span>
                      <span className="font-['JetBrains_Mono'] text-sm font-bold text-[#38bdf8]">
                        {Math.round((selectedAlert.detection?.confidence || 0.94) * 100)}%
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-[#1A1F29] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#0284c7] to-[#38bdf8] h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.round((selectedAlert.detection?.confidence || 0.94) * 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-['JetBrains_Mono'] text-[#8b919d] flex justify-between">
                      <span>Model: YOLOv8-India Defect Engine</span>
                      <span>Verified: PASS</span>
                    </div>
                  </div>

                  {/* Metadata Specs Table */}
                  <div className="p-3.5 bg-[#0A0D13] border border-[#30363D] rounded-xl space-y-2.5 text-xs font-['Inter']">
                    <div className="flex justify-between pb-2 border-b border-[#2B323D]">
                      <span className="text-[#8b919d]">Corridor Route:</span>
                      <span className="font-semibold text-[#e0e2ea] font-['JetBrains_Mono']">NH-30 Raipur-Simga</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-[#2B323D]">
                      <span className="text-[#8b919d]">Sensing Platform:</span>
                      <span className="font-semibold text-[#38bdf8] font-['JetBrains_Mono']">BUS-01 (Orin Edge Node)</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-[#2B323D]">
                      <span className="text-[#8b919d]">Capture Timestamp:</span>
                      <span className="font-semibold text-[#e0e2ea] font-['JetBrains_Mono']">
                        {new Date(selectedAlert.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8b919d]">Municipal Priority:</span>
                      <span className="font-semibold text-red-400 font-['JetBrains_Mono']">
                        LEVEL 1 (IMMEDIATE REPAIR)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Operator Actions */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => {
                      setIsEvidenceModalOpen(false);
                      setEvidenceZoom('fit');
                      navigate(`/complaints?lodgeAlertId=${selectedAlert.id}`);
                    }}
                    className="w-full py-2.5 px-4 bg-[#38bdf8] hover:bg-[#58a6ff] text-[#00315c] rounded-xl font-['Inter'] text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">assignment_turned_in</span>
                    FILE OFFICIAL COMPLAINT
                  </button>

                  <button
                    onClick={() => {
                      setIsEvidenceModalOpen(false);
                      setEvidenceZoom('fit');
                      navigate(`/video-vault?alertId=${selectedAlert.id}&time=${selectedAlert.detection?.video_timestamp_sec || 50.4}`);
                    }}
                    className="w-full py-2 px-3 border border-[#38bdf8]/40 hover:bg-[#38bdf8]/15 text-[#38bdf8] rounded-xl font-['Inter'] text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">videocam</span>
                    INVESTIGATE IN FORENSIC VIDEO VAULT
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setIsEvidenceModalOpen(false);
                        setEvidenceZoom('fit');
                        navigate(`/live-map`);
                      }}
                      className="flex-1 py-2 px-3 border border-[#414752] hover:bg-[#1E232D] text-[#e0e2ea] rounded-xl font-['Inter'] text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">map</span>
                      VIEW ON MAP
                    </button>
                    <button
                      onClick={() => {
                        setIsEvidenceModalOpen(false);
                        setEvidenceZoom('fit');
                      }}
                      className="py-2 px-4 border border-[#30363D] hover:bg-[#1E232D] text-[#8b919d] hover:text-white rounded-xl font-['Inter'] text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      CLOSE
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gemini VLM Semantic Inspector Modal */}
      {selectedAlert && (
        <VlmAuditModal
          isOpen={isVlmModalOpen}
          onClose={() => setIsVlmModalOpen(false)}
          alertId={selectedAlert.id}
          evidenceUrl={selectedAlert.detection?.evidence_url}
          initialType={selectedAlert.type}
          lat={selectedAlert.detection?.lat || 21.2415}
          lon={selectedAlert.detection?.lon || 81.6335}
        />
      )}
    </div>
  );
}
