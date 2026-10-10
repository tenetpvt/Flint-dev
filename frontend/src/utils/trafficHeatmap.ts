/**
 * Google Maps-Style Traffic Density Calculator for Road Potholes
 * 
 * Segments route GPS polyline and computes spatial defect density
 * within a 50–70m radius window (default 60m), color-coding the highway:
 * - Green (#22c55e): Smooth road, 0 potholes
 * - Orange (#f97316): Caution, 1 pothole
 * - Bright Red (#ef4444): Heavy defect cluster, 2–3 potholes
 * - Dark Burgundy (#7f1d1d): Critical hazard zone, 4+ potholes
 */

export interface TrafficSegment {
  id: string;
  coordinates: [number, number][];
  color: string;
  potholeCount: number;
  statusLabel: 'CLEAR' | 'CAUTION' | 'SEVERE' | 'CRITICAL';
}

/**
 * Calculates geographic distance in meters between two [lon, lat] coordinates
 */
export function haversineMeters(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const TRAFFIC_COLORS = {
  CLEAR: '#22c55e',       // Google road green
  CAUTION: '#f97316',     // Google traffic amber/orange
  SEVERE: '#ef4444',      // Google traffic red
  CRITICAL: '#7f1d1d',    // Google dark burgundy / maroon
};

export function getTrafficColorAndLabel(potholeCount: number): { color: string; label: TrafficSegment['statusLabel'] } {
  if (potholeCount === 0) {
    return { color: TRAFFIC_COLORS.CLEAR, label: 'CLEAR' };
  }
  if (potholeCount === 1) {
    return { color: TRAFFIC_COLORS.CAUTION, label: 'CAUTION' };
  }
  if (potholeCount <= 3) {
    return { color: TRAFFIC_COLORS.SEVERE, label: 'SEVERE' };
  }
  return { color: TRAFFIC_COLORS.CRITICAL, label: 'CRITICAL' };
}

/**
 * Converts a route path into continuous colored road segments like Google Maps Live Traffic.
 */
export function computePotholeTrafficSegments(
  coords: [number, number][],
  detections: { lat: number; lon: number; type?: string }[],
  radiusMeters = 60
): TrafficSegment[] {
  if (!coords || coords.length < 2) return [];

  // Filter for road defects / potholes
  const potholes = (detections || []).filter(
    d => !d.type || d.type === 'ROAD_DEFECT' || d.type === 'ROAD_BLOCKAGE'
  );

  const rawSegments: { p1: [number, number]; p2: [number, number]; count: number; color: string; label: TrafficSegment['statusLabel'] }[] = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const m_lon = (p1[0] + p2[0]) / 2;
    const m_lat = (p1[1] + p2[1]) / 2;

    // Count potholes within the 50-70m radius
    let count = 0;
    for (let j = 0; j < potholes.length; j++) {
      const dist = haversineMeters(m_lon, m_lat, potholes[j].lon, potholes[j].lat);
      if (dist <= radiusMeters) {
        count++;
      }
    }

    const { color, label } = getTrafficColorAndLabel(count);
    rawSegments.push({ p1, p2, count, color, label });
  }

  // Merge consecutive segments of the same color into smooth continuous paths
  const merged: TrafficSegment[] = [];
  let currColor = '';
  let currLabel: TrafficSegment['statusLabel'] = 'CLEAR';
  let currPoints: [number, number][] = [];
  let maxCount = 0;
  let segIndex = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    if (seg.color !== currColor) {
      if (currPoints.length > 0) {
        merged.push({
          id: `traffic-seg-${segIndex++}`,
          coordinates: currPoints,
          color: currColor,
          potholeCount: maxCount,
          statusLabel: currLabel,
        });
      }
      currColor = seg.color;
      currLabel = seg.label;
      currPoints = [seg.p1, seg.p2];
      maxCount = seg.count;
    } else {
      currPoints.push(seg.p2);
      if (seg.count > maxCount) {
        maxCount = seg.count;
      }
    }
  }

  if (currPoints.length > 0) {
    merged.push({
      id: `traffic-seg-${segIndex++}`,
      coordinates: currPoints,
      color: currColor,
      potholeCount: maxCount,
      statusLabel: currLabel,
    });
  }

  return merged;
}
