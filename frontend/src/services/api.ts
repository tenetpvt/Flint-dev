import axios from 'axios';
import {
  MOCK_BUSES,
  MOCK_ROUTES,
  MOCK_JOURNEYS,
  MOCK_ALERTS,
  MOCK_ANALYTICS_SUMMARY,
  MOCK_CORRIDORS,
  MOCK_DISTRIBUTION,
  MOCK_TIMELINE,
  MOCK_HEALTH,
  MOCK_COST_SUMMARY,
  MOCK_BOQ_ITEMS,
  MOCK_UNIT_RATES,
} from './mockData';

let rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
// In local dev without explicit remote env var, default to '/api' so Vite proxy routes to 127.0.0.1:8000
const baseURL = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl.replace(/\/+$/, '') : `${rawApiUrl.replace(/\/+$/, '')}/api`)
  : '/api';

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000, // Standard endpoints 15s
});

// Standalone Demo Fallback Router using exact data from backend/seeder.py & backend/database.py
function getMockResponse(url: string = '', method: string = 'get') {
  const cleanUrl = url.replace(/^.*?\/api\/?/, '/').split('?')[0];

  if (cleanUrl.includes('/buses')) {
    return MOCK_BUSES;
  }
  if (cleanUrl.includes('/routes')) {
    return MOCK_ROUTES;
  }
  if (cleanUrl.includes('/journeys')) {
    return MOCK_JOURNEYS;
  }
  if (cleanUrl.includes('/alerts')) {
    if (method.toLowerCase() === 'post') {
      const match = cleanUrl.match(/\/alerts\/(\d+)\/status/);
      if (match) {
        const id = parseInt(match[1]);
        const alert = MOCK_ALERTS.find((a: any) => a.id === id);
        if (alert) {
          const statusMatch = url.match(/status=([A-Z]+)/);
          const newStatus = statusMatch ? statusMatch[1] : 'ACKNOWLEDGED';
          alert.status = newStatus;
          alert.events = alert.events || [];
          alert.events.push({
            id: Date.now(),
            alert_id: id,
            status: newStatus,
            timestamp: new Date().toISOString(),
            note: `Status updated to ${newStatus} (Demo Mode)`,
          });
          return alert;
        }
      }
    }
    return MOCK_ALERTS;
  }
  if (cleanUrl.includes('/analytics/summary')) {
    return MOCK_ANALYTICS_SUMMARY;
  }
  if (cleanUrl.includes('/analytics/corridors')) {
    return MOCK_CORRIDORS;
  }
  if (cleanUrl.includes('/analytics/distribution')) {
    return MOCK_DISTRIBUTION;
  }
  if (cleanUrl.includes('/analytics/activity-timeline')) {
    return MOCK_TIMELINE;
  }
  if (cleanUrl.includes('/health')) {
    return MOCK_HEALTH;
  }
  if (cleanUrl.includes('/cost/summary')) {
    return MOCK_COST_SUMMARY;
  }
  if (cleanUrl.includes('/cost/boq')) {
    return MOCK_BOQ_ITEMS;
  }
  if (cleanUrl.includes('/cost/rates')) {
    return MOCK_UNIT_RATES;
  }

  // Never mock full visual analysis VLM endpoints — always allow live Google Gemini cloud calls to complete!
  if (cleanUrl.includes('/vlm/info')) {
    return {
      provider: 'gemini',
      active_model: 'gemini-1.5-flash',
      has_api_key: true,
      supported_cloud_models: ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
      future_private_vlm_target: 'qwen2.5vl:3b',
    };
  }
  if (cleanUrl.includes('/vlm')) {
    return null;
  }

  return null;
}

// Request interceptor: If running in production (e.g. Vercel over HTTPS) without an explicit remote backend,
// intercept immediately with zero latency rather than making doomed requests that return index.html.
api.interceptors.request.use((config) => {
  // Multimodal visual analysis over Google Cloud takes 5-15s
  if (config.url?.includes('/vlm')) {
    config.timeout = 60000; // 60s timeout for VLM calls
  }

  const isRemote = typeof window !== 'undefined' && (
    window.location.protocol === 'https:' ||
    (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  );
  const hasRemoteBackend = Boolean(rawApiUrl && !rawApiUrl.includes('localhost') && !rawApiUrl.includes('127.0.0.1'));

  // In remote standalone deployment (e.g. Vercel) without remote backend, serve mock data directly
  if (isRemote && !hasRemoteBackend) {
    const mockData = getMockResponse(config.url || '', config.method || 'get');
    if (mockData !== null) {
      config.adapter = async () => ({
        data: mockData,
        status: 200,
        statusText: 'OK (Standalone Production)',
        headers: {},
        config,
      });
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Vercel SPA rewrite fallback protection: if Vercel returned HTML index page instead of JSON API response
    if (typeof response.data === 'string' && (response.data.includes('<!DOCTYPE') || response.data.includes('<html') || response.data.includes('<head>'))) {
      const url = response.config?.url || '';
      const method = response.config?.method || 'get';
      const mockData = getMockResponse(url, method);
      if (mockData !== null) {
        console.warn(`[FLINT Demo Mode] Received HTML from SPA fallback for ${url}. Serving standalone data.`);
        return {
          ...response,
          data: mockData,
        };
      }
    }
    return response;
  },
  (error) => {
    const url = error.config?.url || '';
    const method = error.config?.method || 'get';
    const mockData = getMockResponse(url, method);

    if (mockData !== null) {
      console.warn(`[FLINT Demo Mode] Backend unreachable for ${url}. Serving standalone data from backend/seeder.py.`);
      return Promise.resolve({
        data: mockData,
        status: 200,
        statusText: 'OK (Demo Fallback)',
        headers: {},
        config: error.config,
      });
    }

    return Promise.reject(error);
  }
);

export default api;
