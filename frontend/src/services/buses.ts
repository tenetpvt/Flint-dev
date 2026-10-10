import api from './api';

export interface Bus {
  id: number;
  name: string;
  status: string;
  last_lat: number | null;
  last_lon: number | null;
  last_seen: string;
}

export const fetchBuses = () => api.get<Bus[]>('/buses').then(r => r.data);
