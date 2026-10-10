import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Map as MapLibreMap, NavigationControl, Marker, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MOCK_ALERTS, MOCK_ROUTES } from '../services/mockData';
import { WorkOrderModal } from '../components/ui/WorkOrderModal';
import { VlmAuditModal } from '../components/ui/VlmAuditModal';
import { getEvidenceUrl } from '../utils/evidence';
import { DARK_MAP_STYLE } from '../utils/mapStyle';

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

// Municipal Pavement Defect Classification Engine
function getDefectClassification(alert: {
  id: number;
  severity?: string;
  evidenceUrl?: string | null;
}) {
  const url = (alert.evidenceUrl || '').toLowerCase();
  const sev = (alert.severity || 'MEDIUM').toUpperCase();

  if (url.includes('pothole')) {
    if (sev === 'CRITICAL') {
      return {
        displayTitle: 'Deep Pothole (10cm)',
        category: 'POTHOLE',
        badgeColor: 'border-red-500/40 bg-red-950/60 text-red-300',
      };
    }
    if (sev === 'HIGH') {
      return {
        displayTitle: 'Pothole Cavity',
        category: 'POTHOLE',
        badgeColor: 'border-orange-500/40 bg-orange-950/60 text-orange-300',
      };
    }
    return {
      displayTitle: 'Surface Pothole',
      category: 'POTHOLE',
      badgeColor: 'border-amber-500/40 bg-amber-950/60 text-amber-300',
    };
  }

  if (url.includes('crack')) {
    if (sev === 'CRITICAL') {
      return {
        displayTitle: 'Alligator Cracks',
        category: 'CRACK',
        badgeColor: 'border-red-500/40 bg-red-950/60 text-red-300',
      };
    }
    if (sev === 'HIGH') {
      return {
        displayTitle: 'Transverse Crack',
        category: 'CRACK',
        badgeColor: 'border-orange-500/40 bg-orange-950/60 text-orange-300',
      };
    }
    return {
      displayTitle: 'Longitudinal Seam',
      category: 'CRACK',
      badgeColor: 'border-sky-500/40 bg-sky-950/60 text-sky-300',
    };
  }

  const types = [
    { title: 'Transverse Crack', cat: 'CRACK', color: 'border-orange-500/40 bg-orange-950/60 text-orange-300' },
    { title: 'Deep Pothole (8cm)', cat: 'POTHOLE', color: 'border-red-500/40 bg-red-950/60 text-red-300' },
    { title: 'Alligator Cracks', cat: 'CRACK', color: 'border-red-500/40 bg-red-950/60 text-red-300' },
    { title: 'Shoulder Drop-Off', cat: 'EDGE', color: 'border-amber-500/40 bg-amber-950/60 text-amber-300' },
    { title: 'Asphalt Rutting', cat: 'RUTTING', color: 'border-sky-500/40 bg-sky-950/60 text-sky-300' },
  ];
  const pick = types[alert.id % types.length];
  return { displayTitle: pick.title, category: pick.cat, badgeColor: pick.color };
}

