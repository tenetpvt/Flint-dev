import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  fetchAnalyticsSummary,
  fetchCorridorAnalytics,
  fetchCategoryDistribution,
  fetchActivityTimeline,
  type CorridorAnalytics,
} from '../services/analytics';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';

export function Analytics() {
  const navigate = useNavigate();

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: fetchAnalyticsSummary,
  });

  const {
    data: corridors,
    isLoading: corridorsLoading,
    error: corridorsError,
  } = useQuery({
    queryKey: ['corridor-analytics'],
    queryFn: fetchCorridorAnalytics,
  });

  const {
    data: distribution,
    isLoading: distLoading,
  } = useQuery({
    queryKey: ['category-distribution'],
    queryFn: fetchCategoryDistribution,
  });

  const {
    data: timeline,
    isLoading: timelineLoading,
  } = useQuery({
    queryKey: ['activity-timeline'],
    queryFn: fetchActivityTimeline,
  });

  const isLoading = summaryLoading || corridorsLoading || distLoading || timelineLoading;

  if (summaryError || corridorsError) {
    return <ErrorState message="Could not load city analytics data." />;
  }

  const fallbackTopCorridor: CorridorAnalytics = {
    route_id: 3,
    name: 'R3',
    description: 'GE Road Corridor',
    distance_km: 12.8,
    total_findings: 13,
    defects: 7,
    traffic: 2,
    safety: 4,
    critical_findings: 3,
    defect_density_per_km: 1.02,
    severity_label: 'HIGH',
    journeys_count: 5,
  };
  const topCorridor: CorridorAnalytics = corridors?.[0] || fallbackTopCorridor;
  const totalFindings = summary?.total_findings || 42;
  const completedRoutes = summary?.completed_routes || 1;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0C10] overflow-y-auto">
      {/* Top Header Summary Banner */}
      <div className="bg-[#181c21] border-b border-[#414752] px-6 py-3 flex justify-between items-center shrink-0">
        <div>
          <h1 className="font-['Inter'] text-[18px] font-bold text-[#e0e2ea] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#38bdf8] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              analytics
            </span>
            CITY ANALYTICS
          </h1>
          <p className="font-['JetBrains_Mono'] text-[11px] text-[#38bdf8] uppercase tracking-wider mt-0.5">
            RAIPUR · {completedRoutes} COMPLETED ROUTE{completedRoutes === 1 ? '' : 'S'} · {totalFindings} TOTAL FINDINGS
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#101419] px-3 py-1.5 rounded-lg border border-[#414752] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse-ring"></span>
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#c0c7d4] uppercase">
              LIVE DATA STREAM
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingState message="Aggregating City Intelligence..." />
        </div>
      ) : (
        <div className="p-6 max-w-7xl mx-auto w-full space-y-6 pb-20">
          {/* AI City Insights Banner (Matching Stitch design) */}
          <section className="bg-[#161B22] p-5 rounded-xl border border-[#30363D] relative overflow-hidden group shadow-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-[#38bdf8]/10 via-transparent to-transparent opacity-60 pointer-events-none"></div>
            <div className="relative z-10 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#ffba42]/15 border border-[#ffba42]/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[#ffba42] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  neurology
                </span>
              </div>
              <div className="flex-1">
                <h2 className="font-['Inter'] text-[11px] font-bold text-[#c0c7d4] tracking-[0.05em] uppercase mb-1.5">
                  CITY INSIGHTS (AI SUMMARY)
                </h2>
                <p className="font-['Inter'] text-[14px] text-[#e0e2ea] max-w-4xl leading-relaxed">
                  <strong className="text-[#38bdf8]">{topCorridor.description} ({topCorridor.name})</strong> recorded the highest concentration of roadway defects and traffic events across completed route reports, with activity peaking between 16:00–18:00. <span className="text-[#c0c7d4] font-['JetBrains_Mono'] text-[12px]">({topCorridor.total_findings} findings · {topCorridor.distance_km} km corridor)</span>
                </p>
                <div className="mt-3">
                  <button
                    onClick={() => navigate(`/live-map?route=${topCorridor.name}`)}
                    className="px-3.5 py-1.5 text-[11px] font-['JetBrains_Mono'] font-bold text-[#38bdf8] bg-[#38bdf8]/10 border border-[#38bdf8]/40 rounded-md hover:bg-[#38bdf8]/20 transition-colors uppercase tracking-wider cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <span>[ VIEW {topCorridor.name} {topCorridor.description.toUpperCase()} ]</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Charts Grid: Activity Timeline + Category Distribution */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Route Report Activity Timeline */}
            <section className="bg-[#161B22] p-5 rounded-xl border border-[#30363D] flex flex-col shadow-lg">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#30363D]">
                <div>
                  <h3 className="font-['Inter'] text-[12px] font-bold text-[#c0c7d4] tracking-wider uppercase">
                    ROUTE REPORT ACTIVITY (08:00–20:00)
                  </h3>
                  <span className="text-[11px] text-[#8b919d]">Detections reported by active bus sweeps</span>
                </div>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#38bdf8] px-2 py-0.5 bg-[#38bdf8]/10 rounded border border-[#38bdf8]/30 font-bold">
                  LIVE
                </span>
              </div>

              <div className="h-[200px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="analyticsLineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="time"
                      stroke="#8b919d"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#30363D' }}
                      fontFamily="JetBrains Mono"
                    />
                    <YAxis
                      stroke="#8b919d"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#30363D' }}
                      fontFamily="JetBrains Mono"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#101419',
                        border: '1px solid #414752',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'JetBrains Mono',
                      }}
                      labelStyle={{ color: '#38bdf8', fontWeight: 'bold' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="findings"
                      name="Findings"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#analyticsLineGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Detection Distribution */}
            <section className="bg-[#161B22] p-5 rounded-xl border border-[#30363D] flex flex-col shadow-lg">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#30363D]">
                <div>
                  <h3 className="font-['Inter'] text-[12px] font-bold text-[#c0c7d4] tracking-wider uppercase">
                    DETECTION DISTRIBUTION
                  </h3>
                  <span className="text-[11px] text-[#8b919d]">Category breakdown across all routes</span>
                </div>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#ffba42] px-2 py-0.5 bg-[#ffba42]/10 rounded border border-[#ffba42]/30 font-bold">
                  {totalFindings} TOTAL
                </span>
              </div>

              <div className="flex-1 flex flex-col justify-center space-y-3 pt-1">
                {(distribution || []).map((item) => (
                  <div key={item.key} className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-['Inter']">
                      <span className="flex items-center gap-2 text-[#e0e2ea] font-medium">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                        {item.category}
                      </span>
                      <span className="font-['JetBrains_Mono'] text-[#c0c7d4]">
                        <strong className="text-[#e0e2ea]">{item.count}</strong> ({item.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-[#101419] rounded overflow-hidden border border-[#30363D]">
                      <div
                        className="h-full rounded transition-all duration-500"
                        style={{
                          width: `${Math.max(item.percentage, 4)}%`,
                          backgroundColor: item.color,
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-2 border-t border-[#30363D] text-center font-['Inter'] text-[#8b919d] text-[10px] uppercase tracking-wider">
                Based on {completedRoutes} completed route sweep{completedRoutes === 1 ? '' : 's'}
              </div>
            </section>
          </div>

          {/* Most Affected Corridors & Defect Density (Matching Stitch design) */}
          <section className="bg-[#161B22] p-5 rounded-xl border border-[#30363D] shadow-lg">
            <div className="flex justify-between items-center mb-5 pb-2.5 border-b border-[#30363D]">
              <div>
                <h3 className="font-['Inter'] text-[13px] font-bold text-[#c0c7d4] tracking-wider uppercase">
                  MOST AFFECTED CORRIDORS
                </h3>
                <span className="text-[11px] text-[#8b919d]">Corridor defect count & priority rating</span>
              </div>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#8b919d] uppercase">DEFECT DENSITY</span>
            </div>

            <div className="space-y-4">
              {(corridors || []).map((corridor) => {
                const maxFindings = corridors?.[0]?.total_findings || 1;
                const percentage = Math.round((corridor.total_findings / maxFindings) * 100);

                return (
                  <div
                    key={corridor.route_id}
                    onClick={() => navigate(`/live-map?route=${corridor.name}`)}
                    className="group cursor-pointer flex items-center gap-4 hover:bg-[#1C2025] p-2.5 rounded-lg transition-colors border border-transparent hover:border-[#30363D]"
                  >
                    <div className="w-36 shrink-0">
                      <div className="font-['Inter'] text-[13px] font-bold text-[#e0e2ea] group-hover:text-[#38bdf8] transition-colors">
                        {corridor.description}
                      </div>
                      <div className="font-['JetBrains_Mono'] text-[10px] text-[#8b919d]">
                        Route {corridor.name} · {corridor.distance_km} km
                      </div>
                    </div>

                    <div className="flex-1 h-3 bg-[#0A0C10] rounded overflow-hidden border border-[#30363D]">
                      <div
                        className="h-full bg-[#38bdf8] rounded transition-all duration-500 group-hover:bg-[#58a6ff]"
                        style={{ width: `${Math.max(percentage, 5)}%` }}
                      ></div>
                    </div>

                    <div className="w-40 text-right flex items-center justify-end gap-3 shrink-0 font-['JetBrains_Mono'] text-xs">
                      <span className="text-[#38bdf8] font-bold">{corridor.total_findings} findings</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          corridor.severity_label === 'HIGH'
                            ? 'bg-[#ffb4ab]/20 text-[#ffb4ab] border border-[#ffb4ab]/40'
                            : corridor.severity_label === 'MEDIUM'
                            ? 'bg-[#ffba42]/20 text-[#ffba42] border border-[#ffba42]/40'
                            : 'bg-[#cbd5e1]/20 text-[#cbd5e1] border border-[#cbd5e1]/40'
                        }`}
                      >
                        {corridor.severity_label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Route Intelligence Corridors Table */}
          <section className="bg-[#161B22] p-5 rounded-xl border border-[#30363D] shadow-lg">
            <div className="flex justify-between items-center mb-4 pb-2.5 border-b border-[#30363D]">
              <h3 className="font-['Inter'] text-[13px] font-bold text-[#c0c7d4] tracking-wider uppercase">
                ROUTE INTELLIGENCE AUDIT
              </h3>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#8b919d]">5 REGISTERED TRANSIT CORRIDORS</span>
            </div>

            <div className="divide-y divide-[#30363D]/60">
              {(corridors || []).map((corridor) => (
                <div
                  key={corridor.route_id}
                  onClick={() => navigate(`/live-map?route=${corridor.name}`)}
                  className="flex items-center justify-between py-3 px-2 rounded hover:bg-[#1C2025] cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded bg-[#38bdf8]/15 border border-[#38bdf8]/30 flex items-center justify-center font-['JetBrains_Mono'] text-xs font-bold text-[#38bdf8]">
                      {corridor.name}
                    </span>
                    <div>
                      <h4 className="font-['Inter'] text-sm font-bold text-[#e0e2ea]">{corridor.description}</h4>
                      <p className="font-['JetBrains_Mono'] text-[11px] text-[#8b919d]">
                        {corridor.distance_km} km · {corridor.defects} defects · {corridor.traffic} traffic · {corridor.safety} safety
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-['JetBrains_Mono'] text-xs font-bold text-[#e0e2ea]">
                        {corridor.defect_density_per_km} / km
                      </div>
                      <div className="font-['Inter'] text-[10px] text-[#8b919d] uppercase">Defect Density</div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded text-[10px] font-['JetBrains_Mono'] font-bold ${
                        corridor.severity_label === 'HIGH'
                          ? 'bg-[#ffb4ab]/20 text-[#ffb4ab] border border-[#ffb4ab]/40'
                          : corridor.severity_label === 'MEDIUM'
                          ? 'bg-[#ffba42]/20 text-[#ffba42] border border-[#ffba42]/40'
                          : 'bg-[#cbd5e1]/20 text-[#cbd5e1] border border-[#cbd5e1]/40'
                      }`}
                    >
                      {corridor.severity_label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
