import api from './api';

export interface Detection {
  id: number;
  journey_id: number;
  type: string;
  confidence: number;
  lat: number;
  lon: number;
  severity: string;
  evidence_url: string | null;
  video_timestamp_sec?: number | null;
  timestamp: string;
  estimated_area_sq_m?: number | null;
  severity_tier?: string | null;
  repair_method?: string | null;
  estimated_cost?: number | null;
}

export interface Journey {
  id: number;
  bus_id: number;
  route_id: number;
  status: string;
  start_time: string;
  end_time: string | null;
  bus: { id: number; name: string; status: string; last_lat: number | null; last_lon: number | null; last_seen: string };
  route: { id: number; name: string; description: string; distance_km: number; geojson_path: string };
  detections: Detection[];
}

export const fetchJourneys = () => api.get<Journey[]>('/journeys').then(r => r.data);
