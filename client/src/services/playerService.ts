import { api } from './api';
import type { Player } from '../types';

export const playerService = {
  getAll: () => api.get<Player[]>('/players'),
  getAllIncludingInactive: () => api.get<Player[]>('/players?includeInactive=true'),
  getById: (id: number) => api.get<Player>(`/players/${id}`),
  create: (data: { FirstName: string; LastName: string; Nickname?: string; ImageData?: string; ThemeColor?: string }) =>
    api.post<Player>('/players', data),
  update: (id: number, data: Partial<Player>) =>
    api.put<Player>(`/players/${id}`, data),
  delete: (id: number) => api.delete(`/players/${id}`),
  reactivate: (id: number) => api.put(`/players/${id}/reactivate`, {}),
};
