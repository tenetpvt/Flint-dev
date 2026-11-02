import { useEffect, useRef, useState } from 'react';
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
import { GlassPanel } from '../components/ui/GlassPanel';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusDot } from '../components/ui/StatusDot';
import {
  Layers,
  Map as MapIcon,
  PanelRightClose,
  PanelRightOpen,
  Route as RouteIcon,
  X,
  ArrowRight,
  Bus,
} from 'lucide-react';

const RAW_ROUTE_COORDS: [number, number][] = (() => {
  try {
    const raw = MOCK_ROUTES[0]?.geojson_path;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
})();

// Slim KPI Strip as a floating glass panel
function SlimKPIStrip({
  summary,
  isConnected,
}: {
  summary: AnalyticsSummary;
  isConnected?: boolean;
}) {
  return (
    <GlassPanel className="hidden lg:flex items-center gap-5 px-4 py-2 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--text-muted)] text-[11px]">Buses online</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">
          {summary.active_buses}
        </span>
      </div>
      <div className="w-px h-3.5 bg-[var(--border-subtle)]" />
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--text-muted)] text-[11px]">Routes completed</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">
          {summary.completed_routes}
        </span>
      </div>
      <div className="w-px h-3.5 bg-[var(--border-subtle)]" />
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--text-muted)] text-[11px]">Detections today</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">
          {summary.total_findings}
        </span>
      </div>
      <div className="w-px h-3.5 bg-[var(--border-subtle)]" />
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--text-muted)] text-[11px]">High severity</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[#F0524F]">
          {summary.live_alerts}
        </span>
      </div>
      <div className="w-px h-3.5 bg-[var(--border-subtle)]" />
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isConnected ? 'bg-[#34D399]' : 'bg-[var(--accent)]'
          }`}
        />
        <span className="text-[11px] text-[var(--text-secondary)]">
          {isConnected ? 'Edge live' : 'Standalone'}
        </span>
      </div>
    </GlassPanel>
  );
}

// Route Intelligence Context Card over Map
function RouteIntelligenceOverlay({
  journey,
  onClose,
}: {
  journey: Journey;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const defects = journey.detections.filter(
    (d) => d.type === 'ROAD_DEFECT' || d.type === 'ROAD_BLOCKAGE'
  ).length;
  const traffic = journey.detections.filter((d) => d.type === 'TRAFFIC').length;
  const safety = journey.detections.filter((d) => d.type === 'SAFETY').length;

  return (
    <GlassPanel className="p-4 w-[310px] shadow-xl">
      <div className="flex items-start justify-between border-b border-[var(--border-subtle)] pb-2.5 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-[var(--accent)]">
              {journey.bus.name}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-xs font-medium text-[var(--text-primary)] truncate">
              {journey.route.name}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <StatusDot
              status={journey.status === 'COMPLETED' ? 'success' : 'info'}
              label={journey.status === 'COMPLETED' ? 'Completed' : 'In transit'}
            />
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              {journey.route.distance_km} km
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close route context"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded hover:bg-[var(--surface-raised)] transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="space-y-2 mb-3.5 text-xs">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-[var(--text-muted)]">Findings accumulated</span>
          <span className="font-mono font-semibold text-[var(--text-primary)]">
            {journey.detections.length}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          <div className="bg-[var(--surface)] p-2 rounded-lg border border-[var(--border-subtle)] text-center">
            <div className="text-[10px] text-[var(--text-muted)]">Defects</div>
            <div className="font-mono text-sm font-semibold text-[#F0524F]">{defects}</div>
          </div>
          <div className="bg-[var(--surface)] p-2 rounded-lg border border-[var(--border-subtle)] text-center">
            <div className="text-[10px] text-[var(--text-muted)]">Traffic</div>
            <div className="font-mono text-sm font-semibold text-[#F59E0B]">{traffic}</div>
          </div>
          <div className="bg-[var(--surface)] p-2 rounded-lg border border-[var(--border-subtle)] text-center">
            <div className="text-[10px] text-[var(--text-muted)]">Safety</div>
            <div className="font-mono text-sm font-semibold text-[var(--accent)]">{safety}</div>
          </div>
        </div>
      </div>

      <Button
        variant="primary"
        size="sm"
        className="w-full"
        onClick={() => navigate(`/live-map?journey=${journey.id}`)}
      >
        Review route intelligence
      </Button>
    </GlassPanel>
  );
}

// Route Report Card in Collapsible Drawer
function RouteReportCard({
  journey,
  isPrimary,
  onSelect,
}: {
  journey: Journey;
  isPrimary: boolean;
  onSelect: () => void;
}) {
  const navigate = useNavigate();
  const defects = journey.detections.filter(
    (d) => d.type === 'ROAD_DEFECT' || d.type === 'ROAD_BLOCKAGE'
  ).length;
  const totalFindings = journey.detections.length;

  const timeDiff = journey.end_time
    ? Math.round((Date.now() - new Date(journey.end_time).getTime()) / 60000)
    : 0;
  const timeLabel = timeDiff < 2 ? 'Just now' : `${timeDiff}m ago`;

  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-lg border transition-all duration-150 cursor-pointer ${
        isPrimary
          ? 'bg-[var(--surface)] border-[var(--accent)] shadow-xs'
          : 'bg-[var(--surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <StatusDot status="success" label="Report generated" />
        <span className="text-[11px] font-mono text-[var(--text-muted)]">{timeLabel}</span>
      </div>

      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h4 className="text-xs font-semibold text-[var(--text-primary)]">
            {journey.bus.name} · Route {journey.route.name}
          </h4>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate max-w-[240px]">
            {journey.route.description}
          </p>
        </div>
        <span className="text-[11px] font-mono text-[var(--text-secondary)] whitespace-nowrap">
          {journey.route.distance_km} km
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]">
        <span>
          <strong className="font-mono text-[var(--text-primary)]">{defects}</strong> defects ·{' '}
          <strong className="font-mono text-[var(--text-primary)]">{totalFindings}</strong> findings
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/live-map?journey=${journey.id}`);
          }}
          className="text-xs font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
        >
          Review
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export function CommandCenter() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const busMarkerRef = useRef<Marker | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapTheme, setMapTheme] = useState<MapTheme>('default');
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null);
  const [isWorkOrderOpen, setIsWorkOrderOpen] = useState(false);
  const [workOrderData, setWorkOrderData] = useState<WorkOrderData | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { isConnected } = useLiveStream();

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: fetchAnalyticsSummary,
  });

  const {
    data: journeys,
    isLoading: journeysLoading,
    error: journeysError,
    refetch: refetchJourneys,
  } = useQuery({
    queryKey: ['journeys'],
    queryFn: fetchJourneys,
  });

  const { data: routes } = useQuery({
    queryKey: ['routes'],
    queryFn: fetchRoutes,
  });

  const safeSummary: AnalyticsSummary = summary || MOCK_ANALYTICS_SUMMARY;
  const safeJourneys: Journey[] = journeys && journeys.length > 0 ? journeys : MOCK_JOURNEYS;
  const safeRoutes = routes && routes.length > 0 ? routes : MOCK_ROUTES;

  const setMapContainer = (node: HTMLDivElement | null) => {
    mapContainerRef.current = node;
  };

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      const map = new MapLibreMap({
        container: mapContainerRef.current,
        style: MAP_STYLE as any,
        center: RAIPUR_CENTER,
        zoom: 12.8,
        minZoom: 10,
        maxZoom: 18,
        attributionControl: false,
      });

      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

      map.on('load', () => {
        setMapReady(true);
        map.resize();
      });

      mapRef.current = map;
    } catch (e) {
      console.error('Failed to initialize MapLibre map on CC:', e);
    }

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (busMarkerRef.current) {
        busMarkerRef.current.remove();
        busMarkerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Sync Map Theme (Default road map / Satellite)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyMapTheme(map, mapTheme);
  }, [mapTheme, mapReady]);

  // Real-time bus telemetry updates
  useEffect(() => {
    const handleBusTelemetry = (e: any) => {
      const { coordinates } = e.detail;
      if (!coordinates || !busMarkerRef.current) return;
      busMarkerRef.current.setLngLat([coordinates[0], coordinates[1]]);
      if (mapRef.current) {
        mapRef.current.easeTo({ center: [coordinates[0], coordinates[1]], duration: 800 });
      }
    };
    window.addEventListener('flint:bus-telemetry', handleBusTelemetry);
    return () => window.removeEventListener('flint:bus-telemetry', handleBusTelemetry);
  }, [mapReady]);

  // Auto-focus primary route on mount
  const hasAutoFittedRef = useRef<boolean>(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || hasAutoFittedRef.current) return;

    const primaryJourney = safeJourneys?.[0];
    const targetRoute = primaryJourney?.route || safeRoutes?.[0];
    let coords: [number, number][] = [];
    if (targetRoute?.geojson_path) {
      try {
        coords =
          typeof targetRoute.geojson_path === 'string'
            ? JSON.parse(targetRoute.geojson_path)
            : targetRoute.geojson_path;
      } catch {
        coords = RAW_ROUTE_COORDS;
      }
    }
    if (!coords || coords.length < 2) coords = RAW_ROUTE_COORDS;

    if (coords && coords.length > 1) {
      const fitCamera = () => {
        const m = mapRef.current;
        if (!m) return;
        try {
          m.resize();
          const bounds = coords.reduce(
            (b: any, coord: [number, number]) => b.extend(coord),
            new LngLatBounds(coords[0], coords[0])
          );
          m.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 1200 });
          hasAutoFittedRef.current = true;
          setSelectedRouteId(targetRoute?.id || 1);
          if (primaryJourney) {
            setSelectedJourney(primaryJourney);
          }
        } catch (err) {
          console.error('Failed to auto-focus route:', err);
        }
      };

      const timer = window.setTimeout(fitCamera, 100);
      return () => window.clearTimeout(timer);
    }
  }, [mapReady, safeRoutes, safeJourneys]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Render Route Lines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !safeRoutes || safeRoutes.length === 0) return;

    const allDetections = safeJourneys.flatMap((j) => j.detections || []);

    const renderLayers = () => {
      safeRoutes.forEach((route) => {
        const baseSourceId = `cc-base-src-${route.id}`;
        const baseCasingLayerId = `cc-base-casing-${route.id}`;
        const baseCoreLayerId = `cc-base-core-${route.id}`;
        const trafficSourceId = `cc-traffic-src-${route.id}`;
        const trafficLineLayerId = `cc-traffic-line-${route.id}`;
        const hitboxLayerId = `cc-hitbox-${route.id}`;
        const isSelected = selectedRouteId === route.id;
        const primaryRouteId = safeRoutes?.[0]?.id || 1;
        const isActiveCorridor = isSelected || (!selectedRouteId && route.id === primaryRouteId);

        let coords: [number, number][] = [];
        if (typeof route.geojson_path === 'string') {
          try {
            coords = JSON.parse(route.geojson_path);
          } catch (e) {
            console.error(`Error parsing geojson_path:`, e);
          }
        } else if (Array.isArray(route.geojson_path)) {
          coords = route.geojson_path as any;
        }

        if (!coords || !Array.isArray(coords) || coords.length < 2) coords = RAW_ROUTE_COORDS;
        if (!coords || !Array.isArray(coords) || coords.length < 2) return;

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
          } catch (e) {
            console.warn('[FLINT Map] Layer op skipped:', e);
          }
        } else {
          try {
            existingBaseSource.setData(baseFeatureCollection);
          } catch (e) {
            console.warn('[FLINT Map] Layer op skipped:', e);
          }
        }

        // Base Casing Layer
        if (!map.getLayer(baseCasingLayerId)) {
          try {
            map.addLayer({
              id: baseCasingLayerId,
              type: 'line',
              source: baseSourceId,
              paint: {
                'line-color': '#0F172A',
                'line-width': isSelected ? 8.0 : isActiveCorridor ? 6.5 : 5.0,
                'line-opacity': 0.8,
              },
              layout: { 'line-cap': 'round', 'line-join': 'round' },
            });
          } catch (e) {
            console.warn('[FLINT Map] Layer op skipped:', e);
          }
        }

        // Base Highway Core Layer
        if (!map.getLayer(baseCoreLayerId)) {
          try {
            map.addLayer({
              id: baseCoreLayerId,
              type: 'line',
              source: baseSourceId,
              paint: {
                'line-color': '#4C8DFF',
                'line-width': isSelected ? 5.5 : isActiveCorridor ? 4.0 : 3.0,
                'line-opacity': 0.85,
              },
              layout: { 'line-cap': 'round', 'line-join': 'round' },
            });
          } catch (e) {
            console.warn('[FLINT Map] Layer op skipped:', e);
          }
        }

        // Traffic segments
        const routeDetections = allDetections.filter(
          (d) =>
            safeJourneys.find((j) => j.id === d.journey_id)?.route_id === route.id ||
            route.id === 1
        );
        const segments = computePotholeTrafficSegments(coords, routeDetections, 60);

        const trafficFeatures = segments.map((seg) => ({
          type: 'Feature' as const,
          properties: {
            color: seg.color,
            potholeCount: seg.potholeCount,
            statusLabel: seg.statusLabel,
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: seg.coordinates,
          },
        }));

        const trafficFeatureCollection = {
          type: 'FeatureCollection' as const,
          features: trafficFeatures,
        };

        const existingTrafficSource = map.getSource(trafficSourceId) as any;
        if (!existingTrafficSource) {
          try {
            map.addSource(trafficSourceId, {
              type: 'geojson',
              data: trafficFeatureCollection,
            });
          } catch (e) {
            console.warn('[FLINT Map] Layer op skipped:', e);
          }
        } else {
          try {
            existingTrafficSource.setData(trafficFeatureCollection);
          } catch (e) {
            console.warn('[FLINT Map] Layer op skipped:', e);
          }
        }

        if (!map.getLayer(trafficLineLayerId)) {
          try {
            map.addLayer({
              id: trafficLineLayerId,
              type: 'line',
              source: trafficSourceId,
              paint: {
                'line-color': ['get', 'color'],
                'line-width': isSelected ? 5.5 : isActiveCorridor ? 4.0 : 3.0,
                'line-opacity': 0.9,
              },
              layout: { 'line-cap': 'round', 'line-join': 'round' },
            });
          } catch (e) {
            console.warn('[FLINT Map] Layer op skipped:', e);
          }
        }

        // Hitbox Layer
        if (!map.getLayer(hitboxLayerId)) {
          try {
            map.addLayer({
              id: hitboxLayerId,
              type: 'line',
              source: baseSourceId,
              paint: {
                'line-color': '#000000',
                'line-width': 28,
                'line-opacity': 0.001,
              },
            });

            const handleRouteSelect = () => {
              setSelectedRouteId(route.id);
              const matchingJourneys = safeJourneys.filter((j) => j.route_id === route.id);
              const j =
                matchingJourneys.sort(
                  (a, b) => (b.detections?.length || 0) - (a.detections?.length || 0)
                )[0] ||
                safeJourneys[0] ||
                null;
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
            map.on('mouseenter', hitboxLayerId, () => {
              map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', hitboxLayerId, () => {
              map.getCanvas().style.cursor = '';
            });
          } catch (e) {
            console.warn('[FLINT Map] Layer op skipped:', e);
          }
        }
      });
      map.triggerRepaint();
    };

    renderLayers();
    const t = window.setTimeout(renderLayers, 200);
    return () => window.clearTimeout(t);
  }, [mapReady, mapTheme, safeRoutes, selectedRouteId, safeJourneys]);

  // Render Active Bus Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !safeJourneys) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const activeJourney = safeJourneys.find((j) => j.status === 'ACTIVE') || safeJourneys[0];
    if (activeJourney && activeJourney.bus?.last_lon && activeJourney.bus?.last_lat) {
      const busName = activeJourney.bus.name || 'BUS-01';
      const busEl = document.createElement('div');
      busEl.className = 'flex flex-col items-center cursor-pointer group z-30 select-none';
      busEl.innerHTML = `
        <div class="w-6 h-6 rounded-md bg-[var(--surface)] border border-[var(--border-strong)] flex items-center justify-center shadow-md relative">
          <svg class="w-3.5 h-3.5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.6-.3-1.1-.8-1.4-.4-.2-1-.3-1.6-.3H4.4c-.6 0-1.2.1-1.6.3-.5.3-.8.8-.8 1.4 0 .4.1.8.2 1.2L3 18h3m12 0a2 2 0 1 1-4 0m-8 0a2 2 0 1 1-4 0"/>
          </svg>
          <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#34D399] animate-bus-pulse"></span>
        </div>
        <div class="mt-0.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded px-1.5 py-0.2 text-[10px] font-mono text-[var(--text-primary)] font-medium shadow-xs">
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

  if (summaryError && !safeSummary) {
    return (
      <ErrorState
        message="Platform telemetry service unavailable."
        onRetry={() => refetchSummary()}
      />
    );
  }
  if (journeysError && safeJourneys.length === 0) {
    return (
      <ErrorState
        message="Could not load corridor route data."
        onRetry={() => refetchJourneys()}
      />
    );
  }

  const completedJourneys = safeJourneys.filter((j) => j.status === 'COMPLETED');

  return (
    <div className="w-full h-full relative overflow-hidden bg-[var(--bg-base)]">
      {/* Full-Bleed Map Canvas */}
      <div ref={setMapContainer} className="absolute inset-0 w-full h-full" />

      {summaryLoading && (
        <div className="absolute inset-0 z-20 bg-[var(--bg-base)]/50 backdrop-blur-xs flex items-center justify-center">
          <LoadingState message="Connecting geographic sensor network..." />
        </div>
      )}

      {/* Floating Top Controls Bar: Slim KPI Strip & Actions */}
      <div className="absolute top-3 left-3 right-3 z-20 pointer-events-none flex items-center justify-between gap-3">
        {/* Left: KPI Strip */}
        <div className="pointer-events-auto">
          <SlimKPIStrip summary={safeSummary} isConnected={isConnected} />
        </div>

        {/* Right: Map Theme & Route Drawer Toggle */}
        <div className="pointer-events-auto flex items-center gap-2 ml-auto">
          {/* Basemap Toggle (Default / Satellite) */}
          <GlassPanel className="p-0.5 flex items-center gap-0.5">
            <button
              onClick={() => setMapTheme('default')}
              title="Standard road view"
              className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                mapTheme === 'default'
                  ? 'bg-[var(--surface-raised)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
              Roads
            </button>
            <button
              onClick={() => setMapTheme('satellite')}
              title="Satellite imagery"
              className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                mapTheme === 'satellite'
                  ? 'bg-[var(--surface-raised)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
              Satellite
            </button>
          </GlassPanel>

          {/* Drawer Toggle */}
          <GlassPanel className="p-0.5">
            <button
              onClick={() => setIsDrawerOpen((prev) => !prev)}
              className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                isDrawerOpen
                  ? 'bg-[var(--surface-raised)] text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isDrawerOpen ? (
                <PanelRightClose className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              Route reports
              <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.2 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)]">
                {completedJourneys.length}
              </span>
            </button>
          </GlassPanel>
        </div>
      </div>

      {/* Floating Bottom Left: Road Conditions Legend */}
      <GlassPanel className="absolute bottom-4 left-4 z-10 p-3 min-w-[190px]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            Road conditions
          </span>
          <span className="text-[10px] font-mono text-[var(--accent)]">Live GIS</span>
        </div>
        <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-3 h-1.5 rounded-xs bg-[#22c55e]" />
              Smooth road
            </span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">Clear</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-3 h-1.5 rounded-xs bg-[#ef4444]" />
              Potholes
            </span>
            <span className="text-[11px] font-mono text-[#F0524F]">Urgent</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-3 h-1.5 rounded-xs bg-[#1d4ed8]" />
              Waterlogging
            </span>
            <span className="text-[11px] font-mono text-[#4C8DFF]">Tier 2</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-3 h-1.5 rounded-xs bg-[#eab308]" />
              Traffic slowdown
            </span>
            <span className="text-[11px] font-mono text-[#F59E0B]">Congestion</span>
          </li>
          <li className="flex items-center justify-between pt-1.5 border-t border-[var(--border-subtle)]">
            <span className="flex items-center gap-1.5 text-[var(--text-primary)]">
              <Bus className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.5} />
              Active bus
            </span>
            <StatusDot status="success" label="Online" />
          </li>
        </ul>
      </GlassPanel>

      {/* Floating Context Card when a Route is clicked */}
      {selectedJourney && (
        <div className="absolute bottom-4 left-60 z-20">
          <RouteIntelligenceOverlay
            journey={selectedJourney}
            onClose={() => {
              setSelectedJourney(null);
              setSelectedRouteId(null);
            }}
          />
        </div>
      )}

      {/* Collapsible Route Reports Right Drawer */}
      <div
        className={`absolute top-0 right-0 bottom-0 w-[360px] max-w-[90vw] z-30 bg-[var(--surface)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col transition-transform duration-150 ease-out ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-12 px-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--surface-raised)]/30 shrink-0">
          <div className="flex items-center gap-2">
            <RouteIcon className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.5} />
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Route reports
            </h3>
            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)] px-1.5 py-0.2 rounded bg-[var(--surface-raised)]">
              {completedJourneys.length}
            </span>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Close drawer"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded hover:bg-[var(--surface-raised)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {journeysLoading ? (
            <LoadingState message="Loading reports..." />
          ) : completedJourneys.length === 0 ? (
            <EmptyState
              icon={<RouteIcon className="w-6 h-6" strokeWidth={1.5} />}
              title="No route reports"
              description="Completed transit corridors and automated defect audits will appear here."
            />
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

      {/* Work Order Modal */}
      <WorkOrderModal
        isOpen={isWorkOrderOpen}
        onClose={() => setIsWorkOrderOpen(false)}
        data={workOrderData}
      />
    </div>
  );
}
