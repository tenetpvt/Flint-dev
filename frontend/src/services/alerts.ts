import api from './api';

export interface AlertEvent {
  id: number;
  alert_id: number;
  status: string;
  timestamp: string;
  note: string | null;
}

export interface AlertDetection {
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

export interface Alert {
  id: number;
  detection_id: number;
  title: string;
  type: string;
  severity: string;
  status: string;
  timestamp: string;
  events: AlertEvent[];
  detection: AlertDetection;
}

export const fetchAlerts = () => api.get<Alert[]>('/alerts').then(r => r.data);
export const updateAlertStatus = (id: number, status: string) =>
  api.post<Alert>(`/alerts/${id}/status?status=${status}`).then(r => r.data);
