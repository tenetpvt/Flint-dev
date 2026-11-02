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
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusDot } from '../components/ui/StatusDot';
import {
  ArrowRight,
  Sparkles,
} from 'lucide-react';

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
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)] text-[var(--text-primary)] overflow-y-auto">
      {/* Top Header Summary Strip */}
      <div className="bg-[var(--surface)] border-b border-[var(--border-subtle)] px-6 py-3 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text-primary)]">
            Corridor intelligence & sensor trends
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Raipur municipal network · {completedRoutes} completed sweeps · {totalFindings} findings
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusDot status="success" label="Active telemetry stream" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingState message="Aggregating corridor intelligence..." />
        </div>
      ) : (
        <div className="p-6 max-w-7xl mx-auto w-full space-y-6 pb-20">
          {/* Executive Insights Banner */}
          <Card className="p-4 relative overflow-hidden">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-strong)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                    Executive corridor insight
                  </h2>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-3xl">
                  <strong className="text-[var(--text-primary)] font-medium">
                    {topCorridor.description} ({topCorridor.name})
                  </strong>{' '}
                  exhibits the highest defect density and traffic friction across recent surveys,
                  averaging {topCorridor.defect_density_per_km} findings/km. Maintenance dispatch is
                  recommended for pavement sections between km markers 12.0 and 15.4.
                </p>
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArrowRight className="w-3.5 h-3.5" />}
                    onClick={() => navigate(`/live-map?route=${topCorridor.name}`)}
                  >
                    Inspect {topCorridor.description} on map
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Charts Grid: Timeline & Category Distribution */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Timeline */}
            <Card className="p-4 flex flex-col">
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-[var(--border-subtle)]">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Detection timeline (08:00–20:00)
                  </h3>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Observations recorded across bus sweeps
                  </span>
                </div>
                <StatusDot status="info" label="Hourly rate" />
              </div>

              <div className="h-[200px] w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline || []} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="analyticsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="time"
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border-subtle)' }}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border-subtle)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface)',
                        borderColor: 'var(--border-subtle)',
                        borderRadius: '8px',
                        fontSize: '11px',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="findings"
                      name="Findings"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#analyticsAreaGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Category Breakdown */}
            <Card className="p-4 flex flex-col">
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-[var(--border-subtle)]">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Category distribution
                  </h3>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Proportion across all corridor surveys
                  </span>
                </div>
                <span className="text-xs font-mono text-[var(--text-primary)] font-medium">
                  {totalFindings} total
                </span>
              </div>

              <div className="flex-1 flex flex-col justify-center space-y-3 pt-1">
                {(distribution || []).map((item) => (
                  <div key={item.key} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[var(--text-primary)] font-medium">
                        {item.category}
                      </span>
                      <span className="font-mono text-[var(--text-muted)] text-[11px]">
                        <strong className="text-[var(--text-primary)] font-semibold">{item.count}</strong> ({item.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--surface-raised)] rounded-full overflow-hidden border border-[var(--border-subtle)]">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(item.percentage, 4)}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Most Affected Corridors */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                  Corridor defect density rankings
                </h3>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Normalized findings per linear kilometer
                </span>
              </div>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                Relative load
              </span>
            </div>

            <div className="space-y-2.5">
              {(corridors || []).map((corridor) => {
                const maxFindings = corridors?.[0]?.total_findings || 1;
                const percentage = Math.round((corridor.total_findings / maxFindings) * 100);

                return (
                  <div
                    key={corridor.route_id}
                    onClick={() => navigate(`/live-map?route=${corridor.name}`)}
                    className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]/40 hover:bg-[var(--surface-raised)] cursor-pointer transition-colors flex items-center gap-4"
                  >
                    <div className="w-40 shrink-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {corridor.description}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)]">
                        Route {corridor.name} · {corridor.distance_km} km
                      </div>
                    </div>

                    <div className="flex-1 h-2 bg-[var(--surface)] rounded-full overflow-hidden border border-[var(--border-subtle)]">
                      <div
                        className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(percentage, 5)}%` }}
                      />
                    </div>

                    <div className="w-44 text-right flex items-center justify-end gap-2.5 shrink-0 text-xs font-mono">
                      <span className="text-[var(--text-primary)] font-medium">
                        {corridor.total_findings} findings
                      </span>
                      <StatusDot
                        status={corridor.severity_label === 'HIGH' ? 'high' : 'medium'}
                        label={corridor.severity_label}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Route Intelligence Corridors Table */}
          <Card className="overflow-hidden p-0">
            <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]/40 flex justify-between items-center">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Route intelligence inventory
              </h3>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">
                5 registered corridors
              </span>
            </div>

            <div className="divide-y divide-[var(--border-subtle)]">
              {(corridors || []).map((corridor) => (
                <div
                  key={corridor.route_id}
                  onClick={() => navigate(`/live-map?route=${corridor.name}`)}
                  className="flex items-center justify-between p-3.5 hover:bg-[var(--surface-raised)]/60 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-strong)] flex items-center justify-center font-mono text-xs font-semibold text-[var(--accent)]">
                      {corridor.name}
                    </span>
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                        {corridor.description}
                      </h4>
                      <p className="font-mono text-[11px] text-[var(--text-muted)] mt-0.5">
                        {corridor.distance_km} km · {corridor.defects} defects · {corridor.traffic} traffic · {corridor.safety} safety
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                        {corridor.defect_density_per_km} / km
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">Defect density</div>
                    </div>
                    <StatusDot
                      status={corridor.severity_label === 'HIGH' ? 'high' : 'medium'}
                      label={corridor.severity_label}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
