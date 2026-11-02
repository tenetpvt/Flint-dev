import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchBuses } from '../services/buses';
import { fetchJourneys } from '../services/journeys';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusDot } from '../components/ui/StatusDot';
import {
  Bus as BusIcon,
  Cpu,
  HardDrive,
  Camera,
  Compass,
} from 'lucide-react';

export function Fleet() {
  const navigate = useNavigate();
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);

  const { data: buses, isLoading: busesLoading, error: busesError, refetch: refetchBuses } = useQuery({
    queryKey: ['buses'],
    queryFn: fetchBuses,
  });

  const { data: journeys, isLoading: journeysLoading } = useQuery({
    queryKey: ['journeys'],
    queryFn: fetchJourneys,
  });

  const isLoading = busesLoading || journeysLoading;

  if (isLoading) return <LoadingState message="Connecting to fleet sensor nodes..." />;
  if (busesError) return <ErrorState message="Could not load fleet data." onRetry={() => refetchBuses()} />;

  const allBuses = buses || [];
  const activeBuses = allBuses.filter((b) => b.status === 'ACTIVE').length;
  const idleBuses = allBuses.filter((b) => b.status === 'IDLE').length;

  const selectedBus = allBuses.find((b) => b.id === selectedBusId) || allBuses[0];
  const selectedJourney = journeys?.find((j) => j.bus.id === selectedBus?.id);

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)] text-[var(--text-primary)] overflow-y-auto">
      {/* Top Header */}
      <div className="bg-[var(--surface)] border-b border-[var(--border-subtle)] px-6 py-3 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text-primary)]">
            Fleet sensor nodes
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Raipur municipal bus network · {allBuses.length} onboard sensing units provisioned
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusDot status="success" label="All sensors nominal" />
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
            <div className="text-[11px] font-medium text-[var(--text-muted)]">Total fleet</div>
            <div className="text-xl font-semibold tabular-nums mt-1 font-mono" style={{ color: 'var(--kpi-text)' }}>
              {allBuses.length}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Equipped vehicles</div>
          </div>

          <div
            className="p-3.5 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-sky)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">Active in transit</div>
            <div className="text-xl font-semibold tabular-nums mt-1 font-mono" style={{ color: 'var(--kpi-text)' }}>
              {activeBuses}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Streaming telemetry</div>
          </div>

          <div
            className="p-3.5 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-indigo)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">Depot standby</div>
            <div className="text-xl font-semibold tabular-nums mt-1 font-mono" style={{ color: 'var(--kpi-text)' }}>
              {idleBuses}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Stationary units</div>
          </div>

          <div
            className="p-3.5 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-mint)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">Inference latency</div>
            <div className="text-xl font-semibold tabular-nums mt-1 font-mono" style={{ color: 'var(--kpi-text)' }}>
              42 ms
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">YOLOv8 Dual-Head</div>
          </div>

          <div
            className="p-3.5 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-lavender)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">GPS lock quality</div>
            <div className="text-xl font-semibold tabular-nums mt-1 font-mono" style={{ color: 'var(--kpi-text)' }}>
              99.4%
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">AIS-140 standard</div>
          </div>
        </section>

        {/* Main Grid: Vehicles List + Telemetry Inspector */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Vehicles List (2 cols on xl) */}
          <div className="xl:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Provisioned edge sensing vehicles
            </h3>

            <div className="space-y-3">
              {allBuses.map((bus) => {
                const journey = journeys?.find((j) => j.bus.id === bus.id);
                const isSelected = selectedBus?.id === bus.id;
                const isActive = bus.status === 'ACTIVE';

                return (
                  <Card
                    key={bus.id}
                    onClick={() => setSelectedBusId(bus.id)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/30'
                        : 'hover:bg-[var(--surface-raised)]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent)]">
                          <BusIcon className="w-4 h-4" strokeWidth={1.5} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                              {bus.name}
                            </h4>
                            <StatusDot
                              status={isActive ? 'success' : 'neutral'}
                              label={isActive ? 'Active' : 'Standby'}
                            />
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {journey ? (
                              <span>
                                Route:{' '}
                                <strong className="text-[var(--text-primary)] font-medium">
                                  {journey.route.name} · {journey.route.description}
                                </strong>
                              </span>
                            ) : (
                              'Standby at Central Depot'
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block font-mono text-xs">
                          <div className="text-[10px] text-[var(--text-muted)]">Coordinates</div>
                          <div className="text-[var(--text-secondary)]">
                            {bus.last_lat?.toFixed(4)}, {bus.last_lon?.toFixed(4)}
                          </div>
                        </div>

                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Compass className="w-3.5 h-3.5" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/live-map');
                          }}
                        >
                          Locate
                        </Button>
                      </div>
                    </div>

                    {/* Sensor Health Micro-strip */}
                    <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-muted)]">
                      <div className="flex items-center gap-1.5">
                        <Camera className="w-3 h-3 text-emerald-500" />
                        <span>30 FPS</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Compass className="w-3 h-3 text-emerald-500" />
                        <span>12 sats</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Cpu className="w-3 h-3 text-emerald-500" />
                        <span>48°C</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <HardDrive className="w-3 h-3 text-emerald-500" />
                        <span>94% free</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Selected Bus Telemetry Inspector (1 col) */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Edge node inspector
            </h3>

            {selectedBus && (
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                      Node profile
                    </span>
                    <h3 className="font-mono text-base font-semibold text-[var(--text-primary)]">
                      {selectedBus.name}
                    </h3>
                  </div>
                  <StatusDot status="success" label="Online" />
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)]">Hardware unit</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      FLINT Edge v2.4 (Jetson)
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)]">Neural engine</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      TensorRT INT8 (YOLOv8)
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)]">Corridor assignment</span>
                    <span className="font-mono text-[var(--accent)] font-medium">
                      {selectedJourney ? selectedJourney.route.name : 'Standby'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)]">Observations logged</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {selectedJourney ? selectedJourney.detections.length : 0} items
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)]">Cellular uplink</span>
                    <span className="font-mono text-emerald-500">5G NR (18ms)</span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  icon={<Compass className="w-4 h-4" />}
                  onClick={() => navigate('/live-map')}
                >
                  Track vehicle on map
                </Button>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
