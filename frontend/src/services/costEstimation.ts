import api from './api';

export interface CostSeverityBreakdown {
  severity: string;
  label: string;
  count: number;
  cost: number;
  color: string;
}

export interface CostMethodBreakdown {
  method: string;
  count: number;
  cost: number;
  color: string;
}

export interface UnitRatesConfig {
  cold_mix_rate_sq_m: number;
  hot_mix_rate_sq_m: number;
  full_depth_rate_sq_m: number;
  mobilization_overhead: number;
}

export interface CostEstimationSummary {
  route_id?: number | null;
  route_name: string;
  total_estimated_cost: number;
  total_defects: number;
  critical_backlog_cost: number;
  estimated_asphalt_metric_tons: number;
  estimated_cold_mix_bags: number;
  cost_by_severity: CostSeverityBreakdown[];
  cost_by_repair_method: CostMethodBreakdown[];
  active_unit_rates: UnitRatesConfig;
}

export interface BOQItem {
  id: number;
  journey_id: number;
  route_id?: number | null;
  route_name: string;
  route_description: string;
  chainage_km: number;
  location_label: string;
  lat: number;
  lon: number;
  type: string;
  confidence: number;
  severity: string;
  severity_tier: string;
  estimated_area_sq_m: number;
  repair_method: string;
  estimated_cost: number;
  evidence_url: string | null;
  timestamp: string;
  video_timestamp_sec?: number | null;
}

export const fetchCostSummary = (routeId?: number | null): Promise<CostEstimationSummary> => {
  const params = routeId && routeId > 0 ? `?route_id=${routeId}` : '';
  return api.get<CostEstimationSummary>(`/cost/summary${params}`).then((r) => r.data);
};

export const fetchBOQ = (routeId?: number | null): Promise<BOQItem[]> => {
  const params = routeId && routeId > 0 ? `?route_id=${routeId}` : '';
  return api.get<BOQItem[]>(`/cost/boq${params}`).then((r) => r.data);
};

export const fetchUnitRates = (): Promise<UnitRatesConfig> => {
  return api.get<UnitRatesConfig>('/cost/rates').then((r) => r.data);
};

export const updateUnitRates = (rates: UnitRatesConfig): Promise<UnitRatesConfig> => {
  return api.post<UnitRatesConfig>('/cost/rates', rates).then((r) => r.data);
};

export const resetUnitRates = (): Promise<UnitRatesConfig> => {
  return api.post<UnitRatesConfig>('/cost/rates/reset').then((r) => r.data);
};

export const downloadWorkOrderCSV = (routeId?: number | null, fallbackItems?: BOQItem[]): void => {
  const filename = `FLINT_Work_Order_Route_${routeId || 'All'}_${new Date().toISOString().slice(0, 10)}.csv`;

  // Direct server export attempt
  const endpoint = `${api.defaults.baseURL}/cost/export-csv${routeId ? `?route_id=${routeId}` : ''}`;
  
  // Create client-side export fallback if offline/standalone
  if (fallbackItems && fallbackItems.length > 0) {
    const rows = [
      ['FLINT MUNICIPAL REPAIR WORK ORDER - BILL OF QUANTITIES (BOQ)'],
      ['DATE GENERATED', new Date().toLocaleString()],
      ['TOTAL DEFECTS LISTED', fallbackItems.length],
      [],
      [
        'Item #',
        'Defect ID',
        'Route Name',
        'Location / Chainage',
        'Latitude',
        'Longitude',
        'Hazard Type',
        'Confidence',
        'Severity Tier',
        'Estimated Area (sq.m)',
        'Recommended Technique',
        'Estimated Cost (INR)',
        'Evidence Path',
        'Timestamp'
      ]
    ];

    fallbackItems.forEach((item, idx) => {
      rows.push([
        idx + 1,
        `DEF-${String(item.id).padStart(4, '0')}`,
        item.route_name,
        item.location_label,
        item.lat.toFixed(6),
        item.lon.toFixed(6),
        item.type,
        `${(item.confidence * 100).toFixed(1)}%`,
        item.severity_tier,
        item.estimated_area_sq_m.toFixed(2),
        item.repair_method,
        `Rs. ${item.estimated_cost.toLocaleString('en-IN')}`,
        item.evidence_url || 'N/A',
        item.timestamp
      ]);
    });

    const csvContent = rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  // Otherwise trigger direct anchor download from server
  window.open(endpoint, '_blank');
};
