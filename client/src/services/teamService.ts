import { api } from './api';
import type { Team } from '../types';

export const teamService = {
  getAll: () => api.get<Team[]>('/teams'),
  getById: (id: number) => api.get<Team>(`/teams/${id}`),
  create: (data: { TeamName: string; Player1ID: number; Player2ID: number }) =>
    api.post<Team>('/teams', data),
  update: (id: number, data: Partial<Team>) =>
    api.put<Team>(`/teams/${id}`, data),
  delete: (id: number) => api.delete(`/teams/${id}`),
};
