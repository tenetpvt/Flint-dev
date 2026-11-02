import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Map as MapLibreMap, NavigationControl, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchBuses, type Bus } from '../services/buses';
import { fetchRoutes } from '../services/routes';
import { fetchJourneys, type Journey } from '../services/journeys';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { MAP_STYLE, DARK_MAP_STYLE, RAIPUR_CENTER, applyMapTheme, type MapTheme } from '../utils/mapStyle';
import { MOCK_ROUTES, MOCK_JOURNEYS, MOCK_BUSES } from '../services/mockData';
import { WorkOrderModal, type WorkOrderData } from '../components/ui/WorkOrderModal';
import { useTheme } from '../context/ThemeContext';
import { GlassPanel } from '../components/ui/GlassPanel';
import { Button } from '../components/ui/Button';
import { StatusDot } from '../components/ui/StatusDot';
import {
  Bus as BusIcon,
  Route as RouteIcon,
  X,
  FileText,
  Map as MapIcon,
  Satellite,
} from 'lucide-react';

function FleetPanel({
  buses,
  journeys,
  selectedJourneyId,
  onSelectJourney,
}: {
  buses: Bus[];
  journeys: Journey[];
  selectedJourneyId: number | null;
  onSelectJourney: (j: Journey | null) => void;
}) {
  return (
    <GlassPanel className="p-3.5 w-[280px] flex flex-col gap-2.5">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
          Fleet corridors
        </h3>
        <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          {buses.length} vehicles
        </span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-0.5">
        {buses.map((bus) => {
          const journey = journeys.find((j) => j.bus.name === bus.name);
          const isSelected = journey && journey.id === selectedJourneyId;
          const isCompleted = journey?.status === 'COMPLETED';

          return (
            <div
              key={bus.id}
              onClick={() =>
                journey ? onSelectJourney(isSelected ? null : journey) : undefined
              }
              className={`flex items-center justify-between cursor-pointer transition-colors rounded-lg px-2.5 py-2 ${
                isSelected
                  ? 'bg-[var(--accent-subtle)] border border-[var(--accent)] text-[var(--text-primary)]'
                  : 'bg-[var(--surface-raised)]/60 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <BusIcon className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" strokeWidth={1.5} />
                <div className="min-w-0">
                  <div className="font-mono text-xs font-medium text-[var(--text-primary)] truncate">
                    {bus.name}
                  </div>
                  {journey && (
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      {journey.route.name}
                    </div>
                  )}
                </div>
              </div>

              <StatusDot
                status={isCompleted ? 'success' : bus.status === 'IDLE' ? 'neutral' : 'info'}
                label={isCompleted ? 'Completed' : bus.status === 'IDLE' ? 'Idle' : 'Active'}
              />
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

function RoadConditionsPanel() {
  return (
    <GlassPanel className="p-3.5 w-[220px]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 mb-2">
        <h4 className="text-xs font-semibold text-[var(--text-primary)]">
          Road conditions
        </h4>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      </div>

      <ul className="space-y-2 text-xs">
        <li className="flex items-center gap-2 text-[var(--text-secondary)]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />
          <span>Smooth pavement</span>
        </li>
        <li className="flex items-center gap-2 text-[var(--text-secondary)]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" />
          <span>Potholes</span>
        </li>
        <li className="flex items-center gap-2 text-[var(--text-secondary)]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" />
          <span>Waterlogging</span>
        </li>
        <li className="flex items-center gap-2 text-[var(--text-secondary)]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" />
          <span>Congestion</span>
        </li>
        <li className="flex items-center gap-2 text-[var(--text-secondary)]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#a855f7]" />
          <span>Combined defects</span>
        </li>
      </ul>
    </GlassPanel>
  );
}

function RouteInfoPopup({
  journey,
  onClose,
  onOpenReport,
}: {
  journey: Journey;
  onClose: () => void;
  onOpenReport: () => void;
}) {
  const defects = journey.detections.filter(
    (d) => d.type === 'ROAD_DEFECT' || d.type === 'ROAD_BLOCKAGE'
  ).length;
  const traffic = journey.detections.filter((d) => d.type === 'TRAFFIC').length;
  const safety = journey.detections.filter((d) => d.type === 'SAFETY').length;

  return (
    <GlassPanel className="p-4 w-[320px]">
      <div className="flex items-start justify-between border-b border-[var(--border-subtle)] pb-2.5 mb-3">
        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-1.5">
            <RouteIcon className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" strokeWidth={1.5} />
            <span className="font-mono text-xs font-semibold text-[var(--text-primary)] truncate">
              {journey.bus.name} · {journey.route.name}
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
            {journey.route.description}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer p-0.5"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2.5 mb-3.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-[var(--text-muted)]">Status</span>
          <StatusDot
            status={journey.status === 'COMPLETED' ? 'success' : 'info'}
            label={journey.status === 'COMPLETED' ? 'Completed' : 'In transit'}
          />
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-[var(--text-muted)]">Distance</span>
          <span className="font-mono text-[var(--text-primary)]">
            {journey.route.distance_km} km · 33 min
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-[var(--text-muted)]">Findings</span>
          <span className="font-mono font-semibold text-[var(--text-primary)]">
            {journey.detections.length} detections
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
          <div className="bg-[var(--surface-raised)]/70 p-1.5 rounded border border-[var(--border-subtle)]">
            <div className="text-[10px] text-[var(--text-muted)]">Defects</div>
            <div className="font-mono text-xs font-semibold text-[#F0524F]">{defects}</div>
          </div>
          <div className="bg-[var(--surface-raised)]/70 p-1.5 rounded border border-[var(--border-subtle)]">
            <div className="text-[10px] text-[var(--text-muted)]">Traffic</div>
            <div className="font-mono text-xs font-semibold text-[#F59E0B]">{traffic}</div>
          </div>
          <div className="bg-[var(--surface-raised)]/70 p-1.5 rounded border border-[var(--border-subtle)]">
            <div className="text-[10px] text-[var(--text-muted)]">Safety</div>
            <div className="font-mono text-xs font-semibold text-[#7C6CF0]">{safety}</div>
          </div>
        </div>
      </div>

      <Button
        variant="secondary"
        size="sm"
        fullWidth
        icon={<FileText className="w-3.5 h-3.5" />}
        onClick={onOpenReport}
      >
        View route report
      </Button>
    </GlassPanel>
  );
}

export function LiveMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapTheme, setMapTheme] = useState<MapTheme>('default');
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null);
  const busMarkerRef = useRef<Marker | null>(null);
  const [workOrderData, setWorkOrderData] = useState<WorkOrderData | null>(null);
  const [isWorkOrderOpen, setIsWorkOrderOpen] = useState(false);
  const { theme } = useTheme();

  const { data: buses, isLoading: busesLoading, error: busesError, refetch: refetchBuses } = useQuery({
    queryKey: ['buses'],
    queryFn: fetchBuses,
  });

  const { data: routes, isLoading: routesLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: fetchRoutes,
  });

  const { data: journeys, isLoading: journeysLoading } = useQuery({
    queryKey: ['journeys'],
    queryFn: fetchJourneys,
  });

  const safeBuses = buses?.length ? buses : MOCK_BUSES;
  const safeRoutes = routes?.length ? routes : MOCK_ROUTES;
  const safeJourneys = journeys?.length ? journeys : MOCK_JOURNEYS;
  const isLoading = busesLoading || routesLoading || journeysLoading;

  const setMapContainer = useCallback((el: HTMLDivElement | null) => {
    mapContainerRef.current = el;
    if (el && !mapRef.current) {
      const activeBasemap =
        mapTheme === 'satellite' ? MAP_STYLE : theme === 'light' ? MAP_STYLE : DARK_MAP_STYLE;

      const map = new MapLibreMap({
        container: el,
        style: activeBasemap,
        center: RAIPUR_CENTER,
        zoom: 12.5,
        attributionControl: false,
      });

      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

      map.on('load', () => {
        setMapReady(true);
      });

      mapRef.current = map;
    }
  }, [mapTheme, theme]);

  // Update theme when changed
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    applyMapTheme(mapRef.current, mapTheme);
  }, [mapTheme, mapReady]);

  // Render Routes and Corridors
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !safeRoutes) return;

    safeRoutes.forEach((route) => {
      let coordinates: [number, number][] = [];
      try {
        coordinates = JSON.parse(route.geojson_path);
      } catch {
        return;
      }
      if (!coordinates.length) return;

      const baseCasingId = `base-casing-${route.id}`;
      const baseCoreId = `base-core-${route.id}`;
      const sourceId = `route-source-${route.id}`;

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates },
          },
        });
      }

      if (!map.getLayer(baseCasingId)) {
        map.addLayer({
          id: baseCasingId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#000000',
            'line-width': 7,
            'line-opacity': 0.35,
          },
        });
      }

      if (!map.getLayer(baseCoreId)) {
        map.addLayer({
          id: baseCoreId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#7C6CF0',
            'line-width': 4,
            'line-opacity': 0.85,
          },
        });
      }
    });
  }, [mapReady, safeRoutes]);

  // Sync Bus Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !safeBuses.length) return;

    const bus01 = safeBuses[0];
    const busPos: [number, number] = [bus01.last_lon || 81.65, bus01.last_lat || 21.2];

    if (!busMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'w-3.5 h-3.5 rounded-full bg-[#7C6CF0] border-2 border-white shadow-md animate-bus-pulse';
      busMarkerRef.current = new Marker({ element: el })
        .setLngLat(busPos)
        .addTo(map);
    } else {
      busMarkerRef.current.setLngLat(busPos);
    }
  }, [mapReady, safeBuses]);

  if (busesError) {
    return <ErrorState message="Could not load corridor map data." onRetry={() => refetchBuses()} />;
  }

  return (
    <div className="h-full w-full relative overflow-hidden bg-[var(--bg-base)]">
      {/* Full-Bleed Map Canvas */}
      <div ref={setMapContainer} className="absolute inset-0 w-full h-full" />

      {isLoading && (
        <div className="absolute inset-0 z-30 bg-[var(--bg-base)]/50 backdrop-blur-xs flex items-center justify-center">
          <LoadingState message="Loading geographic telemetry..." />
        </div>
      )}

      {/* Floating Basemap Controls (Top-Right) */}
      <div className="absolute top-3 right-3 z-20 pointer-events-auto">
        <GlassPanel className="p-0.5 flex items-center gap-0.5">
          <button
            onClick={() => setMapTheme('default')}
            title="Roads view"
            className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              mapTheme === 'default'
                ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
            Roads
          </button>
          <button
            onClick={() => setMapTheme('satellite')}
            title="Satellite view"
            className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              mapTheme === 'satellite'
                ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Satellite className="w-3.5 h-3.5" strokeWidth={1.5} />
            Satellite
          </button>
        </GlassPanel>
      </div>

      {/* Floating Left & Right Glass Panels */}
      <div className="absolute inset-0 p-3 pointer-events-none flex justify-between items-start">
        {/* Left: Fleet Corridors */}
        <div className="pointer-events-auto">
          <FleetPanel
            buses={safeBuses}
            journeys={safeJourneys}
            selectedJourneyId={selectedJourney?.id || null}
            onSelectJourney={setSelectedJourney}
          />
        </div>

        {/* Right: Legend */}
        <div className="pointer-events-auto mr-12 sm:mr-0">
          <RoadConditionsPanel />
        </div>
      </div>

      {/* Selected Route Info Popup */}
      {selectedJourney && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
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

      {/* Work Order Modal */}
      <WorkOrderModal
        isOpen={isWorkOrderOpen}
        onClose={() => setIsWorkOrderOpen(false)}
        data={workOrderData}
      />
    </div>
  );
}
