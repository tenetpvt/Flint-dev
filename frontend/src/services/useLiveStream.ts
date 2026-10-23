import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Alert } from './alerts';
import type { Route } from './routes';
import type { Journey } from './journeys';
import type { AnalyticsSummary } from './analytics';
import { MOCK_ROUTES } from './mockData';

export interface LiveTelemetryEvent {
  type: string;
  data?: any;
  coordinates?: [number, number];
  bus?: string;
  route?: string;
  step?: number;
  total_steps?: number;
  timestamp?: string;
}

export function useLiveStream() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastTelemetry, setLastTelemetry] = useState<LiveTelemetryEvent | null>(null);
  const [latestDetection, setLatestDetection] = useState<any | null>(null);
  const [activeSurveyRoute, setActiveSurveyRoute] = useState<any | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const isRemote = typeof window !== 'undefined' && (
      window.location.protocol === 'https:' ||
      (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    );
    let rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
    const hasRemoteBackend = Boolean(rawApiUrl && !rawApiUrl.includes('localhost') && !rawApiUrl.includes('127.0.0.1'));

    // In remote standalone deployment (Vercel) without external backend, run client-side simulation ticker
    if (isRemote && !hasRemoteBackend) {
      setIsConnected(true);
      let step = 0;
      let rawCoords: [number, number][] = [];
      try {
        const raw = MOCK_ROUTES[0]?.geojson_path;
        rawCoords = raw ? JSON.parse(raw) : [];
      } catch {
        rawCoords = [];
      }

      const ticker = setInterval(() => {
        if (!rawCoords || rawCoords.length === 0) return;
        step = (step + 1) % rawCoords.length;
        const coords = rawCoords[step];
        const payload: LiveTelemetryEvent = {
          type: 'BUS_TELEMETRY',
          bus: 'BUS-01',
          route: 'NH-30 Raipur-Simga',
          coordinates: coords,
          step,
          total_steps: rawCoords.length,
          timestamp: new Date().toISOString(),
        };
        setLastTelemetry(payload);
        window.dispatchEvent(new CustomEvent('flint:bus-telemetry', { detail: payload }));
      }, 2500);

      return () => clearInterval(ticker);
    }

    const effectiveApiUrl = (rawApiUrl || 'http://localhost:8000').replace(/\/+$/, '');
    const streamUrl = effectiveApiUrl.endsWith('/api')
      ? `${effectiveApiUrl}/simulation/stream`
      : `${effectiveApiUrl}/api/simulation/stream`;

    let retryTimeout: any;

    function connect() {
      try {
        const es = new EventSource(streamUrl);
        eventSourceRef.current = es;

        es.onopen = () => {
          setIsConnected(true);
        };

        es.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);

            if (payload.type === 'CONNECTION_ESTABLISHED') {
              setIsConnected(true);
            } else if (payload.type === 'BUS_TELEMETRY') {
              setLastTelemetry(payload);
              // Dispatch custom DOM event for active MapLibre instance to smoothly move bus marker
              window.dispatchEvent(new CustomEvent('flint:bus-telemetry', { detail: payload }));
            } else if (payload.type === 'NEW_DETECTION') {
              const det = payload.data;
              setLatestDetection(det);

              // Update React Query cache for journeys so map and tables update instantly
              queryClient.setQueryData(['journeys'], (oldJourneys: Journey[] | undefined) => {
                if (!oldJourneys) return oldJourneys;
                return oldJourneys.map((j) => {
                  if (j.id === det.journey_id || j.route.name === 'R3') {
                    const exists = j.detections.some((d) => d.id === det.id);
                    if (!exists) {
                      return { ...j, detections: [det, ...j.detections] };
                    }
                  }
                  return j;
                });
              });

              // Increment findings in Analytics Summary
              queryClient.setQueryData(['analytics-summary'], (old: AnalyticsSummary | undefined) => {
                if (!old) return old;
                return { ...old, total_findings: old.total_findings + 1 };
              });

              // Dispatch custom DOM event for immediate map marker drop
              window.dispatchEvent(new CustomEvent('flint:new-detection', { detail: det }));
            } else if (payload.type === 'NEW_ALERT') {
              const alert = payload.data;

              // Prepend to alerts cache
              queryClient.setQueryData(['alerts'], (oldAlerts: Alert[] | undefined) => {
                if (!oldAlerts) return [alert];
                const exists = oldAlerts.some((a) => a.id === alert.id);
                return exists ? oldAlerts : [alert, ...oldAlerts];
              });

              // Increment live alerts in Analytics Summary
              queryClient.setQueryData(['analytics-summary'], (old: AnalyticsSummary | undefined) => {
                if (!old) return old;
                return { ...old, live_alerts: old.live_alerts + 1 };
              });

              window.dispatchEvent(new CustomEvent('flint:new-alert', { detail: alert }));
            } else if (payload.type === 'NEW_SURVEY_ROUTE') {
              const routeData = payload.data;
              setActiveSurveyRoute(routeData);

              // Add to routes cache
              queryClient.setQueryData(['routes'], (oldRoutes: Route[] | undefined) => {
                if (!oldRoutes) return [routeData];
                const exists = oldRoutes.some((r) => r.id === routeData.id || r.name === routeData.name);
                return exists ? oldRoutes.map((r) => r.name === routeData.name ? routeData : r) : [...oldRoutes, routeData];
              });

              window.dispatchEvent(new CustomEvent('flint:new-survey-route', { detail: routeData }));
            }
          } catch {
            // Ignore malformed ping lines
          }
        };

        es.onerror = () => {
          setIsConnected(false);
          es.close();
          // Attempt retry in 4s
          retryTimeout = setTimeout(connect, 4000);
        };
      } catch {
        setIsConnected(false);
      }
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [queryClient]);

  return { isConnected, lastTelemetry, latestDetection, activeSurveyRoute };
}
