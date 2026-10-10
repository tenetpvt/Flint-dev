import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Map as MapLibreMap, NavigationControl, Marker, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchAnalyticsSummary } from '../services/analytics';
import type { AnalyticsSummary } from '../services/analytics';
import { fetchJourneys } from '../services/journeys';
import type { Journey } from '../services/journeys';
import { fetchRoutes } from '../services/routes';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { useNavigate } from 'react-router-dom';
import { MAP_STYLE, RAIPUR_CENTER, applyMapTheme } from '../utils/mapStyle';
import type { MapTheme } from '../utils/mapStyle';
import { computePotholeTrafficSegments } from '../utils/trafficHeatmap';
import { MOCK_ROUTES, MOCK_JOURNEYS, MOCK_ANALYTICS_SUMMARY } from '../services/mockData';
import { WorkOrderModal } from '../components/ui/WorkOrderModal';
import type { WorkOrderData } from '../components/ui/WorkOrderModal';
import { useLiveStream } from '../services/useLiveStream';

// Refined KPI Strip
function KPIStrip({ summary, isConnected }: { summary: AnalyticsSummary; isConnected?: boolean }) {
  return (
    <div className="bg-[#181c21] border-b border-[#414752] px-5 py-2.5 flex justify-between items-center z-30 shrink-0">
      <div className="flex items-center divide-x divide-[#414752]">
        <div className="flex items-center pr-6">
          <div className="flex flex-col">
            <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-[0.05em] uppercase mb-0.5">BUSES ACTIVE</span>
            <span className="font-['JetBrains_Mono'] text-[24px] font-bold text-[#e0e2ea] leading-[28px]">{summary.active_buses}</span>
          </div>
        </div>
        <div className="flex items-center px-6">
          <div className="flex flex-col">
            <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-[0.05em] uppercase mb-0.5">ROUTES COMPLETED</span>
            <span className="font-['JetBrains_Mono'] text-[24px] font-bold text-[#38bdf8] leading-[28px]">{summary.completed_routes}</span>
          </div>
        </div>
        <div className="flex items-center px-6">
          <div className="flex flex-col">
            <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-[0.05em] uppercase mb-0.5">DETECTIONS TODAY</span>
            <span className="font-['JetBrains_Mono'] text-[24px] font-bold text-[#e0e2ea] leading-[28px]">{summary.total_findings}</span>
          </div>
        </div>
        <div className="flex items-center px-6">
          <div className="flex flex-col">
            <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-[0.05em] uppercase mb-0.5">REPORTS GENERATED</span>
            <span className="font-['JetBrains_Mono'] text-[24px] font-bold text-[#ffba42] leading-[28px]">{summary.completed_routes}</span>
          </div>
        </div>
        <div className="flex items-center pl-6">
          <div className="flex flex-col">
            <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-[0.05em] uppercase mb-0.5">HIGH-SEVERITY FINDINGS</span>
            <span className="font-['JetBrains_Mono'] text-[24px] font-bold text-[#ffb4ab] leading-[28px]">{summary.live_alerts}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <div className="text-right">
          <div className="font-['JetBrains_Mono'] text-[10px] font-bold text-[#c0c7d4] tracking-[0.05em] uppercase mb-0.5">EDGE INGESTION</div>
          <div className={`font-['Inter'] text-[12px] font-semibold flex items-center justify-end font-bold ${isConnected ? 'text-emerald-400' : 'text-[#38bdf8]'}`}>
            <span className={`w-2 h-2 rounded-full mr-1.5 ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-[#38bdf8] animate-pulse-ring'}`}></span>
            {isConnected ? 'CUDA RTX 3050 (LIVE)' : 'STANDALONE MODE'}
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact Route Intelligence Context Card over Map
function RouteIntelligenceOverlay({ journey, onClose }: { journey: Journey; onClose: () => void }) {
  const navigate = useNavigate();
  const defects = journey.detections.filter(d => d.type === 'ROAD_DEFECT' || d.type === 'ROAD_BLOCKAGE').length;
  const traffic = journey.detections.filter(d => d.type === 'TRAFFIC').length;
  const safety = journey.detections.filter(d => d.type === 'SAFETY').length;

  return (
    <div className="glass-panel rounded-xl p-4 w-[320px] pointer-events-auto shadow-2xl border border-[#414752] animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-start justify-between border-b border-[#414752] pb-2.5 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-['JetBrains_Mono'] text-[14px] font-bold text-[#38bdf8] uppercase tracking-wide">
              {journey.bus.name}
            </span>
            <span className="text-[#8b919d]">·</span>
            <span className="font-['Inter'] text-[13px] font-semibold text-[#e0e2ea]">
              {journey.route.name} · {journey.route.description}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold font-['JetBrains_Mono'] bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30">
              ● {journey.status === 'COMPLETED' ? 'JOURNEY COMPLETED' : 'IN TRANSIT'}
            </span>
            <span className="text-[11px] font-['JetBrains_Mono'] text-[#c0c7d4]">
              {journey.route.distance_km} km · 33 min
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#c0c7d4] hover:text-[#e0e2ea] p-1 rounded hover:bg-[#272a30] transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="space-y-2 mb-3.5">
        <div className="flex justify-between items-center text-xs">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-wider uppercase">ROUTE INTELLIGENCE</span>
          <span className="font-['JetBrains_Mono'] text-[12px] font-bold text-[#e0e2ea]">
            {journey.detections.length} FINDINGS ACCUMULATED
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <div className="bg-[#181c21] p-2 rounded border border-[#414752]/60 text-center">
            <div className="text-[10px] text-[#f87171] font-bold uppercase">DEFECTS</div>
            <div className="font-['JetBrains_Mono'] text-base font-bold text-[#e0e2ea]">{defects}</div>
          </div>
          <div className="bg-[#181c21] p-2 rounded border border-[#414752]/60 text-center">
            <div className="text-[10px] text-[#fbbf24] font-bold uppercase">TRAFFIC</div>
            <div className="font-['JetBrains_Mono'] text-base font-bold text-[#e0e2ea]">{traffic}</div>
          </div>
          <div className="bg-[#181c21] p-2 rounded border border-[#414752]/60 text-center">
            <div className="text-[10px] text-[#c084fc] font-bold uppercase">SAFETY</div>
            <div className="font-['JetBrains_Mono'] text-base font-bold text-[#e0e2ea]">{safety}</div>
          </div>
        </div>
      </div>

      <button
        onClick={() => navigate(`/live-map?journey=${journey.id}`)}
        className="w-full bg-[#38bdf8] hover:bg-[#58a6ff] text-[#00315c] font-bold font-['Inter'] text-[11px] tracking-wide uppercase py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
      >
        <span className="material-symbols-outlined text-[16px]">analytics</span>
        REVIEW ROUTE INTELLIGENCE
      </button>
    </div>
  );
}

// Strengthened Route Report Card
function RouteReportCard({ journey, isPrimary, onSelect }: { journey: Journey; isPrimary: boolean; onSelect: () => void }) {
  const navigate = useNavigate();
  const defects = journey.detections.filter(d => d.type === 'ROAD_DEFECT' || d.type === 'ROAD_BLOCKAGE').length;
  const traffic = journey.detections.filter(d => d.type === 'TRAFFIC').length;
  const safety = journey.detections.filter(d => d.type === 'SAFETY').length;
  const totalFindings = journey.detections.length;

  const timeDiff = journey.end_time
    ? Math.round((Date.now() - new Date(journey.end_time).getTime()) / 60000)
    : 0;
  const timeLabel = timeDiff < 2 ? 'Just now' : `${timeDiff}m ago`;

  if (isPrimary) {
    return (
      <div className="block bg-[#101419] p-4 rounded-xl border border-[#38bdf8]/40 shadow-[0_0_16px_rgba(56,189,248,0.1)] relative">
        {/* Status Badge */}
        <div className="flex items-center justify-between mb-3 border-b border-[#414752]/50 pb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8]"></span>
            <span className="font-['JetBrains_Mono'] text-[10px] font-bold text-[#38bdf8] uppercase tracking-wider">
              ● GENERATED
            </span>
          </div>
          <span className="text-[#8b919d] font-['JetBrains_Mono'] text-[11px]">{timeLabel}</span>
        </div>

        {/* Route Info */}
        <div className="flex items-start mb-3 cursor-pointer" onClick={onSelect}>
          <div className="w-10 h-10 rounded-lg bg-[#38bdf8]/15 flex items-center justify-center mr-3 shrink-0 border border-[#38bdf8]/30">
            <span className="material-symbols-outlined text-[#38bdf8] text-[22px]">directions_bus</span>
          </div>
          <div>
            <div className="font-['JetBrains_Mono'] text-[10px] font-bold text-[#38bdf8] tracking-[0.05em] uppercase mb-0.5">
              NEW ROUTE REPORT
            </div>
            <h4 className="font-['Inter'] text-[17px] font-bold text-[#e0e2ea] leading-tight">
              {journey.bus.name} · Route {journey.route.name}
            </h4>
            <div className="font-['Inter'] text-xs text-[#c0c7d4] mt-0.5">{journey.route.description}</div>
          </div>
        </div>

        {/* Distance & Findings Summary */}
        <div className="bg-[#181c21] rounded-lg p-3 mb-3 border border-[#414752]/50">
          <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-[#414752]/40">
            <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-wider uppercase">TRIP METRICS</span>
            <span className="font-['JetBrains_Mono'] text-[12px] text-[#e0e2ea] font-bold">{journey.route.distance_km} km / 33 min</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#c0c7d4]">
                <span className="w-2 h-2 rounded-full bg-[#f87171]"></span>
                <span className="font-['Inter'] font-medium">{defects} ROAD DEFECTS</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#c0c7d4]">
                <span className="w-2 h-2 rounded-full bg-[#fbbf24]"></span>
                <span className="font-['Inter'] font-medium">{traffic} TRAFFIC EVENTS</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#c0c7d4]">
                <span className="w-2 h-2 rounded-full bg-[#c084fc]"></span>
                <span className="font-['Inter'] font-medium">{safety} SAFETY EVENTS</span>
              </span>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-[#414752]/40 flex justify-between items-center">
            <span className="font-['Inter'] text-[10px] font-bold text-[#8b919d] uppercase">ACCUMULATION</span>
            <span className="font-['JetBrains_Mono'] text-[13px] font-bold text-[#38bdf8]">
              {totalFindings} TOTAL FINDINGS
            </span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => navigate(`/live-map?journey=${journey.id}`)}
          className="w-full bg-[#38bdf8] hover:bg-[#58a6ff] text-[#00315c] font-bold font-['Inter'] text-[11px] tracking-wider uppercase py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
        >
          <span className="material-symbols-outlined text-[17px]">analytics</span>
          REVIEW REPORT
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      className="block bg-[#101419] p-3.5 rounded-xl border border-[#414752] opacity-80 hover:opacity-100 hover:border-[#38bdf8]/40 transition-all cursor-pointer relative"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-['JetBrains_Mono'] text-[10px] font-bold text-[#cbd5e1] uppercase">
          ● GENERATED
        </span>
        <span className="text-[#8b919d] font-['JetBrains_Mono'] text-[10px]">{timeLabel}</span>
      </div>
      <div className="flex items-start mb-2">
        <div className="w-8 h-8 rounded bg-[#32353b] flex items-center justify-center mr-2.5 shrink-0 border border-[#414752]">
          <span className="material-symbols-outlined text-[#c0c7d4] text-[16px]">directions_bus</span>
        </div>
        <div>
          <h4 className="font-['Inter'] text-[14px] font-bold text-[#e0e2ea]">{journey.bus.name} • Route {journey.route.name}</h4>
          <div className="font-['Inter'] text-[11px] text-[#c0c7d4]">{journey.route.description}</div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#414752]/40 text-xs">
        <span className="font-['JetBrains_Mono'] text-[#c0c7d4]">{journey.route.distance_km} km</span>
        <span className="font-['JetBrains_Mono'] text-[#38bdf8] font-bold">{totalFindings} Findings</span>
      </div>
    </div>
  );
}

export function CommandCenter() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null);
  const busMarkerRef = useRef<Marker | null>(null);
  const [workOrderData, setWorkOrderData] = useState<WorkOrderData | null>(null);
  const [isWorkOrderOpen, setIsWorkOrderOpen] = useState(false);
  const [mapTheme, setMapTheme] = useState<MapTheme>('default');
  const { isConnected } = useLiveStream();

  // Switch between Google-style default and satellite basemap (overlays are preserved)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyMapTheme(map, mapTheme);
  }, [mapTheme, mapReady]);

  const { data: summary = MOCK_ANALYTICS_SUMMARY, isLoading: summaryLoading, error: summaryError, refetch: refetchSummary } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: fetchAnalyticsSummary,
    initialData: MOCK_ANALYTICS_SUMMARY,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 10_000,
  });

  const { data: journeys = MOCK_JOURNEYS, isLoading: journeysLoading, error: journeysError, refetch: refetchJourneys } = useQuery({
    queryKey: ['journeys'],
    queryFn: fetchJourneys,
    initialData: MOCK_JOURNEYS,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 10_000,
  });

  const { data: routes = MOCK_ROUTES } = useQuery({
    queryKey: ['routes'],
    queryFn: fetchRoutes,
    initialData: MOCK_ROUTES,
  });

  const safeSummary: AnalyticsSummary = (summary && typeof summary === 'object' && !Array.isArray(summary) && 'active_buses' in summary)
    ? summary
    : MOCK_ANALYTICS_SUMMARY;

  const safeJourneys: Journey[] = Array.isArray(journeys) ? journeys : MOCK_JOURNEYS;
  const safeRoutes: typeof MOCK_ROUTES = Array.isArray(routes) ? routes : MOCK_ROUTES;

  // Callback ref for mounting
  const setMapContainer = useCallback((node: HTMLDivElement | null) => {
    if (node && !mapRef.current) {
      mapContainerRef.current = node;
      try {
        const map = new MapLibreMap({
          container: node,
          style: MAP_STYLE,
          center: RAIPUR_CENTER,
          zoom: 12.5,
        });

        map.addControl(new NavigationControl({ showCompass: false }), 'bottom-left');
        map.on('load', () => setMapReady(true));
        if (map.isStyleLoaded()) {
          setMapReady(true);
        }
        mapRef.current = map;
        (window as any).flintMap = map;
      } catch (e) {
        console.error("Map init error:", e);
      }
    }
  }, []);

  // Cleanup map instance on component unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  // Listen for real-time bus telemetry to move bus marker smoothly along R3
  useEffect(() => {
    const handleBusTelemetry = (e: any) => {
      const coords = e.detail?.coordinates;
      const map = mapRef.current;
      if (!coords || !map) return;

      if (busMarkerRef.current) {
        busMarkerRef.current.setLngLat(coords);
      } else {
        const busEl = document.createElement('div');
        busEl.style.cssText = 'width:32px;height:32px;border-radius:8px;background:#0f172a;border:2px solid #38bdf8;display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px rgba(56,189,248,0.7);cursor:pointer;z-index:50';
        busEl.innerHTML = `<span class="material-symbols-outlined animate-pulse" style="font-size:20px;color:#38bdf8">directions_bus</span>`;
        const marker = new Marker({ element: busEl })
          .setLngLat(coords)
          .addTo(map);
        busMarkerRef.current = marker;
      }
    };
    window.addEventListener('flint:bus-telemetry', handleBusTelemetry);
    return () => window.removeEventListener('flint:bus-telemetry', handleBusTelemetry);
  }, [mapReady]);

  // Listen for dynamic field survey routes and auto-fit bounds
  useEffect(() => {
    const handleNewSurveyRoute = (e: any) => {
      const route = e.detail;
      const map = mapRef.current;
      if (!map || !route || !route.geojson_path) return;

      try {
        const coords = typeof route.geojson_path === 'string' ? JSON.parse(route.geojson_path) : route.geojson_path;
        if (coords && coords.length > 1) {
          const bounds = coords.reduce(
            (b: any, coord: [number, number]) => b.extend(coord),
            new LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1800 });
        }
      } catch (err) {
        console.error('Failed to fit bounds to survey route:', err);
      }
    };

    window.addEventListener('flint:new-survey-route', handleNewSurveyRoute);
    return () => window.removeEventListener('flint:new-survey-route', handleNewSurveyRoute);
  }, []);

  // Auto-focus on primary route/journey on reload/mount
  const hasAutoFittedRef = useRef<boolean>(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || hasAutoFittedRef.current) return;

    const primaryJourney = safeJourneys?.[0];
    const targetRoute = primaryJourney?.route || safeRoutes?.[0];
    if (targetRoute && targetRoute.geojson_path) {
      try {
        const coords = typeof targetRoute.geojson_path === 'string' ? JSON.parse(targetRoute.geojson_path) : targetRoute.geojson_path;
        if (coords && coords.length > 1) {
          const bounds = coords.reduce(
            (b: any, coord: [number, number]) => b.extend(coord),
            new LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1500 });
          hasAutoFittedRef.current = true;
          setSelectedRouteId(targetRoute.id);
          if (primaryJourney) {
            setSelectedJourney(primaryJourney);
          }
        }
      } catch (err) {
        console.error('Failed to auto-focus primary route on CC:', err);
      }
    }
  }, [mapReady, safeRoutes, safeJourneys]);

  // Listen for window resize / sidebar toggle
  useEffect(() => {
    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Render Route Lines + Wide Invisible Click Hitbox Layers with Google Maps Traffic Styling
  useEffect(() => {
    const map = mapRef.current;
    const ready = map && (mapReady || map.isStyleLoaded());
    if (!map || !ready || !safeRoutes || safeRoutes.length === 0) return;

    const allDetections = safeJourneys.flatMap(j => j.detections || []);

    safeRoutes.forEach(route => {
      const sourceId = `cc-route-${route.id}`;
      const haloLayerId = `cc-halo-${route.id}`;
      const lineLayerId = `cc-layer-${route.id}`;
      const hitboxLayerId = `cc-hitbox-${route.id}`;
      const isSelected = selectedRouteId === route.id;
      const primaryRouteId = safeRoutes?.[0]?.id || 1;
      const isActiveCorridor = isSelected || (!selectedRouteId && route.id === primaryRouteId);

      // Safely extract coordinates from either stringified or array representation
      let coords: [number, number][] = [];
      if (typeof route.geojson_path === 'string') {
        try {
          coords = JSON.parse(route.geojson_path);
        } catch (e) {
          console.error(`Error parsing geojson_path for route ${route.name}:`, e);
        }
      } else if (Array.isArray(route.geojson_path)) {
        coords = route.geojson_path as any;
      }

      if (!coords || !Array.isArray(coords) || coords.length < 2) {
        return;
      }

      // Compute Google Maps traffic-style segments (50-70m radius)
      const routeDets = safeJourneys.filter(j => j.route_id === route.id).flatMap(j => j.detections || []);
      const trafficSegments = computePotholeTrafficSegments(coords, routeDets.length > 0 ? routeDets : allDetections, 60);

      const featureCollection = {
        type: 'FeatureCollection' as const,
        features: trafficSegments.map(seg => ({
          type: 'Feature' as const,
          properties: {
            color: seg.color,
            potholeCount: seg.potholeCount,
            statusLabel: seg.statusLabel,
            routeId: route.id,
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: seg.coordinates,
          },
        })),
      };

      // Add or update source
      const existingSource = map.getSource(sourceId) as any;
      if (!existingSource) {
        try {
          map.addSource(sourceId, {
            type: 'geojson',
            data: featureCollection,
          });
        } catch (e) {
          console.error(`Error adding source ${sourceId}:`, e);
          return;
        }
      } else {
        try {
          existingSource.setData(featureCollection);
        } catch { /* ignore */ }
      }

      // Base dark casing underlay so colors pop on both light and satellite tiles
      if (!map.getLayer(haloLayerId)) {
        try {
          map.addLayer({
            id: haloLayerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': '#0f172a',
              'line-width': isSelected ? 8.5 : 7.0,
              'line-opacity': 0.55,
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          });
        } catch { /* ignore */ }
      }

      // Google Maps Traffic Color Line Layer (Green -> Orange -> Red -> Dark Red)
      if (!map.getLayer(lineLayerId)) {
        try {
          map.addLayer({
            id: lineLayerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': ['get', 'color'] as any,
              'line-width': isSelected ? 6.5 : (isActiveCorridor ? 5.0 : 3.5),
              'line-opacity': isSelected ? 1 : (isActiveCorridor ? 1.0 : 0.85),
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          });
        } catch (e) {
          console.error(`Error adding line layer ${lineLayerId}:`, e);
        }
      } else {
        map.setPaintProperty(lineLayerId, 'line-color', ['get', 'color'] as any);
        map.setPaintProperty(lineLayerId, 'line-width', isSelected ? 6.5 : (isActiveCorridor ? 5.0 : 3.5));
        map.setPaintProperty(lineLayerId, 'line-opacity', isSelected ? 1 : (isActiveCorridor ? 1.0 : 0.85));
      }

      // Hitbox layer for route selection
      if (!map.getLayer(hitboxLayerId)) {
        try {
          map.addLayer({
            id: hitboxLayerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': '#000000',
              'line-width': 30,
              'line-opacity': 0.001,
            },
          });

          const handleRouteSelect = () => {
            setSelectedRouteId(route.id);
            const matchingJourneys = safeJourneys.filter(j => j.route_id === route.id);
            const j = matchingJourneys.sort((a, b) => (b.detections?.length || 0) - (a.detections?.length || 0))[0] || safeJourneys[0] || null;
            setSelectedJourney(j);
            if (j && j.detections && j.detections.length > 0) {
              const det = j.detections[0];
              setWorkOrderData({
                ticketId: `PWD-RAI-2026-${String(det.id || 1042)}`,
                defectType: det.type,
                severity: det.severity as any,
                lat: det.lat,
                lon: det.lon,
                streetName: `${j.route.name} (${j.route.description})`,
                confidence: det.confidence || 0.94,
                evidenceUrl: det.evidence_url,
                videoTimestamp: (det as any)?.video_timestamp_sec,
                trafficWeight: 3.0,
                detectedAt: det.timestamp,
                busId: j.bus.name,
              });
            }
          };

          map.on('click', hitboxLayerId, handleRouteSelect);
          map.on('click', lineLayerId, handleRouteSelect);
          map.on('mouseenter', hitboxLayerId, () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', hitboxLayerId, () => {
            map.getCanvas().style.cursor = '';
          });
        } catch { /* ignore */ }
      }
    });
  }, [mapReady, safeRoutes, selectedRouteId, safeJourneys]);

  // Render ONLY Active Bus Marker (Red round circular pothole markers completely removed)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !safeJourneys) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Active Bus Marker on Primary Journey
    const activeJourney = safeJourneys.find(j => j.status === 'ACTIVE') || safeJourneys[0];
    if (activeJourney && activeJourney.bus?.last_lon && activeJourney.bus?.last_lat) {
      const busName = activeJourney.bus.name || 'BUS-01';
      const busEl = document.createElement('div');
      busEl.className = 'flex flex-col items-center cursor-pointer group z-30';
      busEl.innerHTML = `
        <div class="w-7 h-7 rounded-lg bg-[#0f172a] border-2 border-[#38bdf8] flex items-center justify-center shadow-lg relative">
          <span class="material-symbols-outlined text-[16px] text-[#38bdf8]">directions_bus</span>
          <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse-ring"></span>
        </div>
        <div class="mt-0.5 bg-[#0b0e14]/95 border border-[#38bdf8]/50 rounded px-1.5 py-0.5 text-[9px] font-['JetBrains_Mono'] text-[#38bdf8] font-bold shadow-md">
          ${busName}
        </div>
      `;
      busEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedRouteId(activeJourney.route_id);
        setSelectedJourney(activeJourney);
      });

      const busMarker = new Marker({ element: busEl })
        .setLngLat([activeJourney.bus.last_lon, activeJourney.bus.last_lat])
        .addTo(map);
      busMarkerRef.current = busMarker;
      markersRef.current.push(busMarker);
    }
  }, [mapReady, safeJourneys]);

  if (summaryError && !safeSummary) return <ErrorState message="FLINT API connection unavailable." onRetry={() => refetchSummary()} />;
  if (journeysError && safeJourneys.length === 0) return <ErrorState message="Could not load journey data." onRetry={() => refetchJourneys()} />;

  const completedJourneys = safeJourneys.filter(j => j.status === 'COMPLETED');

  return (
    <div className="flex flex-col h-full">
      <KPIStrip summary={safeSummary} isConnected={isConnected} />

      <div className="flex-1 flex overflow-hidden">
        {/* Real Raipur Map Area */}
        <div className="flex-1 relative bg-[#0a0f16]">
          {summaryLoading && (
            <div className="absolute inset-0 z-20 bg-[#0a0f16]/60 flex items-center justify-center">
              <LoadingState message="Loading Command Center GIS..." />
            </div>
          )}
          <div ref={setMapContainer} className="absolute inset-0 w-full h-full" />

          {/* Map Controls (top-center): Default/Satellite */}
          <div
            id="map-theme-toggle"
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-slate-300 rounded-xl p-1 shadow-lg"
          >
            {([
              { key: 'default', label: 'Default', icon: 'map' },
              { key: 'satellite', label: 'Satellite', icon: 'satellite_alt' },
            ] as { key: MapTheme; label: string; icon: string }[]).map(opt => (
              <button
                key={opt.key}
                id={`map-theme-${opt.key}`}
                onClick={() => setMapTheme(opt.key)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-['Inter'] text-[12px] font-semibold transition-all cursor-pointer ${
                  mapTheme === opt.key
                    ? 'bg-[#0e7490] text-white shadow-md'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Map Legend Overlay: Road Conditions & Hazards */}
          <div className="absolute top-3 left-3 bg-[#0f172a]/95 backdrop-blur-md border border-[#334155] rounded-xl p-3 shadow-xl min-w-[215px] pointer-events-auto z-10">
            <div className="flex items-center justify-between border-b border-[#334155]/60 pb-1.5 mb-2">
              <h4 className="font-['Inter'] text-[10px] font-bold text-[#cbd5e1] tracking-[0.05em] uppercase flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                ROAD CONDITIONS
              </h4>
              <span className="font-['JetBrains_Mono'] text-[9px] text-[#38bdf8] font-bold">LIVE GIS</span>
            </div>
            <ul className="space-y-1.5 text-xs font-['Inter']">
              <li className="flex items-center justify-between text-[#e2e8f0]">
                <div className="flex items-center">
                  <div className="w-4 h-2 bg-[#22c55e] mr-2.5 rounded-sm shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
                  Smooth Road
                </div>
                <span className="font-['JetBrains_Mono'] text-[10px] text-emerald-400">Clear</span>
              </li>
              <li className="flex items-center justify-between text-[#e2e8f0]">
                <div className="flex items-center">
                  <div className="w-4 h-2 bg-[#ef4444] mr-2.5 rounded-sm shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                  Potholes
                </div>
                <span className="font-['JetBrains_Mono'] text-[10px] text-red-400 font-semibold">Red</span>
              </li>
              <li className="flex items-center justify-between text-[#e2e8f0]">
                <div className="flex items-center">
                  <div className="w-4 h-2 bg-[#1d4ed8] mr-2.5 rounded-sm shadow-[0_0_6px_rgba(29,78,216,0.6)]" />
                  Waterloggings
                </div>
                <span className="font-['JetBrains_Mono'] text-[10px] text-blue-400 font-semibold">Dark Blue</span>
              </li>
              <li className="flex items-center justify-between text-[#e2e8f0]">
                <div className="flex items-center">
                  <div className="w-4 h-2 bg-[#eab308] mr-2.5 rounded-sm shadow-[0_0_6px_rgba(234,179,8,0.6)]" />
                  Traffic
                </div>
                <span className="font-['JetBrains_Mono'] text-[10px] text-yellow-400 font-semibold">Yellow</span>
              </li>
              <li className="flex items-center justify-between text-[#e2e8f0]">
                <div className="flex items-center">
                  <div className="w-4 h-2 bg-[#9333ea] mr-2.5 rounded-sm shadow-[0_0_6px_rgba(147,51,234,0.6)]" />
                  Waterlogging + Potholes
                </div>
                <span className="font-['JetBrains_Mono'] text-[10px] text-purple-400 font-semibold">Purple</span>
              </li>
              <li className="flex items-center justify-between text-[#e2e8f0] pt-1.5 border-t border-[#334155]/60">
                <div className="flex items-center">
                  <span className="material-symbols-outlined text-[15px] text-[#38bdf8] mr-2 w-3.5 text-center">directions_bus</span>
                  Active Bus ({safeJourneys?.[0]?.bus?.name || 'BUS-01'})
                </div>
                <span className="font-['JetBrains_Mono'] text-[10px] text-emerald-400 font-bold">ONLINE</span>
              </li>
            </ul>
          </div>

          {/* Interactive Route Context Overlay when Selected */}
          {selectedJourney && (
            <div className="absolute bottom-4 left-4 z-20">
              <RouteIntelligenceOverlay
                journey={selectedJourney}
                onClose={() => {
                  setSelectedJourney(null);
                  setSelectedRouteId(null);
                }}
              />
            </div>
          )}
        </div>

        {/* Route Reports Panel */}
        <div className="w-[380px] bg-[#181c21] border-l border-[#414752] flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[#414752] flex justify-between items-center bg-[#101419]">
            <h3 className="font-['Inter'] text-[14px] font-bold text-[#e0e2ea] flex items-center tracking-tight">
              <span className="material-symbols-outlined mr-2 text-[#38bdf8] text-[18px]">route</span>
              ROUTE REPORTS
            </h3>
            <span className="text-[10px] font-['JetBrains_Mono'] text-[#c0c7d4] bg-[#272a30] px-2 py-0.5 rounded border border-[#414752]">
              {completedJourneys.length} REPORT
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {journeysLoading ? (
              <LoadingState message="Loading Route Reports..." />
            ) : completedJourneys.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="material-symbols-outlined text-[40px] text-[#414752] mb-3">route</span>
                <h3 className="text-[#c0c7d4] font-semibold text-sm mb-0.5">NO ROUTE REPORTS</h3>
                <p className="text-[#8b919d] text-xs">No completed journeys yet. Start a simulation.</p>
              </div>
            ) : (
              completedJourneys.map((journey, i) => (
                <RouteReportCard
                  key={journey.id}
                  journey={journey}
                  isPrimary={i === 0}
                  onSelect={() => {
                    setSelectedRouteId(journey.route_id);
                    setSelectedJourney(journey);
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Municipal PWD Work Order Modal */}
      <WorkOrderModal
        isOpen={isWorkOrderOpen}
        onClose={() => setIsWorkOrderOpen(false)}
        data={workOrderData}
      />
    </div>
  );
}
