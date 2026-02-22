import { api } from './api';
import type { Match } from '../types';

export const matchService = {
  getLive: () => api.get<any[]>('/matches/live'),
  getBySeason: (seasonId: number) => api.get<Match[]>(`/matches?seasonId=${seasonId}`),
  getById: (id: number) => api.get<Match>(`/matches/${id}`),
  updateStatus: (id: number, status: string, winnerTeamSeasonId?: number) =>
    api.put<Match>(`/matches/${id}/status`, { Status: status, WinnerTeamSeasonID: winnerTeamSeasonId }),
  coinToss: (id: number) => api.post<{ result: string }>(`/matches/${id}/coin-toss`, {}),
  setCoinTossWinner: (id: number, teamSeasonId: number) =>
    api.post(`/matches/${id}/coin-toss-winner`, { TeamSeasonID: teamSeasonId }),
};
