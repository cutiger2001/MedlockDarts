import { api } from './api';
import type { Game, Turn, CricketState, CricketTurn, GamePlayer, GameType } from '../types';

export const gameService = {
  getByMatch: (matchId: number) => api.get<Game[]>(`/games/match/${matchId}`),
  getById: (id: number) => api.get<Game>(`/games/${id}`),
  create: (data: {
    MatchID: number;
    GameType: GameType;
    X01Target?: number;
    DoubleInRequired?: boolean;
    RtwMode?: string;
  }) => api.post<Game>('/games', data),
  createAdHoc: (data: {
    GameType: GameType;
    X01Target?: number;
    DoubleInRequired?: boolean;
    RtwMode?: string;
    TeamAPlayers: number[];
    TeamBPlayers: number[];
    TeamPlay: boolean;
  }) => api.post<Game>('/games/ad-hoc', data),
  updateStatus: (id: number, status: string, winnerTeamSeasonId?: number) =>
    api.put<Game>(`/games/${id}/status`, { Status: status, WinnerTeamSeasonID: winnerTeamSeasonId }),
  deleteGame: (id: number) => api.delete(`/games/${id}`),

  // Players
  getPlayers: (gameId: number) => api.get<GamePlayer[]>(`/games/${gameId}/players`),
  addPlayers: (gameId: number, players: { PlayerID: number; TeamSeasonID: number; PlayerOrder: number }[]) =>
    api.post(`/games/${gameId}/players`, { players }),

  // Turns
  getTurns: (gameId: number) => api.get<Turn[]>(`/games/${gameId}/turns`),
  addTurn: (gameId: number, turn: Partial<Turn>) =>
    api.post<Turn>(`/games/${gameId}/turns`, turn),
  undoLastTurn: (gameId: number) =>
    api.delete(`/games/${gameId}/turns/last`),

  // Cricket state
  getCricketState: (gameId: number) => api.get<CricketState[]>(`/games/${gameId}/cricket-state`),
  updateCricketState: (gameId: number, teamSeasonId: number, state: Partial<CricketState>) =>
    api.put<CricketState>(`/games/${gameId}/cricket-state`, { TeamSeasonID: teamSeasonId, ...state }),

  // Cricket turns (Cricket & Shanghai games)
  getCricketTurns: (gameId: number) => api.get<CricketTurn[]>(`/games/${gameId}/cricket-turns`),
  addCricketTurn: (gameId: number, turn: Partial<CricketTurn>) =>
    api.post<CricketTurn>(`/games/${gameId}/cricket-turns`, turn),
  undoLastCricketTurn: (gameId: number) =>
    api.delete(`/games/${gameId}/cricket-turns/last`),
};
