import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Map as MapLibreMap, NavigationControl, Marker, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchBuses } from '../services/buses';
import type { Bus } from '../services/buses';
import { fetchRoutes } from '../services/routes';
import { fetchJourneys } from '../services/journeys';
import type { Journey } from '../services/journeys';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { MAP_STYLE, RAIPUR_CENTER, applyMapTheme } from '../utils/mapStyle';
import type { MapTheme } from '../utils/mapStyle';
import { MOCK_ROUTES, MOCK_JOURNEYS, MOCK_BUSES } from '../services/mockData';
import { WorkOrderModal } from '../components/ui/WorkOrderModal';
import type { WorkOrderData } from '../components/ui/WorkOrderModal';
import { useLiveStream } from '../services/useLiveStream';
import { computePotholeTrafficSegments } from '../utils/trafficHeatmap';

function FleetPanel({ buses, journeys, selectedJourneyId, onSelectJourney }: {
  buses: Bus[];
  journeys: Journey[];
  selectedJourneyId: number | null;
  onSelectJourney: (j: Journey | null) => void;
}) {
  return (
    <div className="glass-panel rounded-xl p-4 w-[260px] pointer-events-auto flex flex-col gap-3 shadow-xl">
      <h3 className="font-['Inter'] text-[11px] font-bold text-[#c0c7d4] uppercase tracking-widest border-b border-[#414752] pb-2">
        FLEET / ROUTES
      </h3>
      <div className="flex flex-col gap-2 pt-0.5 max-h-[360px] overflow-y-auto">
        {buses.map(bus => {
          const journey = journeys.find(j => j.bus.name === bus.name);
          const isSelected = journey && journey.id === selectedJourneyId;
          const statusLabel = journey ? (journey.status === 'COMPLETED' ? 'COMPLETED' : 'IN TRANSIT') : (bus.status === 'IDLE' ? 'IDLE' : 'ACTIVE');

          return (
            <div
              key={bus.id}
              onClick={() => journey ? onSelectJourney(isSelected ? null : journey) : undefined}
              className={`flex items-center justify-between cursor-pointer transition-colors rounded-lg px-2.5 py-1.5 ${
                isSelected
                  ? 'bg-[#38bdf8]/15 -mx-1 border border-[#38bdf8]/40 shadow-sm'
                  : bus.status === 'IDLE' ? 'opacity-40' : 'hover:bg-[#181c21]/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[16px] text-[#38bdf8]">directions_bus</span>
                <span className={`font-['JetBrains_Mono'] text-[12px] ${isSelected ? 'text-[#38bdf8] font-bold' : 'text-[#e0e2ea]'}`}>
                  {bus.name} {journey ? `· ${journey.route.name}` : ''}
                </span>
              </div>
              <span className={`font-['Inter'] text-[10px] font-bold tracking-[0.05em] uppercase px-1.5 py-0.5 rounded border ${
                isSelected
                  ? 'text-[#38bdf8] bg-[#38bdf8]/20 border-[#38bdf8]/40'
                  : statusLabel === 'COMPLETED'
                    ? 'text-[#cbd5e1] bg-[#cbd5e1]/10 border-[#cbd5e1]/30 font-semibold'
                    : statusLabel === 'IDLE'
                      ? 'text-[#c0c7d4] border-[#414752]'
                      : 'text-[#38bdf8] bg-[#38bdf8]/10 border-[#38bdf8]/20'
              }`}>
                {statusLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoadConditionsPanel({ activeBusName = 'BUS-01' }: { activeBusName?: string }) {
  return (
    <div className="bg-[#0f172a]/95 backdrop-blur-md border border-[#334155] rounded-xl p-3 shadow-xl min-w-[215px] pointer-events-auto">
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
            <div className="w-4 h-2 bg-[#22c55e] mr-2.5 rounded-full shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
            Smooth Road
          </div>
          <span className="font-['JetBrains_Mono'] text-[10px] text-emerald-400">Clear</span>
        </li>
        <li className="flex items-center justify-between text-[#e2e8f0]">
          <div className="flex items-center">
            <div className="w-4 h-2 bg-[#ef4444] mr-2.5 rounded-full shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
            Potholes
          </div>
          <span className="font-['JetBrains_Mono'] text-[10px] text-red-400 font-semibold">Red</span>
        </li>
        <li className="flex items-center justify-between text-[#e2e8f0]">
          <div className="flex items-center">
            <div className="w-4 h-2 bg-[#1d4ed8] mr-2.5 rounded-full shadow-[0_0_6px_rgba(29,78,216,0.6)]" />
            Waterloggings
          </div>
          <span className="font-['JetBrains_Mono'] text-[10px] text-blue-400 font-semibold">Dark Blue</span>
        </li>
        <li className="flex items-center justify-between text-[#e2e8f0]">
          <div className="flex items-center">
            <div className="w-4 h-2 bg-[#eab308] mr-2.5 rounded-full shadow-[0_0_6px_rgba(234,179,8,0.6)]" />
            Traffic
          </div>
          <span className="font-['JetBrains_Mono'] text-[10px] text-yellow-400 font-semibold">Yellow</span>
        </li>
        <li className="flex items-center justify-between text-[#e2e8f0]">
          <div className="flex items-center">
            <div className="w-4 h-2 bg-[#9333ea] mr-2.5 rounded-full shadow-[0_0_6px_rgba(147,51,234,0.6)]" />
            Waterlogging + Potholes
          </div>
          <span className="font-['JetBrains_Mono'] text-[10px] text-purple-400 font-semibold">Purple</span>
        </li>
        <li className="flex items-center justify-between text-[#e2e8f0] pt-1.5 border-t border-[#334155]/60">
          <div className="flex items-center">
            <span className="material-symbols-outlined text-[15px] text-[#38bdf8] mr-2 w-3.5 text-center">directions_bus</span>
            Active Bus ({activeBusName})
          </div>
          <span className="font-['JetBrains_Mono'] text-[10px] text-emerald-400 font-bold">ONLINE</span>
        </li>
      </ul>
    </div>
  );
}

function RouteInfoPopup({ journey, onClose, onOpenReport }: { journey: Journey; onClose: () => void; onOpenReport: () => void }) {
  const defects = journey.detections.filter(d => d.type === 'ROAD_DEFECT' || d.type === 'ROAD_BLOCKAGE').length;
  const traffic = journey.detections.filter(d => d.type === 'TRAFFIC').length;
  const safety = journey.detections.filter(d => d.type === 'SAFETY').length;

  return (
    <div className="glass-panel rounded-xl p-4 w-[300px] pointer-events-auto shadow-2xl border border-[#414752]">
      <div className="flex items-start justify-between border-b border-[#414752] pb-2.5 mb-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#38bdf8] text-[18px]">route</span>
            <span className="font-['JetBrains_Mono'] text-[13px] text-[#38bdf8] uppercase tracking-wider font-bold">
              {journey.bus.name} · {journey.route.name}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#c0c7d4] uppercase mt-0.5 tracking-wider">
            {journey.route.description}
          </span>
        </div>
        <button onClick={onClose} className="text-[#c0c7d4] hover:text-[#e0e2ea] cursor-pointer">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center text-xs">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-[0.05em] uppercase">STATUS</span>
          <span className="font-['Inter'] text-[11px] text-[#38bdf8] font-bold uppercase tracking-wide">
            {journey.status === 'COMPLETED' ? 'JOURNEY COMPLETED' : 'IN TRANSIT'}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-[0.05em] uppercase">STATS</span>
          <span className="font-['JetBrains_Mono'] text-xs text-[#e0e2ea]">{journey.route.distance_km} km · 33 min</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="font-['Inter'] text-[10px] font-bold text-[#c0c7d4] tracking-[0.05em] uppercase">FINDINGS</span>
          <span className="font-['JetBrains_Mono'] text-xs text-[#e0e2ea] font-semibold">{journey.detections.length} DETECTIONS</span>
        </div>
        <div className="flex gap-1.5 mt-1.5">
          <span className="text-[10px] bg-[#f87171]/20 text-[#f87171] px-1.5 py-0.5 rounded font-medium border border-[#f87171]/30">{defects} Defects</span>
          <span className="text-[10px] bg-[#fbbf24]/20 text-[#fbbf24] px-1.5 py-0.5 rounded font-medium border border-[#fbbf24]/30">{traffic} Traffic</span>
          <span className="text-[10px] bg-[#c084fc]/20 text-[#c084fc] px-1.5 py-0.5 rounded font-medium border border-[#c084fc]/30">{safety} Safety</span>
        </div>
      </div>

      <button
        onClick={onOpenReport}
        className="w-full bg-[#38bdf8] text-[#00315c] hover:bg-[#58a6ff] rounded-lg py-2 flex items-center justify-center gap-1.5 transition-colors shadow-md font-semibold text-xs cursor-pointer"
      >
        <span className="material-symbols-outlined text-[16px]">analytics</span>
        <span className="font-['Inter'] text-[10px] font-bold tracking-[0.05em] uppercase">View Route Report</span>
      </button>
    </div>
  );
}

export function LiveMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapTheme, setMapTheme] = useState<MapTheme>('default');
  const [searchParams] = useSearchParams();
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null);
  const busMarkerRef = useRef<Marker | null>(null);
  const [workOrderData, setWorkOrderData] = useState<WorkOrderData | null>(null);
  const [isWorkOrderOpen, setIsWorkOrderOpen] = useState(false);
  const { isConnected } = useLiveStream();

  const { data: buses = MOCK_BUSES, isLoading: busesLoading, error: busesError, refetch: refetchBuses } = useQuery({
    queryKey: ['buses'],
    queryFn: fetchBuses,
    initialData: MOCK_BUSES,
  });
  const { data: routes = MOCK_ROUTES, isLoading: routesLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: fetchRoutes,
    initialData: MOCK_ROUTES,
  });
  const { data: journeys = MOCK_JOURNEYS, isLoading: journeysLoading } = useQuery({
    queryKey: ['journeys'],
    queryFn: fetchJourneys,
    initialData: MOCK_JOURNEYS,
  });

  const safeBuses: typeof MOCK_BUSES = Array.isArray(buses) ? buses : MOCK_BUSES;
  const safeRoutes: typeof MOCK_ROUTES = Array.isArray(routes) ? routes : MOCK_ROUTES;
  const safeJourneys: Journey[] = Array.isArray(journeys) ? journeys : MOCK_JOURNEYS;

  const isLoading = busesLoading || routesLoading || journeysLoading;

  // Callback ref for mounting
  const setMapContainer = useCallback((node: HTMLDivElement | null) => {
    if (node && !mapRef.current) {
      mapContainerRef.current = node;
      try {
        const map = new MapLibreMap({
          container: node,
          style: MAP_STYLE,
          center: RAIPUR_CENTER,
          zoom: 13,
        });

        map.addControl(new NavigationControl({ showCompass: true, showZoom: true }), 'bottom-right');
        map.on('load', () => setMapReady(true));
        map.on('styledata', () => {
          if (map.isStyleLoaded()) {
            setMapReady(true);
          }
        });
        if (map.isStyleLoaded()) {
          setMapReady(true);
        }
        mapRef.current = map;
      } catch (e) {
        console.error("LiveMap init error:", e);
      }
    }
  }, []);

  // Cleanup map instance on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  // Switch between Google-style default and satellite basemap (overlays are preserved)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyMapTheme(map, mapTheme);
  }, [mapTheme, mapReady]);

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

  // Listen for real-time bus telemetry to move bus marker smoothly
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

  // Auto-focus on primary route/journey on reload/mount with style load fallback
  const hasAutoFittedRef = useRef<boolean>(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasAutoFittedRef.current) return;

    const fitRoute = () => {
      if (!map.isStyleLoaded()) {
        map.once('styledata', fitRoute);
        return;
      }
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
            if (primaryJourney) {
              setSelectedJourney(primaryJourney);
            }
          }
        } catch (err) {
          console.error('Failed to auto-focus primary route:', err);
        }
      }
    };

    fitRoute();
  }, [mapReady, safeRoutes, safeJourneys]);

  // Render Guaranteed Route Lines (Baseline Corridor + Google Maps Traffic-Style Road Conditions)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !safeRoutes || safeRoutes.length === 0) return;

    const renderRoutes = () => {
      if (!map.isStyleLoaded()) {
        map.once('styledata', renderRoutes);
        return;
      }

      const allDetections = safeJourneys.flatMap(j => j.detections || []);

      safeRoutes.forEach(route => {
        const baseSourceId = `base-src-${route.id}`;
        const baseCasingLayerId = `base-casing-${route.id}`;
        const baseCoreLayerId = `base-core-${route.id}`;
        const trafficSourceId = `traffic-src-${route.id}`;
        const trafficLineLayerId = `traffic-line-${route.id}`;
        const hitboxLayerId = `route-hitbox-${route.id}`;
        const isSelected = selectedJourney?.route_id === route.id;
        const primaryRouteId = safeRoutes?.[0]?.id || 1;
        const isActiveCorridor = route.id === primaryRouteId || isSelected;

        // Safely extract coordinates
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

        if (!coords || !Array.isArray(coords) || coords.length < 2) return;

        // 1. BASELINE UNBROKEN ROUTE CORRIDOR (Guarantees visible highway line at all times)
        const baseFeatureCollection = {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              properties: { routeId: route.id },
              geometry: {
                type: 'LineString' as const,
                coordinates: coords,
              },
            },
          ],
        };

        const existingBaseSource = map.getSource(baseSourceId) as any;
        if (!existingBaseSource) {
          try {
            map.addSource(baseSourceId, {
              type: 'geojson',
              data: baseFeatureCollection,
            });
          } catch { /* ignore */ }
        } else {
          try {
            existingBaseSource.setData(baseFeatureCollection);
          } catch { /* ignore */ }
        }

        // Base Casing Layer (Dark underlay so line pops over both light map & satellite tiles)
        if (!map.getLayer(baseCasingLayerId)) {
          try {
            map.addLayer({
              id: baseCasingLayerId,
              type: 'line',
              source: baseSourceId,
              paint: {
                'line-color': '#0f172a',
                'line-width': isSelected ? 9.5 : (isActiveCorridor ? 8.0 : 6.0),
                'line-opacity': 0.85,
              },
              layout: {
                'line-cap': 'round',
                'line-join': 'round',
              },
            });
          } catch { /* ignore */ }
        } else {
          map.setPaintProperty(baseCasingLayerId, 'line-width', isSelected ? 9.5 : (isActiveCorridor ? 8.0 : 6.0));
        }

        // Base Highway Core Layer (High-contrast cyan corridor)
        if (!map.getLayer(baseCoreLayerId)) {
          try {
            map.addLayer({
              id: baseCoreLayerId,
              type: 'line',
              source: baseSourceId,
              paint: {
                'line-color': '#0284c7',
                'line-width': isSelected ? 7.0 : (isActiveCorridor ? 5.5 : 4.0),
                'line-opacity': 0.9,
              },
              layout: {
                'line-cap': 'round',
                'line-join': 'round',
              },
            });
          } catch { /* ignore */ }
        } else {
          map.setPaintProperty(baseCoreLayerId, 'line-width', isSelected ? 7.0 : (isActiveCorridor ? 5.5 : 4.0));
        }

        // 2. GOOGLE MAPS TRAFFIC / DEFECT SEGMENTS (Green -> Orange -> Red -> Burgundy)
        const routeDets = (journeys || []).filter(j => j.route_id === route.id).flatMap(j => j.detections || []);
        const trafficSegments = computePotholeTrafficSegments(coords, routeDets.length > 0 ? routeDets : allDetections, 60);

        const trafficFeatureCollection = {
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

        const existingTrafficSource = map.getSource(trafficSourceId) as any;
        if (!existingTrafficSource) {
          try {
            map.addSource(trafficSourceId, {
              type: 'geojson',
              data: trafficFeatureCollection,
            });
          } catch { /* ignore */ }
        } else {
          try {
            existingTrafficSource.setData(trafficFeatureCollection);
          } catch { /* ignore */ }
        }

        // Dynamic Traffic Heatmap Line Layer with compiled to-color expression
        const colorExpression: any = [
          'case',
          ['has', 'color'],
          ['to-color', ['get', 'color']],
          ['to-color', '#22c55e']
        ];

        if (!map.getLayer(trafficLineLayerId)) {
          try {
            map.addLayer({
              id: trafficLineLayerId,
              type: 'line',
              source: trafficSourceId,
              paint: {
                'line-color': colorExpression,
                'line-width': isSelected ? 6.5 : (isActiveCorridor ? 5.0 : 3.5),
                'line-opacity': 1.0,
              },
              layout: {
                'line-cap': 'round',
                'line-join': 'round',
              },
            });
          } catch (e) {
            console.error(`Error adding traffic line layer ${trafficLineLayerId}:`, e);
          }
        } else {
          map.setPaintProperty(trafficLineLayerId, 'line-color', colorExpression);
          map.setPaintProperty(trafficLineLayerId, 'line-width', isSelected ? 6.5 : (isActiveCorridor ? 5.0 : 3.5));
          map.setPaintProperty(trafficLineLayerId, 'line-opacity', 1.0);
        }

        // 3. 30px Wide Touch Hitbox Layer
        if (!map.getLayer(hitboxLayerId)) {
          try {
            map.addLayer({
              id: hitboxLayerId,
              type: 'line',
              source: baseSourceId,
              paint: {
                'line-color': '#000000',
                'line-width': 30,
                'line-opacity': 0.001,
              },
            });

            const handleSelect = () => {
              const j = journeys?.find(journey => journey.route_id === route.id) || null;
              setSelectedJourney(j);
            };

            map.on('click', hitboxLayerId, handleSelect);
            map.on('click', baseCoreLayerId, handleSelect);
            map.on('click', trafficLineLayerId, handleSelect);
            map.on('mouseenter', hitboxLayerId, () => {
              map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', hitboxLayerId, () => {
              map.getCanvas().style.cursor = '';
            });
          } catch { /* ignore */ }
        }
      });
    };

    renderRoutes();
  }, [mapReady, mapTheme, safeRoutes, journeys, selectedJourney]);

  // Add detection markers
  // Render ONLY Bus Markers (Red circular defect pin markers completely removed just like Command Center)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !journeys) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    journeys.forEach(journey => {
      // Add bus markers
      if (journey.bus?.last_lat && journey.bus?.last_lon) {
        const busName = journey.bus.name || 'BUS-01';
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
          setSelectedJourney(journey);
        });

        const marker = new Marker({ element: busEl })
          .setLngLat([journey.bus.last_lon, journey.bus.last_lat])
          .addTo(map);

        if (journey.status === 'ACTIVE' || journey.id === 1 || journey.route.id === 1) {
          busMarkerRef.current = marker;
        }

        markersRef.current.push(marker);
      }
    });
  }, [mapReady, journeys]);

  // Handle URL params
  useEffect(() => {
    const journeyId = searchParams.get('journey');
    if (journeyId && journeys) {
      const j = journeys.find(j => j.id === Number(journeyId));
      if (j) setSelectedJourney(j);
    }
  }, [searchParams, journeys]);



  if (busesError) return <ErrorState message="Could not load map data." onRetry={() => refetchBuses()} />;

  return (
    <div className="h-full w-full relative flex flex-col">
      {/* Map Container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 z-50 bg-[#0A0C10]/80 flex items-center justify-center">
            <LoadingState message="Loading Raipur GIS Map..." />
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

        {/* Overlays */}
        <div className="absolute inset-0 p-4 pointer-events-none flex justify-between items-start">
          {/* Left: Fleet Panel */}
          {safeBuses && safeJourneys && (
            <FleetPanel
              buses={safeBuses}
              journeys={safeJourneys}
              selectedJourneyId={selectedJourney?.id || null}
              onSelectJourney={setSelectedJourney}
            />
          )}

          {/* Right: Controls */}
          <div className="flex flex-col gap-4 pointer-events-auto items-end">
            <RoadConditionsPanel
              activeBusName={selectedJourney?.bus?.name || journeys?.[0]?.bus?.name || 'BUS-01'}
            />
          </div>
        </div>

        {/* Selected Route Info Popup */}
        {selectedJourney && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-30">
            <RouteInfoPopup
              journey={selectedJourney}
              onClose={() => setSelectedJourney(null)}
              onOpenReport={() => {
                const det = selectedJourney.detections?.[0];
                setWorkOrderData({
                  ticketId: `PWD-RAI-2026-${String(det?.id || 1042)}`,
                  defectType: det?.type || 'ROAD_DEFECT',
                  severity: (det?.severity as any) || 'CRITICAL',
                  lat: det?.lat || 21.2514,
                  lon: det?.lon || 81.6296,
                  streetName: `${selectedJourney.route.name} (${selectedJourney.route.description})`,
                  confidence: det?.confidence || 0.94,
                  evidenceUrl: det?.evidence_url,
                  videoTimestamp: (det as any)?.video_timestamp_sec,
                  trafficWeight: 3.0,
                  detectedAt: det?.timestamp || new Date().toISOString(),
                  busId: selectedJourney.bus.name,
                });
                setIsWorkOrderOpen(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="h-7 bg-[#0b0e14] border-t border-[#414752] flex items-center justify-between px-4 shrink-0 z-40">
        <span className="font-['JetBrains_Mono'] text-[10px] text-[#c0c7d4] tracking-widest uppercase">
          {safeBuses.length}/{safeBuses.length} BUSES ONLINE · {safeJourneys.filter(j => j.status === 'COMPLETED').length} ROUTES COMPLETED
        </span>
        <div className="flex items-center space-x-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></div>
          <span className="font-['JetBrains_Mono'] text-[9px] text-[#8b919d] uppercase">
            {isConnected ? 'LIVE INGEST ACTIVE (CUDA RTX 3050)' : 'STANDALONE MODE'}
          </span>
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
