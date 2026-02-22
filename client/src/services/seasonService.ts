import { api } from './api';
import type { Season, TeamSeason, SeasonGameFormat } from '../types';

export const seasonService = {
  getAll: () => api.get<Season[]>('/seasons'),
  getById: (id: number) => api.get<Season>(`/seasons/${id}`),
  create: (data: { SeasonName: string; StartDate?: string; EndDate?: string }) =>
    api.post<Season>('/seasons', data),
  update: (id: number, data: Partial<Season>) =>
    api.put<Season>(`/seasons/${id}`, data),
  getTeamSeasons: (seasonId: number) => api.get<TeamSeason[]>(`/seasons/${seasonId}/teams`),
  addTeamToSeason: (seasonId: number, teamId: number) =>
    api.post<TeamSeason>(`/seasons/${seasonId}/teams`, { TeamID: teamId }),
  removeTeamFromSeason: (seasonId: number, teamId: number) =>
    api.delete(`/seasons/${seasonId}/teams/${teamId}`),
  generateSchedule: (seasonId: number) =>
    api.post<{ matchesCreated: number }>(`/seasons/${seasonId}/schedule`, {}),
  generatePlayoffs: (seasonId: number) =>
    api.post<{ success: boolean }>(`/seasons/${seasonId}/playoffs`, {}),

  // Game format configuration
  getGameFormats: (seasonId: number) =>
    api.get<SeasonGameFormat[]>(`/seasons/${seasonId}/game-formats`),
  setGameFormats: (seasonId: number, formats: Omit<SeasonGameFormat, 'SeasonGameFormatID' | 'SeasonID'>[]) =>
    api.put<SeasonGameFormat[]>(`/seasons/${seasonId}/game-formats`, { formats }),
};
