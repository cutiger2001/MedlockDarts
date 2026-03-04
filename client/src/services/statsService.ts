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
  getPlayerSeasonHistory: (playerId: number) =>
    api.get<any[]>(`/stats/players/${playerId}/season-history`),
  getTeamStats: (teamSeasonId: number) =>
    api.get<any>(`/stats/teams/${teamSeasonId}`),
  getSeasonLeaderboard: (seasonId: number) =>
    api.get<any[]>(`/stats/seasons/${seasonId}/leaderboard`),
  getSeasonTeamLeaderboard: (seasonId: number) =>
    api.get<any[]>(`/stats/seasons/${seasonId}/team-leaderboard`),
  getHighestInScores: (seasonId?: number) => {
    const qs = seasonId ? `?seasonId=${seasonId}` : '';
    return api.get<any[]>(`/stats/records/highest-in${qs}`);
  },
  getHighestOutScores: (seasonId?: number) => {
    const qs = seasonId ? `?seasonId=${seasonId}` : '';
    return api.get<any[]>(`/stats/records/highest-out${qs}`);
  },
  getTopTeamAvg: (target: number, seasonId?: number) => {
    const qs = seasonId ? `?seasonId=${seasonId}` : '';
    return api.get<any[]>(`/stats/records/top-team-avg/${target}${qs}`);
  },
  getTopTeamMPR: (seasonId?: number) => {
    const qs = seasonId ? `?seasonId=${seasonId}` : '';
    return api.get<any[]>(`/stats/records/top-team-mpr${qs}`);
  },
  getTopIndividualAvg: (target: number, seasonId?: number) => {
    const qs = seasonId ? `?seasonId=${seasonId}` : '';
    return api.get<any[]>(`/stats/records/top-individual-avg/${target}${qs}`);
  },
  getTopIndividualMPR: (seasonId?: number) => {
    const qs = seasonId ? `?seasonId=${seasonId}` : '';
    return api.get<any[]>(`/stats/records/top-individual-mpr${qs}`);
  },
  getHallOfFame: () =>
    api.get<any>('/stats/hall-of-fame'),
};
