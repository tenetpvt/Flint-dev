import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Sliders,
  Search,
  Check,
  Copy,
  ChevronDown,
  FileText,
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
import { MAP_STYLE, DARK_MAP_STYLE, RAIPUR_CENTER } from '../utils/mapStyle';
import { UnitRatesModal } from '../components/cost/UnitRatesModal';
import { WorkOrderModal, type WorkOrderData } from '../components/ui/WorkOrderModal';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusDot } from '../components/ui/StatusDot';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EmptyState } from '../components/ui/EmptyState';

export function CostBudget() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
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

  // 2. Fetch Cost Summary
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useQuery({
    queryKey: ['cost-summary', selectedRouteId],
    queryFn: () => fetchCostSummary(selectedRouteId),
  });

  // 3. Fetch BOQ Items
  const {
    data: boqItems,
    isLoading: boqLoading,
    error: boqError,
  } = useQuery({
    queryKey: ['cost-boq', selectedRouteId],
    queryFn: () => fetchBOQ(selectedRouteId),
  });

  // 4. Fetch Unit Rates
  const { data: rates } = useQuery({
    queryKey: ['cost-rates'],
    queryFn: fetchUnitRates,
  });

  const updateRatesMutation = useMutation({
    mutationFn: (newRates: UnitRatesConfig) => updateUnitRates(newRates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cost-boq'] });
      queryClient.invalidateQueries({ queryKey: ['cost-rates'] });
    },
  });

  // Selected route GeoJSON geometry
  const selectedRouteGeoJSON = useMemo(() => {
    if (!selectedRouteId || !routes) return null;
    const r = routes.find((x) => x.id === selectedRouteId);
    if (!r?.geojson_path) return null;
    try {
      const coords = JSON.parse(r.geojson_path);
      return {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: coords },
        properties: {},
      };
    } catch {
      return null;
    }
  }, [selectedRouteId, routes]);

  // Filtered BOQ list
  const filteredBOQ = useMemo(() => {
    if (!boqItems) return [];
    return boqItems.filter((item) => {
      const matchSearch =
        searchTerm === '' ||
        item.id.toString().includes(searchTerm) ||
        item.location_label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type.toLowerCase().includes(searchTerm.toLowerCase());

      const matchSev =
        severityFilter === 'ALL' || item.severity.toUpperCase() === severityFilter;

      return matchSearch && matchSev;
    });
  }, [boqItems, searchTerm, severityFilter]);

  // MapLibre init
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: theme === 'light' ? MAP_STYLE : DARK_MAP_STYLE,
      center: RAIPUR_CENTER,
      zoom: 12,
      attributionControl: false,
    });

    map.on('load', () => {
      map.addSource('route-corridor', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'corridor-casing',
        type: 'line',
        source: 'route-corridor',
        paint: {
          'line-color': '#000000',
          'line-width': 6,
          'line-opacity': 0.35,
        },
      });

      map.addLayer({
        id: 'corridor-core',
        type: 'line',
        source: 'route-corridor',
        paint: {
          'line-color': '#7C6CF0',
          'line-width': 3.5,
          'line-opacity': 0.85,
        },
      });
    });

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [theme]);

  // Sync corridor and defect markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateSource = () => {
      const src = map.getSource('route-corridor') as any;
      if (src) {
        if (selectedRouteGeoJSON) {
          src.setData(selectedRouteGeoJSON);
          const bounds = new LngLatBounds();
          (selectedRouteGeoJSON.geometry.coordinates as [number, number][]).forEach((c) =>
            bounds.extend(c)
          );
          map.fitBounds(bounds, { padding: 40, maxZoom: 14 });
        } else {
          src.setData({ type: 'FeatureCollection', features: [] });
        }
      }
    };

    if (map.isStyleLoaded()) {
      updateSource();
    } else {
      map.once('load', updateSource);
    }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (boqItems && boqItems.length > 0) {
      const bounds = new LngLatBounds();

      boqItems.forEach((defect) => {
        const markerEl = document.createElement('div');
        markerEl.className = 'cursor-pointer group relative';

        const color =
          defect.severity === 'CRITICAL'
            ? '#F0524F'
            : defect.severity === 'HIGH'
            ? '#F59E0B'
            : defect.severity === 'MEDIUM'
            ? '#EAB308'
            : '#6B7280';

        markerEl.innerHTML = `
          <div style="background-color: ${color};" class="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm flex items-center justify-center">
            <div class="w-1 h-1 rounded-full bg-white"></div>
          </div>
        `;

        const popup = new Popup({ offset: 12, closeButton: false }).setHTML(`
          <div style="background: var(--surface, #151821); border: 1px solid var(--border-subtle, #242938); border-radius: 8px; padding: 10px; color: var(--text-primary, #EDF0F5); font-family: Inter, sans-serif; width: 200px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-family: monospace; font-size: 11px; font-weight: 600; color: ${color};">DEF-${String(defect.id).padStart(4, '0')}</span>
              <span style="font-size: 10px; font-weight: 500;">${defect.severity}</span>
            </div>
            <div style="font-size: 11px; font-weight: 500; margin-bottom: 2px;">${defect.location_label}</div>
            <div style="font-size: 10px; color: var(--text-muted, #8A90A0); margin-bottom: 6px;">${defect.repair_method} · ${defect.estimated_area_sq_m.toFixed(2)} m²</div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle, #242938); padding-top: 4px;">
              <span style="font-size: 10px; color: var(--text-muted, #8A90A0);">Est. cost:</span>
              <span style="font-family: monospace; font-size: 12px; font-weight: 600;">₹${defect.estimated_cost.toLocaleString('en-IN')}</span>
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

      if (!selectedRouteGeoJSON && !bounds.isEmpty()) {
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
      severity: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(item.severity)
        ? item.severity
        : 'MEDIUM') as any,
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
    return <LoadingState message="Calculating repair quantities and budget..." />;
  }

  if ((summaryError || boqError) && !summary) {
    return <ErrorState message="Could not load cost estimation data." />;
  }

  const totalCost = summary?.total_estimated_cost || 0;
  const totalDefects = summary?.total_defects || 0;
  const criticalBacklog = summary?.critical_backlog_cost || 0;
  const asphaltTons = summary?.estimated_asphalt_metric_tons || 0;
  const coldBags = summary?.estimated_cold_mix_bags || 0;
  const backlogPercent = totalCost > 0 ? Math.round((criticalBacklog / totalCost) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)] text-[var(--text-primary)] overflow-y-auto">
      {/* Top Header / Route Toolbar */}
      <div className="bg-[var(--surface)] border-b border-[var(--border-subtle)] px-6 py-3 flex flex-wrap gap-3 justify-between items-center shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            Corridor filter:
          </span>
          <div className="relative min-w-[260px]">
            <select
              value={selectedRouteId ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedRouteId(val === '' ? null : Number(val));
              }}
              className="w-full appearance-none bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 pr-8 text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="">All corridors (Raipur network)</option>
              {routes?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.description} ({r.distance_km} km)
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => downloadWorkOrderCSV(selectedRouteId, boqItems)}
          >
            Export work order (CSV)
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={<Sliders className="w-3.5 h-3.5" />}
            onClick={() => setIsRatesModalOpen(true)}
          >
            Configure unit rates
          </Button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6 pb-20">
        {/* Top 4 Aurora KPI Tiles */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Tile 1: Total Route Repair Budget */}
          <div
            className="p-4 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-lavender)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Total repair budget
            </div>
            <div
              className="text-2xl font-semibold tabular-nums mt-1 font-mono"
              style={{ color: 'var(--kpi-text)' }}
            >
              ₹{totalCost.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">
              CPWD Schedule of Rates (SOR) baseline
            </div>
          </div>

          {/* Tile 2: Total Defects */}
          <div
            className="p-4 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-sky)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Identified hazards
            </div>
            <div
              className="text-2xl font-semibold tabular-nums mt-1"
              style={{ color: 'var(--kpi-text)' }}
            >
              {totalDefects}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">
              Confirmed via dual-head perception
            </div>
          </div>

          {/* Tile 3: Critical Backlog */}
          <div
            className="p-4 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-indigo)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Critical repair backlog
            </div>
            <div
              className={`text-2xl font-semibold tabular-nums mt-1 font-mono ${
                criticalBacklog > 0 ? 'text-[#F0524F]' : ''
              }`}
              style={{ color: criticalBacklog > 0 ? '#F0524F' : 'var(--kpi-text)' }}
            >
              ₹{criticalBacklog.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">
              {backlogPercent}% of total estimated budget
            </div>
          </div>

          {/* Tile 4: Estimated Material */}
          <div
            className="p-4 rounded-xl border transition-all"
            style={{
              background: 'var(--kpi-mint)',
              borderColor: 'var(--kpi-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div className="text-[11px] font-medium text-[var(--text-muted)]">
              Material requirement
            </div>
            <div
              className="text-2xl font-semibold tabular-nums mt-1 font-mono"
              style={{ color: 'var(--kpi-text)' }}
            >
              {asphaltTons} MT <span className="text-xs font-normal text-[var(--text-muted)]">/ {coldBags} bags</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">
              Hot-mix asphalt & cold patch mix
            </div>
          </div>
        </section>

        {/* Spatial Distribution Map & Visual Breakdown (2-Column Grid) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Corridor Mini-Map */}
          <Card className="lg:col-span-7 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Corridor defect spatial distribution
              </h3>
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <StatusDot status="critical" label="Critical" />
                <StatusDot status="high" label="High" />
                <StatusDot status="medium" label="Medium" />
                <StatusDot status="low" label="Low" />
              </div>
            </div>

            <div className="relative w-full h-[320px] rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
              <div ref={mapContainerRef} className="w-full h-full" />
            </div>
          </Card>

          {/* Right Column: Breakdown Charts */}
          <div className="lg:col-span-5 space-y-4">
            {/* Cost by Severity */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                  Cost by severity tier
                </h3>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">Triage share</span>
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
                            <div className="bg-[var(--surface)] border border-[var(--border-subtle)] p-2 rounded-lg text-xs shadow-lg">
                              <p className="font-semibold text-[var(--text-primary)]">{data.label}</p>
                              <p className="font-mono text-[var(--accent)]">
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

              <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-[var(--border-subtle)]">
                {summary?.cost_by_severity?.map((item) => (
                  <div key={item.severity} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-[var(--text-secondary)] truncate">{item.severity}</span>
                    </div>
                    <span className="font-mono text-[var(--text-muted)] ml-1 shrink-0">
                      ₹{Math.round(item.cost / 1000)}k
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Cost by Repair Technique */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                  Cost by repair technique
                </h3>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">Material method</span>
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
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-[var(--surface)] border border-[var(--border-subtle)] p-2 rounded-lg text-xs shadow-lg">
                              <p className="font-semibold text-[var(--text-primary)]">{data.method}</p>
                              <p className="font-mono text-[var(--accent)]">
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
            </Card>
          </div>
        </section>

        {/* Itemized Bill of Quantities (BOQ) Table */}
        <Card className="overflow-hidden p-0">
          {/* Table Toolbar */}
          <div className="p-3 border-b border-[var(--border-subtle)] flex flex-wrap gap-3 items-center justify-between bg-[var(--surface-raised)]/40">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Itemized bill of quantities (BOQ)
              </h3>
              <span className="font-mono text-[10px] text-[var(--text-muted)] px-1.5 py-0.2 rounded bg-[var(--surface)] border border-[var(--border-subtle)]">
                {filteredBOQ.length} items
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by defect ID, road..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg py-1 pl-7 pr-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] w-52"
                />
              </div>

              <SegmentedControl
                size="sm"
                value={severityFilter}
                onChange={(v) => setSeverityFilter(v)}
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'CRITICAL', label: 'Critical' },
                  { value: 'HIGH', label: 'High' },
                  { value: 'MEDIUM', label: 'Medium' },
                  { value: 'LOW', label: 'Low' },
                ]}
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-muted)]">
                  <th className="py-2.5 px-4">Defect</th>
                  <th className="py-2.5 px-4">Chainage location</th>
                  <th className="py-2.5 px-4">Coordinates</th>
                  <th className="py-2.5 px-4">Dimensions</th>
                  <th className="py-2.5 px-4">Technique</th>
                  <th className="py-2.5 px-4 text-right">Estimated cost</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredBOQ.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <EmptyState
                        title="No defects match filter"
                        description="Adjust your search criteria or corridor filter."
                      />
                    </td>
                  </tr>
                ) : (
                  filteredBOQ.map((item) => {
                    const dotStatus =
                      item.severity === 'CRITICAL'
                        ? 'critical'
                        : item.severity === 'HIGH'
                        ? 'high'
                        : item.severity === 'LOW'
                        ? 'low'
                        : 'medium';

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-[var(--surface-raised)]/60 transition-colors duration-100"
                      >
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <StatusDot status={dotStatus} />
                            <div>
                              <div className="font-mono text-xs font-medium text-[var(--text-primary)]">
                                DEF-{String(item.id).padStart(4, '0')}
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)]">
                                {item.type}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-4 text-[var(--text-secondary)]">
                          <div className="font-medium text-[var(--text-primary)]">
                            {item.location_label}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {item.route_name}
                          </div>
                        </td>

                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)]">
                            <span>
                              {item.lat.toFixed(5)}, {item.lon.toFixed(5)}
                            </span>
                            <button
                              onClick={() => handleCopyCoords(item)}
                              title="Copy Coordinates"
                              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              {copiedId === item.id ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        <td className="py-2.5 px-4 font-mono text-xs text-[var(--text-secondary)]">
                          {item.estimated_area_sq_m.toFixed(2)} m²
                        </td>

                        <td className="py-2.5 px-4 text-[var(--text-secondary)]">
                          {item.repair_method}
                        </td>

                        <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-[var(--text-primary)]">
                          ₹{item.estimated_cost.toLocaleString('en-IN')}
                        </td>

                        <td className="py-2.5 px-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<FileText className="w-3.5 h-3.5" />}
                            onClick={() => handleOpenDispatchModal(item)}
                          >
                            Dispatch
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Unit Rates Config Modal */}
      {rates && (
        <UnitRatesModal
          isOpen={isRatesModalOpen}
          onClose={() => setIsRatesModalOpen(false)}
          rates={rates}
          onSave={async (newRates) => {
            await updateRatesMutation.mutateAsync(newRates);
          }}
          onReset={async () => {
            await resetUnitRates();
            queryClient.invalidateQueries({ queryKey: ['cost-rates'] });
            queryClient.invalidateQueries({ queryKey: ['cost-summary'] });
          }}
        />
      )}

      {/* Work Order Modal */}
      <WorkOrderModal
        isOpen={Boolean(activeWorkOrderData)}
        onClose={() => setActiveWorkOrderData(null)}
        data={activeWorkOrderData}
      />
    </div>
  );
}
