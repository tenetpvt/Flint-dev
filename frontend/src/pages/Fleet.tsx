import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchBuses } from '../services/buses';
import { fetchJourneys } from '../services/journeys';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';

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

  if (isLoading) return <LoadingState message="Connecting to Fleet Telemetry..." />;
  if (busesError) return <ErrorState message="Could not load fleet data." onRetry={() => refetchBuses()} />;

  const allBuses = buses || [];
  const activeBuses = allBuses.filter((b) => b.status === 'ACTIVE').length;
  const idleBuses = allBuses.filter((b) => b.status === 'IDLE').length;

  const selectedBus = allBuses.find((b) => b.id === selectedBusId) || allBuses[0];
  const selectedJourney = journeys?.find((j) => j.bus.id === selectedBus?.id);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0C10] overflow-y-auto">
      {/* Top Header */}
      <div className="bg-[#181c21] border-b border-[#414752] px-6 py-3 flex justify-between items-center shrink-0">
        <div>
          <h1 className="font-['Inter'] text-[18px] font-bold text-[#e0e2ea] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#38bdf8] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              directions_bus
            </span>
            FLEET MANAGEMENT & EDGE NODES
          </h1>
          <p className="font-['JetBrains_Mono'] text-[11px] text-[#38bdf8] uppercase tracking-wider mt-0.5">
            RAIPUR MUNICIPAL FLEET · {allBuses.length} SENSOR NODES PROVISIONED
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-['JetBrains_Mono'] text-[11px] text-[#c0c7d4] bg-[#101419] px-3 py-1.5 rounded-lg border border-[#414752] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse-ring"></span>
            ALL SENSORS NOMINAL
          </span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="px-6 py-2.5 border-b border-[#414752] bg-[#101419] flex items-center space-x-6 shrink-0 overflow-x-auto">
        <div className="flex flex-col">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-wider uppercase">TOTAL FLEET</span>
          <span className="font-['JetBrains_Mono'] text-[18px] font-bold text-[#e0e2ea]">{allBuses.length}</span>
        </div>
        <div className="w-px h-7 bg-[#414752]"></div>

        <div className="flex flex-col">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8]"></span>
            <span className="font-['Inter'] text-[10px] font-bold text-[#38bdf8] tracking-wider uppercase">ONLINE / ACTIVE</span>
          </div>
          <span className="font-['JetBrains_Mono'] text-[18px] font-bold text-[#38bdf8]">{activeBuses}</span>
        </div>
        <div className="w-px h-7 bg-[#414752]"></div>

        <div className="flex flex-col">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-wider uppercase">IDLE / STANDBY</span>
          <span className="font-['JetBrains_Mono'] text-[18px] font-bold text-[#cbd5e1]">{idleBuses}</span>
        </div>
        <div className="w-px h-7 bg-[#414752]"></div>

        <div className="flex flex-col">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-wider uppercase">EDGE INFERENCE LATENCY</span>
          <span className="font-['JetBrains_Mono'] text-[18px] font-bold text-[#e0e2ea]">42 ms</span>
        </div>
        <div className="w-px h-7 bg-[#414752]"></div>

        <div className="flex flex-col">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-wider uppercase">GPS LOCK QUALITY</span>
          <span className="font-['JetBrains_Mono'] text-[18px] font-bold text-[#ffba42]">99.4%</span>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6 pb-20">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Vehicles List (2 cols on xl) */}
          <div className="xl:col-span-2 space-y-3">
            <h3 className="font-['Inter'] text-[12px] font-bold text-[#c0c7d4] tracking-wider uppercase mb-2">
              PROVISIONED EDGE SENSING VEHICLES
            </h3>

            <div className="space-y-3">
              {allBuses.map((bus) => {
                const journey = journeys?.find((j) => j.bus.id === bus.id);
                const isSelected = selectedBus?.id === bus.id;
                const isActive = bus.status === 'ACTIVE';

                return (
                  <div
                    key={bus.id}
                    onClick={() => setSelectedBusId(bus.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1C2128] border-[#38bdf8] shadow-lg'
                        : 'bg-[#161B22] border-[#30363D] hover:bg-[#1C2025]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                            isActive
                              ? 'bg-[#38bdf8]/15 border-[#38bdf8]/40 text-[#38bdf8]'
                              : 'bg-[#32353b] border-[#414752] text-[#8b919d]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[22px]">directions_bus</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-['JetBrains_Mono'] text-base font-bold text-[#e0e2ea]">{bus.name}</h4>
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-['JetBrains_Mono'] font-bold uppercase border ${
                                isActive
                                  ? 'bg-[#38bdf8]/15 text-[#38bdf8] border-[#38bdf8]/30'
                                  : 'bg-[#cbd5e1]/10 text-[#cbd5e1] border-[#cbd5e1]/20'
                              }`}
                            >
                              ● {bus.status}
                            </span>
                          </div>
                          <p className="font-['Inter'] text-xs text-[#8b919d] mt-0.5">
                            {journey ? (
                              <>Assigned: <span className="text-[#e0e2ea] font-medium">{journey.route.name} · {journey.route.description}</span></>
                            ) : (
                              'Standby at Central Depot'
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 font-['JetBrains_Mono'] text-xs">
                        <div className="text-right hidden sm:block">
                          <div className="text-[#8b919d] text-[10px] uppercase">Telemetry Coordinates</div>
                          <div className="text-[#e0e2ea]">
                            {bus.last_lat?.toFixed(4)}, {bus.last_lon?.toFixed(4)}
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/live-map');
                          }}
                          className="px-3 py-1.5 bg-[#38bdf8]/10 hover:bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/40 rounded-lg text-xs font-['Inter'] font-bold uppercase tracking-wider transition-colors"
                        >
                          LOCATE
                        </button>
                      </div>
                    </div>

                    {/* Sensor Micro-Health Bar */}
                    <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-[#30363D]/60 text-[10px] font-['JetBrains_Mono']">
                      <div className="flex items-center gap-1.5 text-[#c0c7d4]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
                        Camera: <strong className="text-[#e0e2ea]">30 FPS</strong>
                      </div>
                      <div className="flex items-center gap-1.5 text-[#c0c7d4]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
                        GPS: <strong className="text-[#e0e2ea]">12 Sats</strong>
                      </div>
                      <div className="flex items-center gap-1.5 text-[#c0c7d4]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
                        Temp: <strong className="text-[#e0e2ea]">48°C</strong>
                      </div>
                      <div className="flex items-center gap-1.5 text-[#c0c7d4]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
                        Storage: <strong className="text-[#e0e2ea]">94% Free</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Bus Telemetry Inspector (1 col) */}
          <div className="space-y-4">
            <h3 className="font-['Inter'] text-[12px] font-bold text-[#c0c7d4] tracking-wider uppercase mb-2">
              EDGE NODE TELEMETRY INSPECTOR
            </h3>

            {selectedBus && (
              <div className="bg-[#161B22] p-5 rounded-xl border border-[#30363D] shadow-lg space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
                  <div>
                    <span className="font-['JetBrains_Mono'] text-[10px] font-bold text-[#38bdf8] uppercase">NODE DETAILS</span>
                    <h3 className="font-['Inter'] text-lg font-bold text-[#e0e2ea]">{selectedBus.name}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30 font-bold uppercase">
                    ACTIVE SENSING
                  </span>
                </div>

                <div className="space-y-3 font-['Inter'] text-xs">
                  <div className="flex justify-between py-1 border-b border-[#30363D]/40">
                    <span className="text-[#8b919d]">Hardware Platform:</span>
                    <span className="font-['JetBrains_Mono'] text-[#e0e2ea]">FLINT Edge v2.4 (Jetson Nano)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#30363D]/40">
                    <span className="text-[#8b919d]">Neural Inference Engine:</span>
                    <span className="font-['JetBrains_Mono'] text-[#e0e2ea]">TensorRT INT8 (YOLOv8-Flint)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#30363D]/40">
                    <span className="text-[#8b919d]">Active Route:</span>
                    <span className="font-['JetBrains_Mono'] text-[#38bdf8] font-bold">
                      {selectedJourney ? selectedJourney.route.name : 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#30363D]/40">
                    <span className="text-[#8b919d]">Findings Recorded:</span>
                    <span className="font-['JetBrains_Mono'] text-[#e0e2ea] font-bold">
                      {selectedJourney ? selectedJourney.detections.length : 0} Detections
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#30363D]/40">
                    <span className="text-[#8b919d]">Network Uplink:</span>
                    <span className="font-['JetBrains_Mono'] text-[#22c55e]">5G NR (Low Latency 18ms)</span>
                  </div>
                </div>

                <button
                  onClick={() => navigate('/live-map')}
                  className="w-full py-2.5 bg-[#38bdf8] hover:bg-[#58a6ff] text-[#00315c] rounded-lg font-['Inter'] text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">map</span>
                  TRACK BUS ON LIVE MAP
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
