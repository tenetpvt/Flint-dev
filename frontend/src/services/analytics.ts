import api from './api';

export interface AnalyticsSummary {
  active_buses: number;
  completed_routes: number;
  total_findings: number;
  reports_pending: number;
  live_alerts: number;
  high_severity_findings?: number;
  detections_today?: number;
}

export interface CorridorAnalytics {
  route_id: number;
  name: string;
  description: string;
  distance_km: number;
  total_findings: number;
  defects: number;
  traffic: number;
  safety: number;
  critical_findings: number;
  defect_density_per_km: number;
  severity_label: 'HIGH' | 'MEDIUM' | 'LOW';
  journeys_count: number;
}

export interface CategoryDistribution {
  category: string;
  key: string;
  count: number;
  percentage: number;
  color: string;
}

export interface ActivityTimeSlot {
  time: string;
  findings: number;
  reports: number;
}

export const fetchAnalyticsSummary = () =>
  api.get<AnalyticsSummary>('/analytics/summary').then(r => r.data);

export const fetchCorridorAnalytics = () =>
  api.get<CorridorAnalytics[]>('/analytics/corridors').then(r => r.data);

export const fetchCategoryDistribution = () =>
  api.get<CategoryDistribution[]>('/analytics/distribution').then(r => r.data);

export const fetchActivityTimeline = () =>
  api.get<ActivityTimeSlot[]>('/analytics/activity-timeline').then(r => r.data);
