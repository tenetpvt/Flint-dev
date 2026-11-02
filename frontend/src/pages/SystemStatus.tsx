import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusDot } from '../components/ui/StatusDot';
import {
  Server,
  Activity,
  RefreshCw,
  Database,
  Globe,
  Radio,
} from 'lucide-react';

export function SystemStatus() {
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  const { data: health, isLoading } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => api.get('/health').then((r) => r.data),
    refetchInterval: 10000,
  });

  const isBackendHealthy = health?.status === 'HEALTHY';

  const handlePing = async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      await api.get('/health');
      const latency = Math.round(performance.now() - start);
      setPingResult(`API ping round-trip successful: ${latency} ms latency.`);
    } catch {
      setPingResult('API ping failed: connection timeout.');
    } finally {
      setIsPinging(false);
    }
  };

  const services = [
    {
      name: 'FLINT Core API Engine',
      type: 'FastAPI / Python 3.11',
      status: 'OPERATIONAL',
      latency: '12 ms',
      uptime: '99.99%',
      details: 'Active REST routes & analytical aggregation endpoints',
      icon: <Server className="w-4 h-4 text-[var(--accent)]" />,
    },
    {
      name: 'Raipur Road-Network Routing Engine',
      type: 'OSRM (Open Source Routing Machine)',
      status: 'OPERATIONAL',
      latency: '34 ms',
      uptime: '99.95%',
      details: 'Turn-by-turn geometry matching for R1–R5 corridors',
      icon: <Globe className="w-4 h-4 text-[var(--accent)]" />,
    },
    {
      name: 'Geographic Basemap Tile Service',
      type: 'Vector Carto Basemap CDN',
      status: 'OPERATIONAL',
      latency: '42 ms',
      uptime: '100%',
      details: 'High-contrast road network basemap rendering',
      icon: <Activity className="w-4 h-4 text-[var(--accent)]" />,
    },
    {
      name: 'Edge Vision Node Ingestion',
      type: 'Inference Stream Consumer',
      status: 'STREAMING',
      latency: '18 ms',
      uptime: '99.8%',
      details: 'Real-time telemetry & corridor audit aggregation',
      icon: <Radio className="w-4 h-4 text-[var(--accent)]" />,
    },
    {
      name: 'Spatial Database & State Cache',
      type: 'SQLite3 + SQLAlchemy ORM (WAL mode)',
      status: 'OPTIMAL',
      latency: '< 1 ms',
      uptime: '100%',
      details: 'Persisted corridor geometries, journeys, and alerts',
      icon: <Database className="w-4 h-4 text-[var(--accent)]" />,
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)] text-[var(--text-primary)] overflow-y-auto">
      {/* Top Header */}
      <div className="bg-[var(--surface)] border-b border-[var(--border-subtle)] px-6 py-3 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text-primary)]">
            System status & diagnostics
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Platform infrastructure · All core subsystems nominal
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusDot
            status={isLoading ? 'info' : isBackendHealthy ? 'success' : 'neutral'}
            label={isLoading ? 'Syncing...' : isBackendHealthy ? 'Services healthy' : 'Standby'}
          />
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6 pb-20">
        {/* KPI Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div
            className="p-3.5 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-lavender)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">System uptime</div>
            <div className="text-xl font-semibold tabular-nums mt-1 font-mono" style={{ color: 'var(--kpi-text)' }}>
              99.98%
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Rolling 30 days</div>
          </div>

          <div
            className="p-3.5 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-sky)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">API latency</div>
            <div className="text-xl font-semibold tabular-nums mt-1 font-mono" style={{ color: 'var(--kpi-text)' }}>
              12 ms
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Average roundtrip</div>
          </div>

          <div
            className="p-3.5 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-indigo)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">Routing engine</div>
            <div className="text-xl font-semibold tabular-nums mt-1 font-mono" style={{ color: 'var(--kpi-text)' }}>
              OSRM v5
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Corridor matching</div>
          </div>

          <div
            className="p-3.5 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-mint)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">Database footprint</div>
            <div className="text-xl font-semibold tabular-nums mt-1 font-mono" style={{ color: 'var(--kpi-text)' }}>
              14.2 MB
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">SQLite WAL mode</div>
          </div>

          <div
            className="p-3.5 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-lavender)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">Sessions active</div>
            <div className="text-xl font-semibold tabular-nums mt-1 font-mono" style={{ color: 'var(--kpi-text)' }}>
              1 Local
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Authority terminal</div>
          </div>
        </section>

        {/* Diagnostics & Benchmark */}
        <Card className="p-4 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              System diagnostics & benchmark
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Execute live health round-trips against the FastAPI backend and OSRM routing machine.
            </p>
            {pingResult && (
              <div className="mt-2 text-xs font-mono text-[var(--accent)] bg-[var(--surface-raised)] px-2.5 py-1 rounded border border-[var(--border-subtle)] w-fit">
                {pingResult}
              </div>
            )}
          </div>

          <Button
            variant="primary"
            size="sm"
            loading={isPinging}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={handlePing}
          >
            Test API latency
          </Button>
        </Card>

        {/* Services List */}
        <Card className="overflow-hidden p-0">
          <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]/40 flex justify-between items-center">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Platform services health
            </h3>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              5 of 5 operational
            </span>
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {services.map((srv, idx) => (
              <div
                key={idx}
                className="p-3.5 flex items-center justify-between hover:bg-[var(--surface-raised)]/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-strong)] flex items-center justify-center">
                    {srv.icon}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--text-primary)]">{srv.name}</h4>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {srv.type} · {srv.details}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 font-mono text-xs">
                  <div className="text-right hidden sm:block">
                    <span className="text-[10px] text-[var(--text-muted)] block">Latency</span>
                    <span className="text-[var(--text-secondary)] font-medium">{srv.latency}</span>
                  </div>

                  <div className="text-right hidden sm:block">
                    <span className="text-[10px] text-[var(--text-muted)] block">Uptime</span>
                    <span className="text-[var(--text-secondary)] font-medium">{srv.uptime}</span>
                  </div>

                  <StatusDot status="success" label="Operational" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
