import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Map as MapLibreMap, NavigationControl, Marker, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MOCK_ALERTS, MOCK_ROUTES } from '../services/mockData';
import { WorkOrderModal, type WorkOrderData } from '../components/ui/WorkOrderModal';
import { VlmAuditModal } from '../components/ui/VlmAuditModal';
import { getEvidenceUrl } from '../utils/evidence';
import { DARK_MAP_STYLE, MAP_STYLE } from '../utils/mapStyle';
import { useTheme } from '../context/ThemeContext';
import { getNormalizedSeverity, type SeverityMeta } from '../utils/severity';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusDot } from '../components/ui/StatusDot';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Sparkles,
  FileText,
  Compass,
  ZoomIn,
  X,
  Gauge,
  Activity,
} from 'lucide-react';

// Parse Route 1 Coordinates for synchronized map tracking (Raipur NH-30 corridor)
const RAW_ROUTE_COORDS: [number, number][] = (() => {
  try {
    const raw = MOCK_ROUTES[0]?.geojson_path;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
})();

type BufferState = 'standby' | 'extracting' | 'ready';
type BufferPreset = '30s' | '45s' | 'full';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Map defect title to sentence case
function getDefectTitle(alert: { id: number; evidenceUrl?: string | null; type?: string }) {
  const url = (alert.evidenceUrl || '').toLowerCase();
  const rawType = (alert.type || '').toUpperCase();

  if (url.includes('pothole') || rawType.includes('POTHOLE')) {
    return 'Road surface pothole';
  }
  if (url.includes('crack') || rawType.includes('CRACK')) {
    return 'Transverse pavement crack';
  }
  if (url.includes('edge') || rawType.includes('EDGE')) {
    return 'Shoulder edge defect';
  }
  return 'Pavement distress';
}

export function VideoVault() {
  const searchParams = useSearchParams()[0];
  const navigate = useNavigate();
  const { theme } = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);

  // MapLibre references
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const busMarkerRef = useRef<Marker | null>(null);
  const incidentMarkersRef = useRef<Marker[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);

  // Buffer Lifecycle State
  const initialTimeParam = searchParams.get('time');
  const [bufferState, setBufferState] = useState<BufferState>(() => {
    return initialTimeParam ? 'extracting' : 'standby';
  });
  const [bufferPreset, setBufferPreset] = useState<BufferPreset>('45s');
  const [extractionProgress, setExtractionProgress] = useState(0);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(922);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(true);
  const [showBboxOverlay, setShowBboxOverlay] = useState(true);
  const [videoLoadError, setVideoLoadError] = useState(false);

  // Selected Incident State
  const initialAlertId = Number(searchParams.get('alertId')) || MOCK_ALERTS[0]?.id || 1;
  const [selectedAlertId, setSelectedAlertId] = useState<number>(initialAlertId);
  const [isWorkOrderModalOpen, setIsWorkOrderModalOpen] = useState(false);
  const [isEnlargedImageOpen, setIsEnlargedImageOpen] = useState(false);
  const [isVlmModalOpen, setIsVlmModalOpen] = useState(false);

  // Normalized Incident List
  const incidentList = useMemo(() => {
    return MOCK_ALERTS.filter((a) => a.detection?.video_timestamp_sec != null).map((a) => {
      const conf = a.detection?.confidence ?? 0.85;
      const severityMeta = getNormalizedSeverity({
        severity: a.severity,
        confidence: conf,
        type: a.type,
      });

      return {
        id: a.id,
        title: getDefectTitle({ id: a.id, evidenceUrl: a.detection?.evidence_url, type: a.type }),
        rawType: a.type,
        severityMeta,
        confidence: conf,
        timeSec: a.detection?.video_timestamp_sec || 50.4,
        lat: a.detection?.lat || 21.1378,
        lon: a.detection?.lon || 81.6654,
        evidenceUrl: a.detection?.evidence_url,
      };
    });
  }, []);

  // Grouped Incidents (location within 300m and same defect title)
  const groupedIncidents = useMemo(() => {
    const groups: {
      id: number;
      title: string;
      rawType: string;
      severityMeta: SeverityMeta;
      confidence: number;
      timeSec: number;
      lat: number;
      lon: number;
      evidenceUrl?: string | null;
      count: number;
      items: typeof incidentList;
    }[] = [];

    for (const inc of incidentList) {
      const existing = groups.find(
        (g) =>
          g.title === inc.title &&
          getDistanceMeters(g.lat, g.lon, inc.lat, inc.lon) <= 300
      );

      if (existing) {
        existing.count += 1;
        existing.items.push(inc);
      } else {
        groups.push({
          id: inc.id,
          title: inc.title,
          rawType: inc.rawType,
          severityMeta: inc.severityMeta,
          confidence: inc.confidence,
          timeSec: inc.timeSec,
          lat: inc.lat,
          lon: inc.lon,
          evidenceUrl: inc.evidenceUrl,
          count: 1,
          items: [inc],
        });
      }
    }

    return groups;
  }, [incidentList]);

  const activeAlert = useMemo(() => {
    return incidentList.find((i) => i.id === selectedAlertId) || incidentList[0];
  }, [incidentList, selectedAlertId]);

  // Sliced Window Calculation
  const sliceConfig = useMemo(() => {
    const totalDuration = duration > 0 ? duration : 922;
    if (bufferPreset === 'full') {
      return {
        sliceStart: 0,
        sliceDuration: totalDuration,
        sliceEnd: totalDuration,
        impactRelTime: activeAlert ? activeAlert.timeSec : 0,
      };
    }

    const leadSeconds = bufferPreset === '30s' ? 10 : 15;
    const windowLength = bufferPreset === '30s' ? 30 : 45;
    const incidentSec = activeAlert ? activeAlert.timeSec : 60;

    const sliceStart = Math.max(0, incidentSec - leadSeconds);
    const sliceDuration = windowLength;
    const sliceEnd = Math.min(totalDuration, sliceStart + windowLength);
    const impactRelTime = incidentSec - sliceStart;

    return { sliceStart, sliceDuration, sliceEnd, impactRelTime };
  }, [bufferPreset, activeAlert, duration]);

  const sliceCurrentTime = useMemo(() => {
    if (bufferPreset === 'full') return currentTime;
    return Math.max(0, Math.min(sliceConfig.sliceDuration, currentTime - sliceConfig.sliceStart));
  }, [currentTime, sliceConfig, bufferPreset]);

  // Buffer Extraction Simulation
  const executeBufferExtraction = useCallback(
    (targetIncident: typeof activeAlert, preset: BufferPreset = bufferPreset) => {
      setBufferState('extracting');
      setExtractionProgress(10);

      const interval = setInterval(() => {
        setExtractionProgress((prev) => {
          if (prev >= 95) {
            clearInterval(interval);
            return 95;
          }
          return prev + 25;
        });
      }, 150);

      setTimeout(() => {
        clearInterval(interval);
        setExtractionProgress(100);
        setBufferState('ready');

        const lead = preset === '30s' ? 10 : 15;
        const targetStart =
          preset === 'full' ? 0 : Math.max(0, targetIncident.timeSec - lead);

        if (videoRef.current) {
          videoRef.current.currentTime = targetStart;
          setCurrentTime(targetStart);
        }
      }, 800);
    },
    [bufferPreset, duration, activeAlert]
  );

  useEffect(() => {
    if (initialTimeParam && activeAlert) {
      executeBufferExtraction(activeAlert, '45s');
    }
  }, [initialTimeParam, activeAlert, executeBufferExtraction]);

  // Route Coordinates Interpolation
  const currentBusPos = useMemo((): [number, number] => {
    if (!RAW_ROUTE_COORDS.length) return [81.6654, 21.1378];
    const totalDuration = duration > 0 ? duration : 922;
    const ratio = Math.min(1, Math.max(0, currentTime / totalDuration));
    const targetIndex = Math.min(
      Math.floor(ratio * (RAW_ROUTE_COORDS.length - 1)),
      RAW_ROUTE_COORDS.length - 1
    );
    return RAW_ROUTE_COORDS[targetIndex] || [81.6654, 21.1378];
  }, [currentTime, duration]);

  // Playback Controls
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setVideoLoadError(true));
    }
  };

  const handleStepFrame = (secondsOffset: number) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + secondsOffset));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleScrubberChange = (relTimeSec: number) => {
    const absTime =
      bufferPreset === 'full' ? relTimeSec : sliceConfig.sliceStart + relTimeSec;
    if (videoRef.current) {
      videoRef.current.currentTime = absTime;
      setCurrentTime(absTime);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);

    if (bufferPreset !== 'full' && cur >= sliceConfig.sliceEnd) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSelectIncident = (inc: { id: number; timeSec: number }) => {
    setSelectedAlertId(inc.id);
    if (bufferState === 'ready' && activeAlert) {
      executeBufferExtraction(activeAlert, bufferPreset);
    }
  };

  // MapLibre Initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      const map = new MapLibreMap({
        container: mapContainerRef.current,
        style: theme === 'light' ? MAP_STYLE : DARK_MAP_STYLE,
        center: [81.65, 21.2],
        zoom: 12,
        attributionControl: false,
      });

      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', () => {
        setIsMapReady(true);

        if (RAW_ROUTE_COORDS.length > 1) {
          map.addSource('route-corridor', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: RAW_ROUTE_COORDS,
              },
            },
          });

          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route-corridor',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#7C6CF0',
              'line-width': 3.5,
              'line-opacity': 0.85,
            },
          });

          const bounds = new LngLatBounds();
          RAW_ROUTE_COORDS.forEach((coord) => bounds.extend(coord));
          map.fitBounds(bounds, { padding: 25, duration: 0 });
        }
      });

      mapRef.current = map;
    } catch (e) {
      console.warn('MapLibre init error in VideoVault:', e);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [theme]);

  // Sync Bus Marker on Map
  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;

    if (!busMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'w-3.5 h-3.5 rounded-full bg-[#7C6CF0] border-2 border-white shadow-md animate-bus-pulse';
      busMarkerRef.current = new Marker({ element: el })
        .setLngLat(currentBusPos)
        .addTo(mapRef.current);
    } else {
      busMarkerRef.current.setLngLat(currentBusPos);
    }
  }, [currentBusPos, isMapReady]);

  // Sync Incident Markers on Map
  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;

    incidentMarkersRef.current.forEach((m) => m.remove());
    incidentMarkersRef.current = [];

    groupedIncidents.forEach((inc) => {
      const el = document.createElement('div');
      const isSelected = inc.id === selectedAlertId;
      el.className = `w-2.5 h-2.5 rounded-full border border-white cursor-pointer transition-transform ${
        isSelected ? 'scale-150 ring-2 ring-[var(--accent)]' : ''
      }`;
      el.style.backgroundColor = inc.severityMeta.color;

      el.addEventListener('click', () => handleSelectIncident(inc));

      const marker = new Marker({ element: el })
        .setLngLat([inc.lon, inc.lat])
        .addTo(mapRef.current!);

      incidentMarkersRef.current.push(marker);
    });
  }, [groupedIncidents, selectedAlertId, isMapReady]);

  const recenterMapOnBus = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({ center: currentBusPos, zoom: 14, speed: 1.2 });
  };

  const isNearIncident = activeAlert && Math.abs(currentTime - activeAlert.timeSec) < 3.0;

  // Work order data prep
  const workOrderData: WorkOrderData | null = activeAlert
    ? {
        ticketId: `PWD-RAI-2026-${String(activeAlert.id).padStart(4, '0')}`,
        defectType: activeAlert.title,
        severity: activeAlert.severityMeta.tier === 'NEEDS_REVIEW' ? 'LOW' : (activeAlert.severityMeta.tier as any),
        lat: activeAlert.lat,
        lon: activeAlert.lon,
        streetName: 'NH-30 Raipur Corridor',
        confidence: activeAlert.confidence,
        evidenceUrl: activeAlert.evidenceUrl,
        videoTimestamp: activeAlert.timeSec,
        trafficWeight: 3.2,
        detectedAt: new Date().toISOString(),
        busId: 'Bus 01',
      }
    : null;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Quiet Top Sub-Header */}
      <div className="h-11 px-4 border-b border-[var(--border-subtle)] bg-[var(--surface)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="ghost"
            icon={<ArrowLeft className="w-3.5 h-3.5" />}
            onClick={() => navigate('/live-alerts')}
          >
            Live alerts
          </Button>
          <span className="text-[var(--border-strong)]">/</span>
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            Corridor NH-30
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            · Bus 01 synchronized drive
          </span>
        </div>

        <div className="flex items-center gap-2">
          <StatusDot status="success" label="Ingest connected" />
        </div>
      </div>

      {/* Main 3-Zone Workspace */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden min-h-0">
        {/* ========================================================
            ZONE 1: Investigation Control Rail (Left 3 Columns)
           ======================================================== */}
        <aside className="col-span-3 border-r border-[var(--border-subtle)] bg-[var(--surface)] p-3 flex flex-col min-h-0 overflow-hidden space-y-3">
          {/* Corridor & Bus Summary Card */}
          <Card className="p-3 space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Corridor overview
              </span>
              <StatusDot status="success" label="Active" />
            </div>
            <div className="text-xs text-[var(--text-muted)] space-y-1">
              <div className="flex justify-between">
                <span>Bus ID</span>
                <span className="font-mono text-[var(--text-primary)]">BUS-01</span>
              </div>
              <div className="flex justify-between">
                <span>Route</span>
                <span className="text-[var(--text-primary)]">NH-30 Raipur–Simga</span>
              </div>
            </div>
          </Card>

          {/* Clip Duration Segmented Control */}
          <Card className="p-3 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Clip duration
              </span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {bufferPreset === '30s' ? '2.8 MB' : bufferPreset === '45s' ? '4.2 MB' : '151 MB'}
              </span>
            </div>

            <SegmentedControl
              value={bufferPreset}
              onChange={(val) => {
                const nextPreset = val as BufferPreset;
                setBufferPreset(nextPreset);
                if (bufferState === 'ready' && activeAlert) {
                  executeBufferExtraction(activeAlert, nextPreset);
                }
              }}
              options={[
                { value: '30s', label: '30s' },
                { value: '45s', label: '45s' },
                { value: 'full', label: 'Full' },
              ]}
              fullWidth
            />

            {/* Single Primary Action Button */}
            {bufferState === 'ready' ? (
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                onClick={() => setBufferState('standby')}
              >
                Change clip
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                fullWidth
                loading={bufferState === 'extracting'}
                icon={<Play className="w-3.5 h-3.5" />}
                onClick={() => activeAlert && executeBufferExtraction(activeAlert, bufferPreset)}
              >
                Load clip
              </Button>
            )}
          </Card>

          {/* Grouped Defect Queue Along Route */}
          <div className="flex-1 flex flex-col min-h-0 space-y-1.5">
            <div className="flex items-center justify-between px-0.5 shrink-0">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Route detections
              </span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {groupedIncidents.length} clusters
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
              {groupedIncidents.map((inc) => {
                const isSelected = selectedAlertId === inc.id;
                const dotStatus =
                  inc.severityMeta.tier === 'CRITICAL'
                    ? 'critical'
                    : inc.severityMeta.tier === 'HIGH'
                    ? 'high'
                    : inc.severityMeta.tier === 'LOW'
                    ? 'low'
                    : inc.severityMeta.tier === 'NEEDS_REVIEW'
                    ? 'neutral'
                    : 'medium';

                return (
                  <div
                    key={inc.id}
                    onClick={() => handleSelectIncident(inc)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--text-primary)] font-medium'
                        : 'bg-[var(--surface-raised)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-1">
                      <StatusDot status={dotStatus} />
                      <div className="min-w-0">
                        <div className="text-xs truncate font-medium text-[var(--text-primary)]">
                          {inc.title}
                          {inc.count > 1 && (
                            <span className="ml-1 text-[11px] font-mono text-[var(--text-muted)]">
                              ×{inc.count}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                          <span className="font-mono">{formatTime(inc.timeSec)}</span>
                          <span>·</span>
                          <span className="font-mono">{Math.round(inc.confidence * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ========================================================
            ZONE 2: Hero Video Player (Center 6 Columns)
           ======================================================== */}
        <main className="col-span-6 bg-[var(--bg-base)] p-3 flex flex-col justify-between overflow-hidden">
          {/* Main Stage Viewport (16:9 Hero) */}
          <div className="relative rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-black aspect-video flex items-center justify-center shadow-lg">
            {/* Standby Screen */}
            {bufferState === 'standby' && (
              <div className="absolute inset-0 bg-[var(--surface)] flex flex-col items-center justify-center p-6 text-center z-10">
                <div className="max-w-md w-full space-y-3.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-raised)] border border-[var(--border-strong)] text-xs text-[var(--text-secondary)]">
                    <StatusDot status="info" />
                    <span>Synchronized clip ready</span>
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      {activeAlert.title}
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">
                      Corridor NH-30 · Timestamp{' '}
                      <span className="font-mono">{formatTime(activeAlert.timeSec)}</span>
                    </p>
                  </div>

                  {/* Incident Snapshot Preview Card */}
                  <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-3 text-left space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">Vehicle: Bus 01</span>
                      <StatusDot
                        status={
                          activeAlert.severityMeta.tier === 'CRITICAL'
                            ? 'critical'
                            : activeAlert.severityMeta.tier === 'HIGH'
                            ? 'high'
                            : activeAlert.severityMeta.tier === 'LOW'
                            ? 'low'
                            : activeAlert.severityMeta.tier === 'NEEDS_REVIEW'
                            ? 'neutral'
                            : 'medium'
                        }
                        label={activeAlert.severityMeta.label}
                      />
                    </div>
                    <div className="flex gap-3 items-center">
                      {activeAlert.evidenceUrl && (
                        <img
                          src={getEvidenceUrl(activeAlert.evidenceUrl)!}
                          alt="Defect crop"
                          onError={(e) => {
                            e.currentTarget.src = '/evidence/pothole_01.jpg';
                          }}
                          className="w-24 h-14 object-cover rounded border border-[var(--border-subtle)] bg-black"
                        />
                      )}
                      <div className="text-[11px] text-[var(--text-muted)] space-y-0.5 font-mono">
                        <div>
                          GPS: {activeAlert.lat.toFixed(4)}° N, {activeAlert.lon.toFixed(4)}° E
                        </div>
                        <div>Confidence: {Math.round(activeAlert.confidence * 100)}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Primary Load Button */}
                  <div className="pt-1">
                    <Button
                      variant="primary"
                      size="md"
                      fullWidth
                      icon={<Play className="w-4 h-4" />}
                      onClick={() => executeBufferExtraction(activeAlert, bufferPreset)}
                    >
                      Load {bufferPreset === 'full' ? 'full video' : `${bufferPreset} clip`}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Extracting / Loading Screen */}
            {bufferState === 'extracting' && (
              <div className="absolute inset-0 bg-[var(--surface)] flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="max-w-xs w-full space-y-3">
                  <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
                  <div className="text-xs font-medium text-[var(--text-primary)]">
                    Loading synchronized footage...
                  </div>
                  <div className="w-full bg-[var(--surface-raised)] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[var(--accent)] h-full transition-all duration-200"
                      style={{ width: `${extractionProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Video Player */}
            <video
              ref={videoRef}
              src="/videos/real_bus_drive.mp4"
              className={`w-full h-full object-contain ${
                bufferState === 'ready' && !videoLoadError ? 'block' : 'hidden'
              }`}
              muted={isMuted}
              playsInline
              onError={() => setVideoLoadError(true)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  setDuration(videoRef.current.duration || 922);
                }
              }}
              onEnded={() => setIsPlaying(false)}
            />

            {/* Offline Fallback View */}
            {bufferState === 'ready' && videoLoadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--surface)] p-6 text-center">
                <div className="max-w-sm w-full space-y-2.5">
                  {activeAlert.evidenceUrl && (
                    <img
                      src={getEvidenceUrl(activeAlert.evidenceUrl)!}
                      alt="Defect crop"
                      onError={(e) => {
                        e.currentTarget.src = '/evidence/pothole_01.jpg';
                      }}
                      className="w-full h-40 object-cover rounded-lg border border-[var(--border-subtle)]"
                    />
                  )}
                  <p className="text-xs text-[var(--text-muted)]">
                    Local video file unavailable. Telemetry, GPS corridor sync, and VLM verification remain active.
                  </p>
                </div>
              </div>
            )}

            {/* Burned-in OSD Top/Bottom */}
            {bufferState === 'ready' && (
              <>
                <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-center pointer-events-none z-20 text-[10px] font-mono text-white/90">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>BUS-01 · 1080p</span>
                    <span>· 42 km/h</span>
                  </div>
                  <div className="tabular-nums">
                    {formatTime(sliceCurrentTime)} / {formatTime(sliceConfig.sliceDuration)}
                  </div>
                </div>

                {/* Subtitle Bounding Box Overlay */}
                {showBboxOverlay && isNearIncident && activeAlert && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                    <div className="border border-white/80 bg-black/40 backdrop-blur-xs rounded-lg p-3 flex flex-col items-center shadow-lg">
                      <span className="text-xs font-semibold text-white">{activeAlert.title}</span>
                      <span className="text-[10px] font-mono text-white/80">
                        {Math.round(activeAlert.confidence * 100)}% confidence
                      </span>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center pointer-events-none z-20 text-[9px] font-mono text-white/70">
                  <span>
                    GPS: {currentBusPos[1].toFixed(4)}° N, {currentBusPos[0].toFixed(4)}° E
                  </span>
                  <span className="tabular-nums">
                    Total: {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Slim Timeline & Compact Playback Controls */}
          <Card className="p-2.5 mt-2 space-y-2">
            {/* Timeline Slider with Defect Ticks */}
            <div className="relative w-full h-5 flex items-center">
              {/* Defect Tick */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-3 rounded-xs bg-[#F0524F] pointer-events-none z-20"
                style={{
                  left: `${(sliceConfig.impactRelTime / sliceConfig.sliceDuration) * 100}%`,
                }}
                title={`Defect at ${formatTime(sliceConfig.impactRelTime)}`}
              />

              <input
                type="range"
                min="0"
                max={sliceConfig.sliceDuration || 45}
                step="0.05"
                value={sliceCurrentTime}
                onChange={(e) => handleScrubberChange(parseFloat(e.target.value))}
                disabled={bufferState !== 'ready'}
                aria-label="Timeline position"
                className="w-full h-1 bg-[var(--surface-raised)] rounded-full appearance-none cursor-pointer accent-[var(--accent)] relative z-10 disabled:opacity-40"
              />
            </div>

            {/* Compact Controls Row */}
            <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
              {/* Play / Step Buttons & Time */}
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={togglePlay}
                  disabled={bufferState !== 'ready'}
                  icon={isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                />

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleStepFrame(-5)}
                  disabled={bufferState !== 'ready'}
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                  title="Rewind 5s"
                  aria-label="Rewind 5s"
                />

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleStepFrame(5)}
                  disabled={bufferState !== 'ready'}
                  icon={<RotateCw className="w-3.5 h-3.5" />}
                  title="Forward 5s"
                  aria-label="Forward 5s"
                />

                <div className="ml-1 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                  <span className="text-[var(--text-primary)] font-medium">
                    {formatTime(sliceCurrentTime)}
                  </span>
                  <span className="text-[var(--text-muted)]"> / </span>
                  <span>{formatTime(sliceConfig.sliceDuration)}</span>
                </div>
              </div>

              {/* Speed & Toggles */}
              <div className="flex items-center gap-1.5">
                <SegmentedControl
                  size="sm"
                  value={String(playbackSpeed)}
                  onChange={(v) => handleSpeedChange(parseFloat(v))}
                  options={[
                    { value: '0.5', label: '0.5×' },
                    { value: '1', label: '1×' },
                    { value: '2', label: '2×' },
                  ]}
                />

                <Button
                  size="sm"
                  variant={showBboxOverlay ? 'secondary' : 'ghost'}
                  onClick={() => setShowBboxOverlay(!showBboxOverlay)}
                >
                  Boxes
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsMuted(!isMuted)}
                  icon={isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                />
              </div>
            </div>
          </Card>
        </main>

        {/* ========================================================
            ZONE 3: Route Map & Vehicle Status (Right 3 Columns)
           ======================================================== */}
        <aside className="col-span-3 border-l border-[var(--border-subtle)] bg-[var(--surface)] p-3 flex flex-col justify-between overflow-y-auto space-y-3">
          <div className="space-y-3">
            {/* Flat Route Map Card */}
            <Card className="p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Corridor map
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Compass className="w-3 h-3" />}
                  onClick={recenterMapOnBus}
                >
                  Recenter
                </Button>
              </div>

              <div className="h-44 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] relative overflow-hidden">
                <div ref={mapContainerRef} className="w-full h-full" />
                <div className="absolute top-2 left-2 bg-[var(--surface)]/90 backdrop-blur-xs px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)]">
                  Bus 01 · NH-30
                </div>
              </div>
            </Card>

            {/* Vehicle Status: Two Plain Stats */}
            <Card className="p-3 space-y-2">
              <span className="text-xs font-semibold text-[var(--text-primary)] block">
                Vehicle telemetry
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
                  <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                    <Gauge className="w-3 h-3" />
                    Speed
                  </div>
                  <div className="text-sm font-semibold font-mono text-[var(--text-primary)] mt-0.5">
                    42 km/h
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
                  <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    Surface vibration
                  </div>
                  <div className="text-sm font-semibold font-mono text-[var(--text-primary)] mt-0.5">
                    {isNearIncident ? 'Elevated' : 'Normal'}
                  </div>
                </div>
              </div>
            </Card>

            {/* Selected Defect Evidence Card */}
            {activeAlert && (
              <Card className="p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {activeAlert.title}
                  </span>
                  <StatusDot
                    status={
                      activeAlert.severityMeta.tier === 'CRITICAL'
                        ? 'critical'
                        : activeAlert.severityMeta.tier === 'HIGH'
                        ? 'high'
                        : activeAlert.severityMeta.tier === 'LOW'
                        ? 'low'
                        : activeAlert.severityMeta.tier === 'NEEDS_REVIEW'
                        ? 'neutral'
                        : 'medium'
                    }
                    label={activeAlert.severityMeta.label}
                  />
                </div>

                <div className="text-[11px] font-mono text-[var(--text-muted)]">
                  GPS: {activeAlert.lat.toFixed(4)}° N, {activeAlert.lon.toFixed(4)}° E
                </div>

                {activeAlert.evidenceUrl && (
                  <div
                    onClick={() => setIsEnlargedImageOpen(true)}
                    className="relative h-28 w-full rounded-lg overflow-hidden border border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-black group cursor-pointer transition-all mt-1"
                  >
                    <img
                      src={getEvidenceUrl(activeAlert.evidenceUrl)!}
                      alt="Defect crop"
                      onError={(e) => {
                        e.currentTarget.src = '/evidence/pothole_01.jpg';
                      }}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-[10px] text-white/90">
                      <span>Click to enlarge</span>
                      <ZoomIn className="w-3 h-3" />
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Action Footer: VLM Verification & Work Order Dispatch */}
          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <Button
              variant="secondary"
              size="md"
              fullWidth
              icon={<Sparkles className="w-4 h-4 text-[var(--accent)]" />}
              onClick={() => setIsVlmModalOpen(true)}
            >
              VLM verification
            </Button>

            <Button
              variant="primary"
              size="md"
              fullWidth
              icon={<FileText className="w-4 h-4" />}
              onClick={() => setIsWorkOrderModalOpen(true)}
            >
              Create work order
            </Button>
          </div>
        </aside>
      </div>

      {/* Enlarged Evidence Inspection Modal */}
      {isEnlargedImageOpen && activeAlert && activeAlert.evidenceUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-6 animate-in fade-in duration-150"
          onClick={() => setIsEnlargedImageOpen(false)}
        >
          <div
            className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl max-w-2xl w-full p-4 space-y-3 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Evidence photo · #{activeAlert.id}
              </span>
              <button
                onClick={() => setIsEnlargedImageOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-black max-h-[60vh] flex items-center justify-center">
              <img
                src={getEvidenceUrl(activeAlert.evidenceUrl)!}
                alt="Enlarged defect"
                onError={(e) => {
                  e.currentTarget.src = '/evidence/pothole_01.jpg';
                }}
                className="max-h-[55vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* VLM Verification Modal */}
      <VlmAuditModal
        isOpen={isVlmModalOpen}
        onClose={() => setIsVlmModalOpen(false)}
        alertId={activeAlert.id}
        evidenceUrl={activeAlert.evidenceUrl}
        initialType={activeAlert.title}
        lat={activeAlert.lat}
        lon={activeAlert.lon}
      />

      {/* Work Order Modal */}
      <WorkOrderModal
        isOpen={isWorkOrderModalOpen}
        onClose={() => setIsWorkOrderModalOpen(false)}
        data={workOrderData}
      />
    </div>
  );
}
