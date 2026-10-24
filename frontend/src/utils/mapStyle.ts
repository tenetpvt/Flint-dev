import type { Map as MapLibreMap } from 'maplibre-gl';

// Centered directly on the NH-30 Raipur-Simga corridor (coords: [81.6523, 21.1341] to [81.6697, 21.2080])
export const RAIPUR_CENTER: [number, number] = [81.6610, 21.1711];

export type MapTheme = 'default' | 'satellite';

export const DEFAULT_LAYER_ID = 'gmaps-default-layer';
export const SATELLITE_LAYER_ID = 'gmaps-satellite-layer';

// Google Maps style basemap (default road map) with a hidden satellite+labels layer.
// Toggle at runtime with applyMapTheme() instead of setStyle() so overlays survive.
export const MAP_STYLE = {
  version: 8 as const,
  sources: {
    'gmaps-default': {
      type: 'raster' as const,
      tiles: [
        'https://mt0.google.com/vt/lyrs=m&hl=en&scale=2&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=m&hl=en&scale=2&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=m&hl=en&scale=2&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=m&hl=en&scale=2&x={x}&y={y}&z={z}'
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: 'Map data &copy; Google'
    },
    'gmaps-satellite': {
      type: 'raster' as const,
      tiles: [
        'https://mt0.google.com/vt/lyrs=y&hl=en&scale=2&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=y&hl=en&scale=2&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=y&hl=en&scale=2&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=y&hl=en&scale=2&x={x}&y={y}&z={z}'
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: 'Imagery &copy; Google'
    }
  },
  layers: [
    {
      id: DEFAULT_LAYER_ID,
      type: 'raster' as const,
      source: 'gmaps-default',
      layout: { visibility: 'visible' as const }
    },
    {
      id: SATELLITE_LAYER_ID,
      type: 'raster' as const,
      source: 'gmaps-satellite',
      layout: { visibility: 'none' as const }
    }
  ]
};

// Kept for existing imports (LiveMap, VideoVault) - now uses the Google-style basemap.
export const DARK_MAP_STYLE = MAP_STYLE;

export function applyMapTheme(map: MapLibreMap, theme: MapTheme) {
  if (map.getLayer(DEFAULT_LAYER_ID)) {
    map.setLayoutProperty(DEFAULT_LAYER_ID, 'visibility', theme === 'default' ? 'visible' : 'none');
  }
  if (map.getLayer(SATELLITE_LAYER_ID)) {
    map.setLayoutProperty(SATELLITE_LAYER_ID, 'visibility', theme === 'satellite' ? 'visible' : 'none');
  }
}
