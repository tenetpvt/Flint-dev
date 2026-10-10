import api from './api';

export interface Route {
  id: number;
  name: string;
  description: string;
  distance_km: number;
  geojson_path: string;
}

export const fetchRoutes = () => api.get<Route[]>('/routes').then(r => r.data);
