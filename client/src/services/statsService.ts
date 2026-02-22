import { api } from './api';
import type { PlayerStats } from '../types';

export const statsService = {
  getPlayerStats: (playerId: number, seasonId?: number) => {
    const qs = seasonId ? `?seasonId=${seasonId}` : '';
    return api.get<PlayerStats>(`/stats/players/${playerId}${qs}`);
  },
  getPlayerGameLog: (playerId: number, seasonId?: number) => {
    const qs = seasonId ? `?seasonId=${seasonId}` : '';
    return api.get<any[]>(`/stats/players/${playerId}/games${qs}`);
  },
  getTeamStats: (teamSeasonId: number) =>
    api.get<any>(`/stats/teams/${teamSeasonId}`),
  getSeasonLeaderboard: (seasonId: number) =>
    api.get<any[]>(`/stats/seasons/${seasonId}/leaderboard`),
};
