// Shared types between server layers

export interface Player {
  PlayerID: number;
  FirstName: string;
  LastName: string;
  Nickname: string | null;
  ImageData: string | null;
  ThemeColor: string | null;
  IsActive: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface CreatePlayerInput {
  FirstName: string;
  LastName: string;
  Nickname?: string;
  ImageData?: string;
  ThemeColor?: string;
}

export interface Season {
  SeasonID: number;
  SeasonName: string;
  StartDate: string | null;
  EndDate: string | null;
  IsActive: boolean;
  Status: 'Setup' | 'RoundRobin' | 'Playoffs' | 'Completed';
  ChampionTeamSeasonID: number | null;
  ChampionTeamName: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface Team {
  TeamID: number;
  TeamName: string;
  Player1ID: number;
  Player2ID: number;
  IsActive: boolean;
  CreatedAt: string;
  UpdatedAt: string;
  // Joined fields
  Player1FirstName?: string;
  Player1LastName?: string;
  Player2FirstName?: string;
  Player2LastName?: string;
}

export interface TeamSeason {
  TeamSeasonID: number;
  TeamID: number;
  SeasonID: number;
  GameWins: number;
  Wins: number;
  Losses: number;
  Draws: number;
  PointsFor: number;
  PointsAgainst: number;
  PlayoffSeed: number | null;
  IsEliminated: boolean;
  TeamColor?: string | null;
  TeamNickname?: string | null;
  // Joined
  TeamName?: string;
  Player1FirstName?: string;
  Player1LastName?: string;
  Player2FirstName?: string;
  Player2LastName?: string;
}

export interface Match {
  MatchID: number;
  SeasonID: number;
  HomeTeamSeasonID: number;
  AwayTeamSeasonID: number;
  RoundNumber: number;
  MatchDate: string | null;
  Status: 'Scheduled' | 'InProgress' | 'Completed';
  WinnerTeamSeasonID: number | null;
  IsPlayoff: boolean;
  PlayoffRound: string | null;
  CoinTossResult: string | null;
  CoinTossWinnerTSID: number | null;
  HomeScore: number;
  AwayScore: number;
  // Joined
  HomeTeamName?: string;
  AwayTeamName?: string;
}

export type GameType = 'X01' | 'Cricket' | 'Shanghai' | 'RoundTheWorld' | 'Killer';

export interface Game {
  GameID: number;
  MatchID: number;
  GameType: GameType;
  GameNumber: number;
  X01Target: number | null;
  DoubleInRequired: boolean;
  RtwMode: string | null;
  RtwSequence: string | null;
  KillerLives: number | null;
  Status: 'NotStarted' | 'InProgress' | 'Completed';
  WinnerTeamSeasonID: number | null;
}

export interface Turn {
  TurnID: number;
  GameID: number;
  PlayerID: number;
  TeamSeasonID: number;
  TurnNumber: number;
  RoundNumber: number;
  DartsThrown: number;
  Score: number;
  RemainingScore: number | null;
  IsDoubleIn: boolean;
  IsGameOut: boolean;
  MarksScored: number | null;
  IsCricketClose: boolean;
  IsShanghaiBonus: boolean;
  RtwTargetHit: boolean;
  Details: string | null;
}

export interface CricketState {
  CricketStateID: number;
  GameID: number;
  TeamSeasonID: number;
  Seg20: number;
  Seg19: number;
  Seg18: number;
  Seg17: number;
  Seg16: number;
  Seg15: number;
  SegBull: number;
  SegTriples: number;
  SegDoubles: number;
  SegThreeInBed: number;
  Points: number;
}

export interface CricketTurn {
  CricketTurnID: number;
  GameID: number;
  PlayerID: number;
  TeamSeasonID: number;
  TurnNumber: number;
  RoundNumber: number;
  DartsThrown: number;
  Seg1: number;
  Seg2: number;
  Seg3: number;
  Seg4: number;
  Seg5: number;
  Seg6: number;
  Seg7: number;
  Seg8: number;
  Seg9: number;
  Seg10: number;
  Seg11: number;
  Seg12: number;
  Seg13: number;
  Seg14: number;
  Seg15: number;
  Seg16: number;
  Seg17: number;
  Seg18: number;
  Seg19: number;
  Seg20: number;
  SegBull: number;
  Points: number;
  MarksScored: number;
  IsCricketClose: boolean;
  IsShanghaiBonus: boolean;
  Details: string | null;
  CreatedAt?: string;
}

export interface PlayerStats {
  PlayerID: number;
  FirstName: string;
  LastName: string;
  TotalGames: number;
  PPD: number;         // Points Per Dart (X01)
  MPR: number;         // Marks Per Round (Cricket)
  InCount: number;
  InAvg: number;
  HighestIn: number;
  OutCount: number;
  OutAvg: number;
  HighestOut: number;
  CloseCount: number;
  AllStarCount: number;
  CricketDarts: number;
  ShanghaiDarts: number;
  X01Darts: number;
}

export interface SeasonGameFormat {
  SeasonGameFormatID: number;
  SeasonID: number;
  GameNumber: number;
  GameType: GameType;
  X01Target: number | null;
  DoubleInRequired: boolean;
}