export function VideoVault() {
  const searchParams = useSearchParams()[0];
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  // MapLibre references for Zone 3
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
  const [extractionLog, setExtractionLog] = useState<string[]>([]);

  // Video and Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(922); // Real bus drive is ~15:22 (922s)
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

  // List of alerts with valid video timestamps and rich classifications
  const incidentList = useMemo(() => {
    return MOCK_ALERTS.filter((a) => a.detection?.video_timestamp_sec != null).map((a) => {
      const classification = getDefectClassification({
        id: a.id,
        severity: a.severity,
        evidenceUrl: a.detection?.evidence_url,
      });

      return {
        id: a.id,
        title: classification.displayTitle,
        category: classification.category,
        badgeColor: classification.badgeColor,
        rawType: a.type,
        type: classification.displayTitle,
        severity: a.severity || 'MEDIUM',
        confidence: a.detection?.confidence || 0.85,
        timeSec: a.detection?.video_timestamp_sec || 50.4,
        lat: a.detection?.lat || 21.1378,
        lon: a.detection?.lon || 81.6654,
        evidenceUrl: a.detection?.evidence_url,
      };
    });
  }, []);

  const activeAlert = useMemo(() => {
    return incidentList.find((i) => i.id === selectedAlertId) || incidentList[0];
  }, [incidentList, selectedAlertId]);

  // Compute sliced window parameters
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

  // Current relative time within the sliced buffer (0 to sliceDuration)
  const sliceCurrentTime = useMemo(() => {
    if (bufferPreset === 'full') return currentTime;
    return Math.max(0, Math.min(sliceConfig.sliceDuration, currentTime - sliceConfig.sliceStart));
  }, [currentTime, sliceConfig, bufferPreset]);

  // Synchronize Bus Coordinates based on current playback second
  const currentBusPos: [number, number] = useMemo(() => {
    if (!RAW_ROUTE_COORDS.length || duration <= 0) return [81.6658, 21.1342];
    const progress = Math.min(1, Math.max(0, currentTime / duration));
    const idx = Math.min(
      RAW_ROUTE_COORDS.length - 1,
      Math.floor(progress * RAW_ROUTE_COORDS.length)
    );
    return RAW_ROUTE_COORDS[idx];
  }, [currentTime, duration]);

  // Active Incident Proximity Detection (Within +/- 2.5 seconds of defect impact)
  const isNearIncident = useMemo(() => {
    if (!activeAlert) return false;
    return Math.abs(currentTime - activeAlert.timeSec) < 2.5;
  }, [currentTime, activeAlert]);

  // Simulated Dynamic Speed (Slows down when passing over defects)
  const dynamicSpeed = useMemo(() => {
    if (!isPlaying && bufferState !== 'ready') return 0;
    if (isNearIncident) return 22; // Decelerating over defect
    return Math.round(38 + Math.sin(currentTime * 0.5) * 4); // Cruising ~38-42 km/h
  }, [isPlaying, bufferState, isNearIncident, currentTime]);

  // Dynamic Road Roughness Index (IRI G-Force Spike)
  const roughnessIndex = useMemo(() => {
    if (!isPlaying && bufferState !== 'ready') return '0.2 G (Low)';
    if (isNearIncident) return '3.8 G (High Spike)';
    return `${(0.4 + Math.sin(currentTime * 1.5) * 0.2).toFixed(1)} G (Normal)`;
  }, [isPlaying, bufferState, isNearIncident, currentTime]);

  // Extraction Simulation Sequence
  const executeBufferExtraction = useCallback((targetAlert = activeAlert, preset = bufferPreset) => {
    setIsPlaying(false);
    setBufferState('extracting');
    setExtractionProgress(15);
    setExtractionLog([
      `Connecting to Bus 01 video stream...`,
    ]);

    setTimeout(() => {
      setExtractionProgress(45);
      setExtractionLog((prev) => [
        ...prev,
        `Locating footage at timestamp ${formatTime(targetAlert.timeSec)}...`,
      ]);
    }, 220);

    setTimeout(() => {
      setExtractionProgress(80);
      const mbSize = preset === '30s' ? '2.8 MB' : preset === '45s' ? '4.2 MB' : '151.4 MB';
      setExtractionLog((prev) => [
        ...prev,
        `Retrieved ${preset.toUpperCase()} clip (${mbSize}) with synchronized GPS.`,
        `Video stream verified.`,
      ]);
    }, 450);

    setTimeout(() => {
      setExtractionProgress(100);
      setBufferState('ready');

      // Seek video to buffer window start
      const lead = preset === '30s' ? 10 : preset === '45s' ? 15 : 0;
      const start = preset === 'full' ? 0 : Math.max(0, targetAlert.timeSec - lead);

      if (videoRef.current) {
        videoRef.current.currentTime = start;
        setCurrentTime(start);
        videoRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {});
      }
    }, 700);
  }, [activeAlert, bufferPreset]);

  // Initial load auto-extraction if URL has `time` query param
  useEffect(() => {
    if (initialTimeParam) {
      executeBufferExtraction();
    }
  }, []); // Run once on mount

  // MapLibre Mini-Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      const map = new MapLibreMap({
        container: mapContainerRef.current,
        style: DARK_MAP_STYLE,
        center: [81.6645, 21.1550], // Centered on NH-30 corridor
        zoom: 12.2,
        attributionControl: false,
      });

      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

      map.on('load', () => {
        setIsMapReady(true);

        // Add Route Line GeoJSON Source
        if (RAW_ROUTE_COORDS.length > 1) {
          map.addSource('nh30-corridor', {
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

          // Route Glow Layer
          map.addLayer({
            id: 'corridor-glow',
            type: 'line',
            source: 'nh30-corridor',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#0284c7',
              'line-width': 6,
              'line-opacity': 0.4,
              'line-blur': 2,
            },
          });

          // Route Core Line
          map.addLayer({
            id: 'corridor-core',
            type: 'line',
            source: 'nh30-corridor',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#38bdf8',
              'line-width': 2.5,
            },
          });

          // Fit bounds to the route corridor
          const bounds = RAW_ROUTE_COORDS.reduce(
            (b, coord) => b.extend(coord),
            new LngLatBounds(RAW_ROUTE_COORDS[0], RAW_ROUTE_COORDS[0])
          );
          map.fitBounds(bounds, { padding: 35, duration: 800 });
        }

        // Add Bus Marker
        const busEl = document.createElement('div');
        busEl.className = 'vault-bus-marker relative flex items-center justify-center cursor-pointer';
        busEl.innerHTML = `
          <div class="absolute w-8 h-8 rounded-full bg-[#38bdf8]/35 animate-ping"></div>
          <div class="relative w-6 h-6 rounded-full bg-[#0284c7] border-2 border-white flex items-center justify-center shadow-[0_0_12px_rgba(56,189,248,0.8)] text-white">
            <span class="material-symbols-outlined text-[13px] leading-none">directions_bus</span>
          </div>
        `;
        busMarkerRef.current = new Marker({ element: busEl })
          .setLngLat(currentBusPos)
          .addTo(map);

        map.resize();
      });

      mapRef.current = map;
    } catch (err) {
      console.error('Error initializing VideoVault MapLibre:', err);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Incident Markers when alert selection or incidentList changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    // Remove existing incident markers
    incidentMarkersRef.current.forEach((m) => m.remove());
    incidentMarkersRef.current = [];

    // Render incident markers
    incidentList.forEach((inc) => {
      const isSelected = inc.id === selectedAlertId;
      const el = document.createElement('div');
      el.className = 'cursor-pointer group flex items-center justify-center';

      if (isSelected) {
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <span class="absolute w-6 h-6 rounded-full bg-red-500/40 animate-ping"></span>
            <div class="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-[0_0_10px_rgba(239,68,68,1)] flex items-center justify-center">
              <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
            </div>
          </div>
        `;
      } else {
        el.innerHTML = `
          <div class="w-2.5 h-2.5 rounded-full bg-red-500/80 border border-white shadow-sm group-hover:scale-150 transition-transform"></div>
        `;
      }

      el.addEventListener('click', () => {
        handleSelectIncident(inc);
      });

      const marker = new Marker({ element: el })
        .setLngLat([inc.lon, inc.lat])
        .addTo(map);

      incidentMarkersRef.current.push(marker);
    });
  }, [isMapReady, incidentList, selectedAlertId]);

  // Update Bus Marker position on video timeupdate
  useEffect(() => {
    if (busMarkerRef.current && currentBusPos) {
      busMarkerRef.current.setLngLat(currentBusPos);
    }
  }, [currentBusPos]);

  // Handle Video Time Update and clamp within sliced boundary
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    setCurrentTime(curr);

    // If playing in sliced buffer mode, clamp playback within slice window
    if (bufferPreset !== 'full') {
      if (curr >= sliceConfig.sliceEnd) {
        videoRef.current.pause();
        setIsPlaying(false);
        videoRef.current.currentTime = sliceConfig.sliceStart;
        setCurrentTime(sliceConfig.sliceStart);
      } else if (curr < sliceConfig.sliceStart) {
        videoRef.current.currentTime = sliceConfig.sliceStart;
        setCurrentTime(sliceConfig.sliceStart);
      }
    }
  };

  const handleSelectIncident = (alertItem: (typeof incidentList)[0]) => {
    setSelectedAlertId(alertItem.id);

    // Center Map on selected incident
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [alertItem.lon, alertItem.lat],
        zoom: 14,
        duration: 900,
      });
    }

    if (bufferState === 'ready') {
      // Re-slice and jump directly
      executeBufferExtraction(alertItem, bufferPreset);
    } else {
      // Stay in standby and show metadata for new selection
      setBufferState('standby');
    }
  };

  // Simulated playback ticker when raw video file is offline (e.g. cloud deployments)
  useEffect(() => {
    if (!videoLoadError || !isPlaying || bufferState !== 'ready') return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.25 * playbackSpeed;
        if (bufferPreset !== 'full' && next >= sliceConfig.sliceEnd) {
          setIsPlaying(false);
          return sliceConfig.sliceStart;
        }
        if (next >= duration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(interval);
  }, [videoLoadError, isPlaying, bufferState, playbackSpeed, bufferPreset, sliceConfig, duration]);

  const togglePlay = () => {
    if (videoLoadError) {
      setIsPlaying(!isPlaying);
      return;
    }
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setVideoLoadError(true);
          setIsPlaying(true);
        });
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current && !videoLoadError) {
      videoRef.current.playbackRate = speed;
    }
  };

  const handleStepFrame = (deltaFrames: number) => {
    if (videoRef.current && !videoLoadError) {
      videoRef.current.pause();
    }
    setIsPlaying(false);

    const frameStep = deltaFrames * (1 / 30);
    const newMasterTime = currentTime + frameStep;

    // Clamp within slice bounds if not full run
    const clampedTime =
      bufferPreset === 'full'
        ? Math.max(0, Math.min(duration, newMasterTime))
        : Math.max(sliceConfig.sliceStart, Math.min(sliceConfig.sliceEnd, newMasterTime));

    if (videoRef.current && !videoLoadError) {
      videoRef.current.currentTime = clampedTime;
    }
    setCurrentTime(clampedTime);
  };

  const handleScrubberChange = (targetSliceSec: number) => {
    const targetMasterSec =
      bufferPreset === 'full'
        ? targetSliceSec
        : sliceConfig.sliceStart + targetSliceSec;

    if (videoRef.current && !videoLoadError) {
      videoRef.current.currentTime = targetMasterSec;
    }
    setCurrentTime(targetMasterSec);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const recenterMapOnBus = () => {
    if (mapRef.current && currentBusPos) {
      mapRef.current.flyTo({
        center: currentBusPos,
        zoom: 14,
        duration: 700,
      });
    }
  };

  return (
    <div className="flex-1 bg-[#0B0E14] text-[#E0E2EA] flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Top Banner Header (Permanently Pinned without Scrolling) */}
      <header className="h-12 border-b border-[#30363D] bg-[#0E121A] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            <h1 className="text-sm font-semibold font-['Inter'] tracking-tight text-white flex items-center gap-2">
              Video Vault
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400">
                Playback
              </span>
            </h1>
          </div>
          <span className="text-[#414752]">|</span>
          <span className="text-xs text-zinc-400 font-['Inter'] hidden md:inline-block">
            Synchronized Dashcam Video & GPS Telemetry
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="text-[11px] font-['Inter'] px-2.5 py-1 rounded-lg bg-[#161B22] border border-[#30363D] text-zinc-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Bus 01 Connected</span>
          </div>
          <button
            onClick={() => navigate('/live-alerts')}
            className="px-3 py-1 border border-[#414752] hover:bg-[#1C2025] text-xs font-['Inter'] rounded-lg text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            <span>Back to Alerts</span>
          </button>
        </div>
      </header>

      {/* Main 3-Zone Workspace */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden min-h-0">
        {/* ========================================================
            ZONE 1: Investigation Control Rail (Left 3 Columns)
           ======================================================== */}
        <aside className="col-span-3 border-r border-[#30363D] bg-[#0A0D13] p-3 flex flex-col min-h-0 overflow-hidden space-y-3">
          {/* Bus & Corridor Info */}
          <div className="p-3 bg-[#12161F] border border-[#30363D] rounded-xl space-y-1.5 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-sky-400 text-[18px]">directions_bus</span>
                Bus 01 (NH-30 Fleet)
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">
                Online
              </span>
            </div>
            <div className="text-xs text-zinc-400 border-t border-[#30363D]/60 pt-1.5 flex justify-between">
              <span>Route</span>
              <span className="text-zinc-200 font-medium">NH-30 Raipur–Simga</span>
            </div>
          </div>

          {/* Clip Length Selector */}
          <div className="p-3 bg-[#12161F] border border-[#30363D] rounded-xl space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                Clip Duration
              </span>
              <span className="text-[10px] text-zinc-400">
                {bufferPreset === '30s' ? '~2.8 MB' : bufferPreset === '45s' ? '~4.2 MB' : '~151 MB'}
              </span>
            </div>

            {/* Duration Presets */}
            <div className="grid grid-cols-3 gap-1.5">
              {(['30s', '45s', 'full'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setBufferPreset(preset);
                    if (bufferState === 'ready') {
                      executeBufferExtraction(activeAlert, preset);
                    }
                  }}
                  className={`py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    bufferPreset === preset
                      ? 'bg-sky-500/15 border-sky-400 text-sky-300'
                      : 'border-[#30363D] text-zinc-400 hover:bg-[#1A1F29] hover:text-white'
                  }`}
                >
                  {preset === 'full' ? 'Full Video' : `${preset.toUpperCase()} Clip`}
                </button>
              ))}
            </div>

            {/* Action Button */}
            {bufferState === 'ready' ? (
              <button
                onClick={() => setBufferState('standby')}
                className="w-full py-2 px-3 border border-sky-400/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-medium rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
                <span>Change Clip Length</span>
              </button>
            ) : (
              <button
                onClick={() => executeBufferExtraction(activeAlert, bufferPreset)}
                disabled={bufferState === 'extracting'}
                className="w-full py-2.5 px-3 bg-sky-400 hover:bg-sky-300 text-slate-900 text-xs font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {bufferState === 'extracting' ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                    <span>Loading Clip...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">play_circle</span>
                    <span>Load {bufferPreset === 'full' ? 'Full Video' : `${bufferPreset.toUpperCase()} Clip`}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Incidents Queue in Journey - Extends to the bottom of the column */}
          <div className="flex-1 flex flex-col min-h-0 space-y-1.5">
            <div className="flex items-center justify-between px-0.5 shrink-0">
              <span className="text-xs font-semibold text-zinc-300">
                Defects Along Route ({incidentList.length})
              </span>
            </div>

            {/* Custom Slim Scrollbar Queue */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[#30363D] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
              {incidentList.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => handleSelectIncident(inc)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                    selectedAlertId === inc.id
                      ? 'bg-sky-500/15 border-sky-400 text-white shadow-sm'
                      : 'bg-[#12161F] border-[#30363D] text-zinc-400 hover:bg-[#1A1F29] hover:text-white'
                  }`}
                >
                  <div className="flex items-start gap-2.5 flex-1 min-w-0 pr-1">
                    <span className="material-symbols-outlined text-red-400 text-[16px] mt-0.5 shrink-0">
                      {inc.category === 'POTHOLE' ? 'warning' : 'construction'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-semibold text-white text-xs truncate">
                          {inc.title}
                        </span>
                        <span className={`text-[9px] font-medium px-1.5 py-0.2 rounded border shrink-0 ${inc.badgeColor}`}>
                          {inc.severity.charAt(0) + inc.severity.slice(1).toLowerCase()}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400 flex items-center gap-2">
                        <span>{formatTime(inc.timeSec)}</span>
                        <span>·</span>
                        <span>{Math.round(inc.confidence * 100)}% Match</span>
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-sky-400 shrink-0">
                    play_circle
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ========================================================
            ZONE 2: Cinema Forensic Video Player (Center 6 Columns)
           ======================================================== */}
        <main className="col-span-6 bg-[#070A0F] p-3 flex flex-col justify-between overflow-hidden">
          {/* Main Stage Viewport */}
          <div className="relative rounded-2xl overflow-hidden border border-[#30363D] bg-black aspect-video flex items-center justify-center shadow-2xl">
            {/* STATE A: Edge Gateway Standby Screen */}
            {bufferState === 'standby' && (
              <div className="absolute inset-0 bg-[#0A0D14] flex flex-col items-center justify-center p-6 text-center z-10">
                {/* Tactical Cyber Grid Background */}
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage:
                      'radial-gradient(#38bdf8 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />

                <div className="relative z-10 max-w-md w-full space-y-3.5">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-[11px] font-medium text-[#38bdf8]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse"></span>
                    Footage Ready
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-white font-['Inter'] tracking-tight">
                      Incident Footage Ready
                    </h2>
                    <p className="text-xs text-[#8B919D] font-['Inter']">
                      Selected: <strong className="text-white">#{activeAlert.id} - {activeAlert.title}</strong> at {formatTime(activeAlert.timeSec)}
                    </p>
                  </div>

                  {/* Incident Snapshot Preview Card */}
                  <div className="bg-[#12161F] border border-[#30363D] rounded-xl p-3 text-left space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#8B919D]">Vehicle: Bus 01</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${activeAlert.badgeColor}`}>
                        {activeAlert.severity}
                      </span>
                    </div>
                    <div className="flex gap-3 items-center">
                      {activeAlert.evidenceUrl && (
                        <img
                          src={getEvidenceUrl(activeAlert.evidenceUrl)!}
                          alt="Defect crop"
                          onError={(e) => {
                            e.currentTarget.src = '/evidence/pothole_01.jpg';
                          }}
                          className="w-28 h-16 object-cover rounded-lg border border-[#30363D] bg-black"
                        />
                      )}
                      <div className="text-[11px] text-[#8B919D] space-y-0.5">
                        <div>GPS: {activeAlert.lat.toFixed(4)}° N, {activeAlert.lon.toFixed(4)}° E</div>
                        <div>Time: 18:25:32</div>
                        <div className="text-[#38bdf8]">Location: NH-30 Highway</div>
                      </div>
                    </div>
                  </div>

                  {/* Primary Pull Action */}
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      onClick={() => executeBufferExtraction(activeAlert, bufferPreset)}
                      className="w-full py-2.5 px-4 bg-[#38bdf8] hover:bg-[#58a6ff] text-[#00315c] font-['Inter'] text-xs font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">play_circle</span>
                      <span>Play {bufferPreset === 'full' ? 'Full Video' : `${bufferPreset.toUpperCase()} Clip`}</span>
                    </button>
                    <button
                      onClick={() => {
                        setBufferPreset('full');
                        executeBufferExtraction(activeAlert, 'full');
                      }}
                      className="text-xs text-[#8B919D] hover:text-white transition-colors cursor-pointer py-0.5"
                    >
                      Or play full video (15:22) →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STATE B: Loading Animation */}
            {bufferState === 'extracting' && (
              <div className="absolute inset-0 bg-[#070A0F] flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="max-w-md w-full space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-[#38bdf8]/15 border border-[#38bdf8]/40 flex items-center justify-center mx-auto text-[#38bdf8]">
                    <span className="material-symbols-outlined text-[28px] animate-spin">sync</span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white tracking-wide">
                      Loading Video Clip
                    </h3>
                    <p className="text-xs text-[#8B919D]">
                      Fetching synchronized footage from vehicle...
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-[#161B22] border border-[#30363D] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#38bdf8] h-full transition-all duration-300 ease-out"
                      style={{ width: `${extractionProgress}%` }}
                    />
                  </div>

                  {/* Clean Console Log */}
                  <div className="p-3 bg-[#0A0D13] border border-[#2B323D] rounded-xl text-left font-['JetBrains_Mono'] text-[11px] space-y-1 text-[#8B919D] max-h-28 overflow-y-auto">
                    {extractionLog.map((line, idx) => (
                      <div key={idx} className="text-emerald-400">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STATE C: Real Video Player (Visible when ready) */}
            <video
              ref={videoRef}
              src="/videos/real_bus_drive.mp4"
              className={`w-full h-full object-contain ${bufferState === 'ready' && !videoLoadError ? 'block' : 'hidden'}`}
              muted={isMuted}
              playsInline
              onError={() => {
                setVideoLoadError(true);
              }}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  setDuration(videoRef.current.duration || 922);
                }
              }}
              onEnded={() => setIsPlaying(false)}
            />

            {/* Simulated Edge Telemetry Viewfinder if raw video is offline (e.g. cloud deployments) */}
            {bufferState === 'ready' && videoLoadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070A0F] p-6 text-center select-none overflow-hidden">
                {/* Cyber Grid */}
                <div
                  className="absolute inset-0 opacity-10 pointer-events-none"
                  style={{
                    backgroundImage:
                      'radial-gradient(#38bdf8 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />

                <div className="relative z-10 max-w-lg w-full flex flex-col items-center space-y-3">
                  {activeAlert.evidenceUrl && (
                    <div className="relative rounded-xl overflow-hidden border border-[#30363D] shadow-2xl max-w-sm w-full aspect-video bg-black flex items-center justify-center">
                      <img
                        src={getEvidenceUrl(activeAlert.evidenceUrl)!}
                        alt="Defect crop"
                        onError={(e) => {
                          e.currentTarget.src = '/evidence/pothole_01.jpg';
                        }}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2 bg-black/80 px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] text-[#38bdf8] border border-[#38bdf8]/40">
                        Evidence #{activeAlert.id}
                      </div>
                      <div className="absolute bottom-2 right-2 bg-red-950/90 text-red-300 px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] border border-red-500/50">
                        {activeAlert.category}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-xs font-['Inter']">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                      Preview Mode
                    </div>
                    <p className="text-xs text-[#8B919D] font-['Inter']">
                      Video file offline. Map synchronization, vehicle telemetry, and Gemini AI audits remain fully functional.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Burned-in OSD Telemetry HUD (Active during playback) */}
            {bufferState === 'ready' && (
              <>
                <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/85 to-transparent flex justify-between items-start pointer-events-none z-20 font-['JetBrains_Mono'] text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    <span className="text-white font-medium bg-black/60 px-2 py-0.5 rounded border border-white/20">
                      Bus 01 · 1080p
                    </span>
                    <span className="text-[#38bdf8] bg-black/60 px-2 py-0.5 rounded border border-[#38bdf8]/40">
                      {dynamicSpeed} km/h
                    </span>
                  </div>
                  <div className="bg-black/60 px-2 py-0.5 rounded border border-white/20 text-[#8B919D] flex items-center gap-1.5 whitespace-nowrap">
                    <span className="text-[#38bdf8] font-medium">
                      Clip:
                    </span>
                    <span className="text-white tabular-nums">
                      {formatTime(sliceCurrentTime)} / {formatTime(sliceConfig.sliceDuration)}
                    </span>
                  </div>
                </div>

                {/* Reticle Overlay (Appears during defect impact) */}
                {showBboxOverlay && isNearIncident && activeAlert && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-pulse">
                    <div className="border-2 border-red-500 bg-red-500/15 rounded-lg p-5 shadow-[0_0_50px_rgba(239,68,68,0.6)] flex flex-col items-center backdrop-blur-[1px]">
                      <div className="flex items-center gap-2 bg-red-950/95 border border-red-500 px-3 py-1 rounded text-xs text-red-200 font-semibold mb-1.5">
                        <span className="material-symbols-outlined text-[16px]">warning</span>
                        <span>{activeAlert.title}</span>
                      </div>
                      <div className="text-[10px] text-white/90 bg-black/80 px-2.5 py-0.5 rounded">
                        {Math.round(activeAlert.confidence * 100)}% match · {activeAlert.lat.toFixed(4)}, {activeAlert.lon.toFixed(4)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Bottom OSD Bar */}
                <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/85 to-transparent flex justify-between items-center pointer-events-none z-20 font-['JetBrains_Mono'] text-[9px] text-[#8B919D]">
                  <span>GPS: {currentBusPos[1].toFixed(4)}° N, {currentBusPos[0].toFixed(4)}° E</span>
                  <span className="tabular-nums">Total: {formatTime(currentTime)} / {formatTime(duration)}</span>
                </div>
              </>
            )}
          </div>

          {/* Interactive Timeline Scrubber (Mapped to the Sliced Buffer Window) */}
          <div className="space-y-1.5 mt-2.5 p-2.5 bg-[#0E121A] border border-[#30363D] rounded-xl">
            {/* Scrubber Track with Impact Pins */}
            <div className="relative w-full h-7 flex items-center">
              {/* Defect Impact Pin on Scrubber */}
              {bufferPreset !== 'full' ? (
                // Sliced Mode: Pin is centered at relative impact offset
                <div
                  className="absolute -top-3 -translate-x-1/2 flex flex-col items-center pointer-events-none z-20"
                  style={{
                    left: `${(sliceConfig.impactRelTime / sliceConfig.sliceDuration) * 100}%`,
                  }}
                >
                  <span className="text-[9px] font-['JetBrains_Mono'] px-1.5 py-0.5 rounded bg-red-600 text-white font-medium whitespace-nowrap shadow-md border border-red-400">
                    Defect at {formatTime(sliceConfig.impactRelTime)}
                  </span>
                  <div className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-white shadow-[0_0_8px_rgba(239,68,68,1)] animate-ping mt-0.5"></div>
                </div>
              ) : (
                // Full Mode: Pins for all incidents along entire route
                incidentList.map((inc) => {
                  const leftPercent = duration > 0 ? (inc.timeSec / duration) * 100 : 0;
                  return (
                    <button
                      key={inc.id}
                      onClick={() => handleSelectIncident(inc)}
                      title={`${inc.title} at ${formatTime(inc.timeSec)}`}
                      className="absolute -top-1 w-3 h-5 -translate-x-1/2 flex flex-col items-center group cursor-pointer z-20"
                      style={{ left: `${leftPercent}%` }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 group-hover:scale-125 transition-transform shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                      <span className="w-[1px] h-2.5 bg-red-400"></span>
                    </button>
                  );
                })
              )}

              {/* Range Input Slider */}
              <input
                type="range"
                min="0"
                max={sliceConfig.sliceDuration || 45}
                step="0.05"
                value={sliceCurrentTime}
                onChange={(e) => handleScrubberChange(parseFloat(e.target.value))}
                disabled={bufferState !== 'ready'}
                className="w-full h-1.5 bg-[#1F2430] rounded-lg appearance-none cursor-pointer accent-[#38bdf8] relative z-10 disabled:opacity-40"
              />
            </div>

            {/* Playback Controls Row (Completely Unwrapped with Tabular-Nums) */}
            <div className="flex items-center justify-between pt-1 gap-2 flex-nowrap">
              {/* Left Group: Controls & Non-wrapping Timestamps */}
              <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <button
                  onClick={togglePlay}
                  disabled={bufferState !== 'ready'}
                  className="w-8 h-8 rounded-lg bg-[#38bdf8] hover:bg-[#58a6ff] text-[#00315c] flex items-center justify-center transition-colors cursor-pointer shadow-md disabled:opacity-40 shrink-0"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {isPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>

                <button
                  onClick={() => handleStepFrame(-1)}
                  disabled={bufferState !== 'ready'}
                  title="Previous Frame (33ms)"
                  className="p-1 rounded-lg border border-[#30363D] hover:bg-[#1C2025] text-[#8B919D] hover:text-white transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">replay_5</span>
                </button>

                <button
                  onClick={() => handleStepFrame(1)}
                  disabled={bufferState !== 'ready'}
                  title="Next Frame (33ms)"
                  className="p-1 rounded-lg border border-[#30363D] hover:bg-[#1C2025] text-[#8B919D] hover:text-white transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">forward_5</span>
                </button>

                {/* Sliced Time Display */}
                <div className="ml-1 flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-xs font-['JetBrains_Mono'] text-white font-bold tabular-nums whitespace-nowrap">
                    {formatTime(sliceCurrentTime)} <span className="text-[#38bdf8]">/</span> {formatTime(sliceConfig.sliceDuration)}
                  </span>
                  <span className="text-[10px] font-['JetBrains_Mono'] text-[#8B919D] bg-[#161B22] px-1.5 py-0.5 rounded border border-[#2B323D] tabular-nums whitespace-nowrap hidden sm:inline-block">
                    Total: {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
              </div>

              {/* Right Group: Speed & Overlay Toggles */}
              <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <div className="flex items-center bg-[#161B22] border border-[#30363D] rounded-lg p-0.5 text-[9px] font-['JetBrains_Mono'] shrink-0">
                  {[0.25, 0.5, 1, 2].map((sp) => (
                    <button
                      key={sp}
                      onClick={() => handleSpeedChange(sp)}
                      className={`px-1.5 py-0.5 rounded cursor-pointer font-bold ${
                        playbackSpeed === sp ? 'bg-[#38bdf8] text-[#00315c]' : 'text-[#8B919D] hover:text-white'
                      }`}
                    >
                      {sp}X
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowBboxOverlay(!showBboxOverlay)}
                  className={`px-2 py-1 text-[10px] font-['JetBrains_Mono'] font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    showBboxOverlay
                      ? 'bg-red-500/15 border-red-500 text-red-400'
                      : 'border-[#30363D] text-[#8B919D]'
                  }`}
                >
                  {showBboxOverlay ? 'Boxes: On' : 'Boxes: Off'}
                </button>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1 rounded-lg border border-[#30363D] text-[#8B919D] hover:text-white cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {isMuted ? 'volume_off' : 'volume_up'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* ========================================================
            ZONE 3: Route Map & Vehicle Status (Right 3 Cols)
           ======================================================== */}
        <aside className="col-span-3 border-l border-[#30363D] bg-[#0A0D13] p-3 flex flex-col justify-between overflow-y-auto space-y-3">
          <div className="space-y-3">
            {/* Route Map (MapLibre Dark Map) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#8B919D] tracking-wide block">
                  Route Map
                </span>
                <button
                  onClick={recenterMapOnBus}
                  title="Recenter on Vehicle"
                  className="text-xs text-[#38bdf8] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">my_location</span>
                  Recenter
                </button>
              </div>

              {/* MapLibre Map Container */}
              <div className="h-48 rounded-xl border border-[#30363D] bg-[#0E121A] relative overflow-hidden shadow-inner">
                <div ref={mapContainerRef} className="w-full h-full" />

                {/* Map Floating HUD Tags */}
                <div className="absolute top-2 left-2 bg-black/85 px-2 py-0.5 rounded border border-white/20 text-[10px] text-[#38bdf8] flex items-center gap-1.5 pointer-events-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                  <span>Bus 01 ({currentBusPos[1].toFixed(4)}°, {currentBusPos[0].toFixed(4)}°)</span>
                </div>

                <div className="absolute bottom-2 left-2 bg-black/80 px-2 py-0.5 rounded border border-white/10 text-[9px] text-[#8B919D] pointer-events-none">
                  NH-30 Highway
                </div>
              </div>
            </div>

            {/* Vehicle Status */}
            <div className="p-2.5 bg-[#12161F] border border-[#30363D] rounded-xl space-y-2">
              <span className="text-xs font-medium text-[#8B919D] tracking-wide block">
                Vehicle Status
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-[#0A0D13] border border-[#2B323D]">
                  <div className="text-[10px] text-[#8B919D]">Speed</div>
                  <div className="text-sm font-semibold text-[#38bdf8]">{dynamicSpeed} km/h</div>
                </div>
                <div className="p-2 rounded-lg bg-[#0A0D13] border border-[#2B323D]">
                  <div className="text-[10px] text-[#8B919D]">Vibration</div>
                  <div className={`text-xs font-semibold ${isNearIncident ? 'text-red-400' : 'text-green-400'}`}>
                    {roughnessIndex}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Defect Card & Photo */}
            {activeAlert && (
              <div className="p-3 bg-[#12161F] border border-[#30363D] rounded-xl space-y-2 text-xs font-['Inter']">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-[#ffb4ab]">
                    Defect #{activeAlert.id}
                  </span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${activeAlert.badgeColor}`}>
                    {activeAlert.severity}
                  </span>
                </div>
                <div className="text-white font-semibold text-xs truncate">
                  {activeAlert.title}
                </div>
                <div className="text-[11px] text-[#8B919D]">
                  Location: {activeAlert.lat.toFixed(4)}° N, {activeAlert.lon.toFixed(4)}° E
                </div>

                {/* Evidence Crop Container */}
                {activeAlert.evidenceUrl && (
                  <div
                    onClick={() => setIsEnlargedImageOpen(true)}
                    className="relative h-32 w-full rounded-xl overflow-hidden border border-[#30363D] hover:border-[#38bdf8] bg-black group shadow-lg cursor-pointer transition-all mt-1"
                  >
                    <img
                      src={getEvidenceUrl(activeAlert.evidenceUrl)!}
                      alt="Crop thumbnail"
                      onError={(e) => {
                        e.currentTarget.src = '/evidence/pothole_01.jpg';
                      }}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />

                    {/* Corner Reticles */}
                    <div className="absolute top-1.5 left-1.5 w-2 h-2 border-t-2 border-l-2 border-[#38bdf8] pointer-events-none"></div>
                    <div className="absolute top-1.5 right-1.5 w-2 h-2 border-t-2 border-r-2 border-[#38bdf8] pointer-events-none"></div>
                    <div className="absolute bottom-1.5 left-1.5 w-2 h-2 border-b-2 border-l-2 border-[#38bdf8] pointer-events-none"></div>
                    <div className="absolute bottom-1.5 right-1.5 w-2 h-2 border-b-2 border-r-2 border-[#38bdf8] pointer-events-none"></div>

                    {/* Top Overlay Badge */}
                    <div className="absolute top-1.5 left-1.5 ml-1 bg-black/85 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/20 text-[9px] text-[#38bdf8]">
                      Camera Crop
                    </div>
                    <div className="absolute top-1.5 right-1.5 mr-1 bg-black/85 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/20 text-[9px] text-white">
                      {Math.round(activeAlert.confidence * 100)}% Match
                    </div>

                    {/* Bottom Action Hover Overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between text-[10px] text-[#C0C7D4] opacity-90 group-hover:opacity-100 transition-opacity">
                      <span>Click to enlarge</span>
                      <span className="material-symbols-outlined text-[14px] text-[#38bdf8]">zoom_in</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="space-y-1.5 pt-2 border-t border-[#30363D]">
            <button
              onClick={() => setIsVlmModalOpen(true)}
              className="w-full py-2.5 px-3 border border-cyan-400/50 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 font-['Inter'] text-xs font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] text-cyan-300">psychology</span>
              <span>Gemini AI Audit</span>
            </button>

            <button
              onClick={() => setIsWorkOrderModalOpen(true)}
              className="w-full py-2.5 px-3 bg-[#38bdf8] hover:bg-[#58a6ff] text-[#00315c] font-['Inter'] text-xs font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">assignment_turned_in</span>
              <span>Create Work Order</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Enlarged Evidence Inspection Modal */}
      {isEnlargedImageOpen && activeAlert && activeAlert.evidenceUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200"
          onClick={() => setIsEnlargedImageOpen(false)}
        >
          <div
            className="bg-[#101419] border border-[#30363D] rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#30363D] pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#38bdf8]">
                  Evidence Photo · #{activeAlert.id}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${activeAlert.badgeColor}`}>
                  {activeAlert.severity}
                </span>
              </div>
              <button
                onClick={() => setIsEnlargedImageOpen(false)}
                className="text-[#8B919D] hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-[#30363D] bg-black max-h-[60vh] flex items-center justify-center">
              <img
                src={getEvidenceUrl(activeAlert.evidenceUrl)!}
                alt="Enlarged defect crop"
                onError={(e) => {
                  e.currentTarget.src = '/evidence/pothole_01.jpg';
                }}
                className="max-h-[55vh] w-auto object-contain"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-[#8B919D] pt-1">
              <span>{activeAlert.title}</span>
              <span className="text-white">GPS: {activeAlert.lat.toFixed(4)}° N, {activeAlert.lon.toFixed(4)}° E</span>
            </div>
          </div>
        </div>
      )}

      {/* Gemini VLM Semantic Inspector Modal */}
      {activeAlert && (
        <VlmAuditModal
          isOpen={isVlmModalOpen}
          onClose={() => setIsVlmModalOpen(false)}
          alertId={activeAlert.id}
          evidenceUrl={activeAlert.evidenceUrl}
          initialType={activeAlert.title}
          lat={activeAlert.lat}
          lon={activeAlert.lon}
        />
      )}

      {/* Municipal PWD Work Order Modal */}
      {activeAlert && (
        <WorkOrderModal
          isOpen={isWorkOrderModalOpen}
          onClose={() => setIsWorkOrderModalOpen(false)}
          data={{
            ticketId: `PWD-RAI-2026-${String(activeAlert.id).padStart(4, '0')}`,
            defectType: activeAlert.type,
            severity: activeAlert.severity as any,
            lat: activeAlert.lat,
            lon: activeAlert.lon,
            streetName: 'NH-30 Simga Highway Corridor',
            confidence: activeAlert.confidence,
            evidenceUrl: activeAlert.evidenceUrl,
            videoTimestamp: activeAlert.timeSec,
            trafficWeight: 3.0,
            detectedAt: new Date().toISOString(),
            busId: 'BUS-01',
          }}
          onConfirmDispatch={() => {
            setIsWorkOrderModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default VideoVault;
