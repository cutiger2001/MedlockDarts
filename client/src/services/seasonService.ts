import { api } from './api';
import type { Season, TeamSeason, SeasonGameFormat } from '../types';

export const seasonService = {
  getAll: () => api.get<Season[]>('/seasons'),
  getById: (id: number) => api.get<Season>(`/seasons/${id}`),
  create: (data: { SeasonName: string; StartDate?: string; EndDate?: string }, setupPassword?: string) =>
    api.post<Season>('/seasons', { ...data, setupPassword }),
  update: (id: number, data: Partial<Season>, setupPassword?: string) =>
    api.put<Season>(`/seasons/${id}`, { ...data, setupPassword }),
  deleteSeason: (id: number, setupPassword?: string) =>
    api.delete<{ success: boolean }>(`/seasons/${id}`, { setupPassword }),
  getTeamSeasons: (seasonId: number) => api.get<TeamSeason[]>(`/seasons/${seasonId}/teams`),
  addTeamToSeason: (seasonId: number, teamId: number, setupPassword?: string) =>
    api.post<TeamSeason>(`/seasons/${seasonId}/teams`, { TeamID: teamId, setupPassword }),
  removeTeamFromSeason: (seasonId: number, teamId: number, setupPassword?: string) =>
    api.delete(`/seasons/${seasonId}/teams/${teamId}`, { setupPassword }),
  updateTeamSeason: (seasonId: number, teamSeasonId: number, data: { TeamColor?: string; TeamNickname?: string }, setupPassword?: string) =>
    api.put<TeamSeason>(`/seasons/${seasonId}/teams/${teamSeasonId}`, { ...data, setupPassword }),
  generateSchedule: (seasonId: number, setupPassword?: string) =>
    api.post<{ matchesCreated: number }>(`/seasons/${seasonId}/schedule`, { setupPassword }),
  createMakeUpRound: (
    seasonId: number,
    data: { MatchDate?: string },
    setupPassword?: string,
  ) => api.post(`/seasons/${seasonId}/make-up-round`, { ...data, setupPassword }),
  updateScheduleDates: (
    seasonId: number,
    matchIds: number[],
    matchDate: string,
    setupPassword?: string,
  ) => api.put<{ updated: number }>(`/seasons/${seasonId}/schedule-dates`, {
    MatchIDs: matchIds,
    MatchDate: matchDate,
    setupPassword,
  }),
  generatePlayoffs: (seasonId: number, setupPassword?: string) =>
    api.post<{ success: boolean }>(`/seasons/${seasonId}/playoffs`, { setupPassword }),

  // Game format configuration
  getGameFormats: (seasonId: number) =>
    api.get<SeasonGameFormat[]>(`/seasons/${seasonId}/game-formats`),
  setGameFormats: (seasonId: number, formats: Omit<SeasonGameFormat, 'SeasonGameFormatID' | 'SeasonID'>[], setupPassword?: string) =>
    api.put<SeasonGameFormat[]>(`/seasons/${seasonId}/game-formats`, { formats, setupPassword }),
};
