import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CircleDollarSign,
  Download,
  Sliders,
  Layers,
  MapPin,
  AlertTriangle,
  Package,
  Wrench,
  Search,
  ExternalLink,
  CheckCircle2,
  Copy,
  ChevronDown,
} from 'lucide-react';

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from 'recharts';
import { Map as MapLibreMap, Marker, LngLatBounds, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  fetchCostSummary,
  fetchBOQ,
  fetchUnitRates,
  updateUnitRates,
  resetUnitRates,
  downloadWorkOrderCSV,
  type BOQItem,
  type UnitRatesConfig,
} from '../services/costEstimation';
import { fetchRoutes } from '../services/routes';
import { MAP_STYLE, RAIPUR_CENTER } from '../utils/mapStyle';
import { getEvidenceUrl } from '../utils/evidence';
import { UnitRatesModal } from '../components/cost/UnitRatesModal';
import { WorkOrderModal, type WorkOrderData } from '../components/ui/WorkOrderModal';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';

export function CostBudget() {
  const queryClient = useQueryClient();
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [isRatesModalOpen, setIsRatesModalOpen] = useState(false);
  const [activeWorkOrderData, setActiveWorkOrderData] = useState<WorkOrderData | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  // 1. Fetch Routes List
  const { data: routes } = useQuery({
    queryKey: ['routes'],
    queryFn: fetchRoutes,
  });

  // 2. Fetch Cost Summary for Selected Route
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useQuery({
    queryKey: ['cost-summary', selectedRouteId],
    queryFn: () => fetchCostSummary(selectedRouteId),
  });

  // 3. Fetch BOQ Items for Selected Route
  const {
    data: boqItems,
    isLoading: boqLoading,
    error: boqError,
  } = useQuery({
    queryKey: ['cost-boq', selectedRouteId],
    queryFn: () => fetchBOQ(selectedRouteId),
  });

  // 4. Fetch Active Unit Rates
  const { data: rates } = useQuery({
    queryKey: ['cost-rates'],
    queryFn: fetchUnitRates,
  });

  // Mutations for Rates
  const updateRatesMutation = useMutation({
    mutationFn: (newRates: UnitRatesConfig) => updateUnitRates(newRates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cost-boq'] });
      queryClient.invalidateQueries({ queryKey: ['cost-rates'] });
    },
  });

  const resetRatesMutation = useMutation({
    mutationFn: () => resetUnitRates(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cost-boq'] });
      queryClient.invalidateQueries({ queryKey: ['cost-rates'] });
    },
  });

  // Filtered BOQ items based on search and severity chips
  const filteredBOQ = useMemo(() => {
    if (!boqItems) return [];
    return boqItems.filter((item) => {
      const matchesSearch =
        item.location_label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.route_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.repair_method.toLowerCase().includes(searchTerm.toLowerCase()) ||
        `DEF-${item.id}`.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSeverity =
        severityFilter === 'ALL' || item.severity.toUpperCase() === severityFilter.toUpperCase();

      return matchesSearch && matchesSeverity;
    });
  }, [boqItems, searchTerm, severityFilter]);

  // Selected route GeoJSON polyline for mini-map
  const selectedRouteGeoJSON = useMemo(() => {
    if (!routes || !selectedRouteId) return null;
    const r = routes.find((x) => x.id === selectedRouteId);
    if (!r || !r.geojson_path) return null;
    try {
      const coords = JSON.parse(r.geojson_path);
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: coords,
        },
      };
    } catch {
      return null;
    }
  }, [routes, selectedRouteId]);

  // Map Initialization & Updates
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const map = new MapLibreMap({
        container: mapContainerRef.current,
        style: MAP_STYLE,
        center: RAIPUR_CENTER,
        zoom: 12,
        attributionControl: false,
      });

      map.on('load', () => {
        // Add route corridor line layer
        map.addSource('corridor-route', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        });

        map.addLayer({
          id: 'corridor-route-line',
          type: 'line',
          source: 'corridor-route',
          paint: {
            'line-color': '#38bdf8',
            'line-width': 4,
            'line-opacity': 0.85,
          },
        });
      });

      mapRef.current = map;
    }

    const map = mapRef.current;

    // Update Route Source
    const updateSource = () => {
      const src = map.getSource('corridor-route') as any;
      if (src) {
        if (selectedRouteGeoJSON) {
          src.setData({
            type: 'FeatureCollection',
            features: [selectedRouteGeoJSON],
          });
        } else {
          src.setData({
            type: 'FeatureCollection',
            features: [],
          });
        }
      }
    };

    if (map.isStyleLoaded()) {
      updateSource();
    } else {
      map.once('load', updateSource);
    }

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Add defect markers color-coded by cost/severity tier
    if (boqItems && boqItems.length > 0) {
      const bounds = new LngLatBounds();

      boqItems.forEach((defect) => {
        const markerEl = document.createElement('div');
        markerEl.className = 'cursor-pointer group relative';

        const color =
          defect.severity === 'CRITICAL'
            ? '#ef4444'
            : defect.severity === 'HIGH'
            ? '#f97316'
            : defect.severity === 'MEDIUM'
            ? '#eab308'
            : '#22c55e';

        markerEl.innerHTML = `
          <div style="background-color: ${color}; box-shadow: 0 0 12px ${color}80;" class="w-4 h-4 rounded-full border-2 border-white transition-transform transform group-hover:scale-125 flex items-center justify-center">
            <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
          </div>
        `;

        const popup = new Popup({ offset: 12, closeButton: false }).setHTML(`
          <div style="background: #0b0e14; border: 1px solid #414752; border-radius: 8px; padding: 10px; color: #e0e2ea; font-family: Inter, sans-serif; width: 220px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: bold; color: ${color};">DEF-${String(defect.id).padStart(4, '0')}</span>
              <span style="font-size: 10px; font-weight: bold; background: ${color}25; color: ${color}; padding: 2px 6px; border-radius: 4px;">${defect.severity}</span>
            </div>
            <div style="font-size: 12px; font-weight: 600; color: #fff; margin-bottom: 2px;">${defect.location_label}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">${defect.repair_method} · ${defect.estimated_area_sq_m.toFixed(2)} m²</div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #272a30; padding-top: 6px; margin-top: 4px;">
              <span style="font-size: 10px; color: #8b949e;">EST. REPAIR:</span>
              <span style="font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: bold; color: #38bdf8;">₹${defect.estimated_cost.toLocaleString('en-IN')}</span>
            </div>
          </div>
        `);

        const marker = new Marker({ element: markerEl })
          .setLngLat([defect.lon, defect.lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
        bounds.extend([defect.lon, defect.lat]);
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 45, maxZoom: 14 });
      }
    }
  }, [boqItems, selectedRouteGeoJSON]);

  const handleCopyCoords = (item: BOQItem) => {
    navigator.clipboard.writeText(`${item.lat.toFixed(6)}, ${item.lon.toFixed(6)}`);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleOpenDispatchModal = (item: BOQItem) => {
    setActiveWorkOrderData({
      ticketId: `DEF-${String(item.id).padStart(4, '0')}`,
      defectType: item.type,
      severity: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(item.severity) ? item.severity : 'MEDIUM') as any,
      lat: item.lat,
      lon: item.lon,
      streetName: item.location_label,
      confidence: item.confidence,
      evidenceUrl: item.evidence_url ?? undefined,
      videoTimestamp: item.video_timestamp_sec ?? undefined,
      trafficWeight: item.severity === 'CRITICAL' ? 4.5 : 3.0,
      detectedAt: item.timestamp,
      busId: 'BUS-01',
    });
  };

  if ((summaryLoading || boqLoading) && !summary) {
    return <LoadingState message="Calculating Municipal Repair Quantities & Budget..." />;
  }

  if ((summaryError || boqError) && !summary) {
    return <ErrorState message="Could not load route cost estimation data." />;
  }


  const activeRates = rates || {
    cold_mix_rate_sq_m: 1200,
    hot_mix_rate_sq_m: 2800,
    full_depth_rate_sq_m: 6500,
    mobilization_overhead: 1500,
  };

  const totalCost = summary?.total_estimated_cost || 0;
  const totalDefects = summary?.total_defects || 0;
  const criticalBacklog = summary?.critical_backlog_cost || 0;
  const asphaltTons = summary?.estimated_asphalt_metric_tons || 0;
  const coldBags = summary?.estimated_cold_mix_bags || 0;
  const backlogPercent = totalCost > 0 ? Math.round((criticalBacklog / totalCost) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0C10] overflow-y-auto">
      {/* Top Header & Route Control Bar */}
      <div className="bg-[#181c21] border-b border-[#414752] px-6 py-3.5 flex flex-wrap gap-4 justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#38bdf8]/15 border border-[#38bdf8]/30 flex items-center justify-center text-[#38bdf8]">
            <CircleDollarSign className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-['Inter'] text-[17px] font-bold text-[#e0e2ea] tracking-tight flex items-center gap-2">
              COST & BUDGET ESTIMATION
              <span className="font-['JetBrains_Mono'] text-[10px] font-semibold px-2 py-0.5 rounded bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30 uppercase">
                CIVIL REPAIR ENGINE
              </span>
            </h1>
            <p className="font-['JetBrains_Mono'] text-[11px] text-[#94a3b8] mt-0.5">
              PWD / MUNICIPAL SCHEDULE OF RATES · CORRIDOR BILL OF QUANTITIES (BOQ)
            </p>
          </div>
        </div>

        {/* Filter Controls & Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Route Dropdown Selector */}
          <div className="relative min-w-[240px]">
            <select
              value={selectedRouteId ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedRouteId(val === '' ? null : Number(val));
              }}
              className="w-full appearance-none bg-[#101419] border border-[#414752] rounded-xl px-3.5 py-2 pr-9 text-xs font-medium text-[#e0e2ea] focus:outline-none focus:border-[#38bdf8] cursor-pointer"
            >
              <option value="">All Corridors (Raipur Transit Network)</option>
              {routes?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.description} ({r.distance_km} km)
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#8b949e] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Export Work Order CSV Button */}
          <button
            onClick={() => downloadWorkOrderCSV(selectedRouteId, boqItems)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#1a202c] border border-[#414752] text-[#e0e2ea] hover:bg-[#272a30] hover:text-[#38bdf8] hover:border-[#38bdf8]/50 transition-colors cursor-pointer shadow-sm"
            title="Download municipal compliant work-order CSV"
          >
            <Download className="w-4 h-4 text-[#38bdf8]" />
            <span>Export Work Order (CSV)</span>
          </button>

          {/* Configure Unit Rates Button */}
          <button
            onClick={() => setIsRatesModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 transition-colors cursor-pointer shadow-sm"
            title="Tune CPWD baseline material and overhead unit rates"
          >
            <Sliders className="w-4 h-4" />
            <span>Configure Unit Rates</span>
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6 pb-20">
        {/* Top 4 Reactive KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Estimated Repair Cost */}
          <div className="bg-[#12161f] border border-[#414752]/70 rounded-2xl p-4.5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#38bdf8]/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform"></div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-['Inter'] text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider">
                Total Route Repair Budget
              </span>
              <div className="w-7 h-7 rounded-lg bg-[#38bdf8]/15 flex items-center justify-center text-[#38bdf8]">
                <CircleDollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="font-['JetBrains_Mono'] text-2xl font-bold text-[#e0e2ea] tracking-tight">
              ₹{totalCost.toLocaleString('en-IN')}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-[#38bdf8]">
              <span className="font-medium">
                {summary?.route_name ? summary.route_name.split(' - ')[0] : 'Raipur Network'}
              </span>
              <span className="text-[#64748b]">·</span>
              <span className="text-[#94a3b8]">CPWD Rate Model</span>
            </div>
          </div>

          {/* Card 2: Total Defects on Route */}
          <div className="bg-[#12161f] border border-[#414752]/70 rounded-2xl p-4.5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#a855f7]/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform"></div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-['Inter'] text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider">
                Total Identified Defects
              </span>
              <div className="w-7 h-7 rounded-lg bg-[#a855f7]/15 flex items-center justify-center text-[#a855f7]">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="font-['JetBrains_Mono'] text-2xl font-bold text-[#e0e2ea] tracking-tight">
              {totalDefects}
              <span className="text-xs text-[#94a3b8] font-normal ml-2">Hazards</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
              <span>Confirmed via Edge YOLOv8 & ByteTrack</span>
            </div>
          </div>

          {/* Card 3: High-Priority / Critical Backlog */}
          <div className="bg-[#12161f] border border-[#414752]/70 rounded-2xl p-4.5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform"></div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-['Inter'] text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider">
                Critical Repair Backlog
              </span>
              <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center text-red-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="font-['JetBrains_Mono'] text-2xl font-bold text-red-400 tracking-tight">
              ₹{criticalBacklog.toLocaleString('en-IN')}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#94a3b8]">Emergency Dispatches:</span>
              <span className="font-['JetBrains_Mono'] font-bold text-red-400">
                {backlogPercent}% of Budget
              </span>
            </div>
          </div>

          {/* Card 4: Estimated Material Required */}
          <div className="bg-[#12161f] border border-[#414752]/70 rounded-2xl p-4.5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform"></div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-['Inter'] text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider">
                Estimated Material Reqd.
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="font-['JetBrains_Mono'] text-2xl font-bold text-[#e0e2ea] tracking-tight">
              {asphaltTons} <span className="text-sm text-[#94a3b8] font-normal">MT</span>
              <span className="text-sm text-[#64748b] font-normal mx-1.5">/</span>
              {coldBags} <span className="text-sm text-[#94a3b8] font-normal">Bags</span>
            </div>
            <div className="mt-2 text-[11px] text-[#94a3b8] truncate">
              Hot-Mix Asphalt (2.35 t/m³) + Cold Patch
            </div>
          </div>
        </section>

        {/* Corridor Analysis & Visual Breakdown (2-Column Grid) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Interactive Corridor Mini-Map (7 cols) */}
          <div className="lg:col-span-7 bg-[#12161f] border border-[#414752]/70 rounded-2xl p-4 shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#38bdf8]" />
                <h3 className="font-['Inter'] text-xs font-bold text-[#e0e2ea] tracking-tight uppercase">
                  Corridor Defect Spatial Distribution
                </h3>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-['JetBrains_Mono'] text-[#94a3b8]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span> Critical
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span> High
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span> Medium
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Low
                </span>
              </div>
            </div>

            {/* Mini Map Canvas */}
            <div className="relative w-full h-[320px] rounded-xl overflow-hidden border border-[#30363d] bg-[#0b0e14]">
              <div ref={mapContainerRef} className="w-full h-full" />
              <div className="absolute bottom-2 left-2 bg-[#0b0e14]/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-[#414752] text-[10px] font-['JetBrains_Mono'] text-[#94a3b8]">
                Interactive markers: Click for crop & repair cost
              </div>
            </div>
          </div>

          {/* Right Column: Visual Breakdown Charts (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Chart 1: Cost by Severity */}
            <div className="bg-[#12161f] border border-[#414752]/70 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-['Inter'] text-xs font-bold text-[#e0e2ea] tracking-tight uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#f87171]"></span>
                  Cost by Severity Tier
                </h3>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#64748b]">Triage Breakdown</span>
              </div>
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary?.cost_by_severity || []}
                      dataKey="cost"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                    >
                      {summary?.cost_by_severity?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-[#0b0e14] border border-[#414752] p-2 rounded-lg text-xs font-['Inter'] shadow-xl">
                              <p className="font-bold text-[#e0e2ea]">{data.label}</p>
                              <p className="text-[#38bdf8] font-['JetBrains_Mono']">
                                ₹{data.cost.toLocaleString('en-IN')} ({data.count} items)
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend List */}
              <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-[#30363d]/60">
                {summary?.cost_by_severity?.map((item) => (
                  <div key={item.severity} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-[#cbd5e1] truncate">{item.severity}</span>
                    </div>
                    <span className="font-['JetBrains_Mono'] text-[#94a3b8] ml-1 shrink-0">
                      ₹{Math.round(item.cost / 1000)}k
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart 2: Cost by Repair Method */}
            <div className="bg-[#12161f] border border-[#414752]/70 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-['Inter'] text-xs font-bold text-[#e0e2ea] tracking-tight uppercase flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-[#38bdf8]" />
                  Cost by Repair Technique
                </h3>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#64748b]">Material Method</span>
              </div>
              <div className="h-[125px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={summary?.cost_by_repair_method || []}
                    layout="vertical"
                    margin={{ top: 5, right: 15, left: 25, bottom: 5 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="method"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      width={100}
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-[#0b0e14] border border-[#414752] p-2 rounded-lg text-xs font-['Inter'] shadow-xl">
                              <p className="font-bold text-[#e0e2ea]">{data.method}</p>
                              <p className="text-[#38bdf8] font-['JetBrains_Mono']">
                                ₹{data.cost.toLocaleString('en-IN')} ({data.count} repairs)
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                      {summary?.cost_by_repair_method?.map((entry, index) => (
                        <Cell key={`bar-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        {/* Itemized Bill of Quantities (BOQ) Table */}
        <section className="bg-[#12161f] border border-[#414752]/70 rounded-2xl shadow-xl overflow-hidden flex flex-col">
          {/* Table Toolbar */}
          <div className="p-4 border-b border-[#414752]/50 flex flex-wrap gap-3 items-center justify-between bg-[#161a23]">
            <div className="flex items-center gap-2">
              <h3 className="font-['Inter'] text-sm font-bold text-[#e0e2ea] uppercase tracking-tight">
                Itemized Bill of Quantities (BOQ)
              </h3>
              <span className="font-['JetBrains_Mono'] text-xs font-bold text-[#38bdf8] px-2 py-0.5 rounded bg-[#38bdf8]/10 border border-[#38bdf8]/20">
                {filteredBOQ.length} Items
              </span>
            </div>

            {/* Search and Severity Filter Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#64748b] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by defect ID, road name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-[#101419] border border-[#414752] rounded-xl py-1.5 pl-8 pr-3 text-xs text-[#e0e2ea] placeholder-[#64748b] focus:outline-none focus:border-[#38bdf8] w-56"
                />
              </div>

              {/* Severity Filter Chips */}
              <div className="flex items-center rounded-xl bg-[#101419] p-1 border border-[#414752]">
                {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-['JetBrains_Mono'] transition-colors cursor-pointer ${
                      severityFilter === sev
                        ? 'bg-[#38bdf8] text-[#00315c] shadow-sm'
                        : 'text-[#94a3b8] hover:text-[#e0e2ea]'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Granular Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#101419] border-b border-[#30363d] text-[10px] font-['JetBrains_Mono'] text-[#94a3b8] uppercase tracking-wider">
                  <th className="py-3 px-4">Defect / Crop</th>
                  <th className="py-3 px-4">Chainage Location</th>
                  <th className="py-3 px-4">GNSS Coords</th>
                  <th className="py-3 px-4">Dimensions</th>
                  <th className="py-3 px-4">Recommended Technique</th>
                  <th className="py-3 px-4 text-right">Estimated Cost</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#272a30] text-xs font-['Inter']">
                {filteredBOQ.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#8b949e]">
                      No defects match the selected filters or corridor.
                    </td>
                  </tr>
                ) : (
                  filteredBOQ.map((item) => {
                    const sevColor =
                      item.severity === 'CRITICAL'
                        ? 'text-red-400 bg-red-400/10 border-red-500/30'
                        : item.severity === 'HIGH'
                        ? 'text-orange-400 bg-orange-400/10 border-orange-500/30'
                        : item.severity === 'MEDIUM'
                        ? 'text-yellow-400 bg-yellow-400/10 border-yellow-500/30'
                        : 'text-emerald-400 bg-emerald-400/10 border-emerald-500/30';

                    const imageSrc = getEvidenceUrl(item.evidence_url);

                    return (
                      <tr key={item.id} className="hover:bg-[#161a23] transition-colors">
                        {/* Defect ID & Crop Thumbnail Preview */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="relative group w-11 h-11 rounded-lg overflow-hidden border border-[#414752] bg-[#0b0e14] shrink-0">
                              <img
                                src={imageSrc || undefined}
                                alt="Defect crop"
                                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-125"

                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=100&auto=format&fit=crop&q=60';
                                }}
                              />
                            </div>
                            <div>
                              <div className="font-['JetBrains_Mono'] font-bold text-[#e0e2ea]">
                                DEF-{String(item.id).padStart(4, '0')}
                              </div>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border inline-block mt-0.5 uppercase ${sevColor}`}
                              >
                                {item.severity}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Location / Chainage */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#cbd5e1]">{item.location_label}</div>
                          <div className="text-[11px] text-[#8b949e]">{item.route_name}</div>
                        </td>

                        {/* GNSS Coords */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[11px] text-[#94a3b8]">
                            <span>
                              {item.lat.toFixed(5)}, {item.lon.toFixed(5)}
                            </span>
                            <button
                              onClick={() => handleCopyCoords(item)}
                              title="Copy GNSS Coordinates"
                              className="text-[#64748b] hover:text-[#38bdf8] transition-colors cursor-pointer"
                            >
                              {copiedId === item.id ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Dimensions & Depth Tier */}
                        <td className="py-3 px-4">
                          <div className="font-['JetBrains_Mono'] font-semibold text-[#e0e2ea]">
                            {item.estimated_area_sq_m.toFixed(2)} m²
                          </div>
                          <div className="text-[10px] text-[#8b949e] truncate max-w-[150px]">
                            {item.severity_tier}
                          </div>
                        </td>

                        {/* Recommended Technique */}
                        <td className="py-3 px-4">
                          <span className="font-semibold px-2 py-0.5 rounded-lg bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30 text-xs inline-block">
                            {item.repair_method}
                          </span>
                        </td>

                        {/* Estimated Cost */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-['JetBrains_Mono'] text-sm font-bold text-[#38bdf8]">
                            ₹{item.estimated_cost.toLocaleString('en-IN')}
                          </div>
                          <div className="text-[10px] text-[#64748b]">Includes Mob. Fee</div>
                        </td>

                        {/* Action: Open Work Order / Inspect */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleOpenDispatchModal(item)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1f242d] hover:bg-[#38bdf8] hover:text-[#00315c] text-[#cbd5e1] transition-colors cursor-pointer border border-[#30363d]"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Work Order</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Summary */}
          <div className="p-3.5 bg-[#101419] border-t border-[#30363d] flex items-center justify-between text-xs text-[#94a3b8] px-6">
            <span>
              Showing {filteredBOQ.length} of {boqItems?.length || 0} corridor repair items
            </span>
            <div className="flex items-center gap-2">
              <span>Selected Subtotal:</span>
              <span className="font-['JetBrains_Mono'] text-sm font-bold text-[#38bdf8]">
                ₹{filteredBOQ.reduce((acc, curr) => acc + curr.estimated_cost, 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Unit Rates Configuration Modal */}
      <UnitRatesModal
        isOpen={isRatesModalOpen}
        onClose={() => setIsRatesModalOpen(false)}
        rates={activeRates}
        onSave={async (newRates) => {
          await updateRatesMutation.mutateAsync(newRates);
        }}
        onReset={async () => {
          await resetRatesMutation.mutateAsync();
        }}
      />

      {/* Work Order Modal Dispatcher */}
      <WorkOrderModal
        isOpen={activeWorkOrderData !== null}
        onClose={() => setActiveWorkOrderData(null)}
        data={activeWorkOrderData}
      />
    </div>
  );
}
