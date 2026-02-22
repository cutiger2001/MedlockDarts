import { getPool, sql } from '../config/database';
import { Game, Turn, CricketState, CricketTurn } from '../types';

export interface CreateGameInput {
  MatchID: number;
  GameType: string;
  GameNumber?: number;
  X01Target?: number;
  DoubleInRequired?: boolean;
  RtwMode?: string;
}

export interface CreateTurnInput {
  PlayerID: number;
  TeamSeasonID: number;
  TurnNumber: number;
  RoundNumber: number;
  DartsThrown?: number;
  Score?: number;
  RemainingScore?: number;
  IsDoubleIn?: boolean;
  IsGameOut?: boolean;
  MarksScored?: number;
  IsCricketClose?: boolean;
  IsShanghaiBonus?: boolean;
  RtwTargetHit?: boolean;
  Details?: string;
}

export interface CreateCricketTurnInput {
  PlayerID: number;
  TeamSeasonID: number;
  TurnNumber: number;
  RoundNumber: number;
  DartsThrown?: number;
  Seg1?: number;
  Seg2?: number;
  Seg3?: number;
  Seg4?: number;
  Seg5?: number;
  Seg6?: number;
  Seg7?: number;
  Seg8?: number;
  Seg9?: number;
  Seg10?: number;
  Seg11?: number;
  Seg12?: number;
  Seg13?: number;
  Seg14?: number;
  Seg15?: number;
  Seg16?: number;
  Seg17?: number;
  Seg18?: number;
  Seg19?: number;
  Seg20?: number;
  SegBull?: number;
  Points?: number;
  MarksScored?: number;
  IsCricketClose?: boolean;
  IsShanghaiBonus?: boolean;
  Details?: string;
}

export const gameService = {
  async getByMatch(matchId: number): Promise<Game[]> {
    const pool = await getPool();
    const result = await pool.request()
      .input('matchId', sql.Int, matchId)
      .query('SELECT * FROM Games WHERE MatchID = @matchId ORDER BY GameNumber');
    return result.recordset;
  },

  async getById(id: number): Promise<Game | null> {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Games WHERE GameID = @id');
    return result.recordset[0] || null;
  },

  async create(input: CreateGameInput): Promise<Game> {
    const pool = await getPool();

    // Auto-assign game number
    const countResult = await pool.request()
      .input('matchId', sql.Int, input.MatchID)
      .query('SELECT ISNULL(MAX(GameNumber), 0) + 1 AS NextNum FROM Games WHERE MatchID = @matchId');
    const gameNumber = input.GameNumber || countResult.recordset[0].NextNum;

    // For random Round the World, generate sequence
    let rtwSequence: string | null = null;
    if (input.GameType === 'RoundTheWorld' && input.RtwMode === 'Random') {
      const nums = Array.from({ length: 20 }, (_, i) => i + 1);
      nums.push(25); // Bull
      // Fisher-Yates shuffle
      for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nums[i], nums[j]] = [nums[j], nums[i]];
      }
      rtwSequence = JSON.stringify(nums);
    }

    const result = await pool.request()
      .input('matchId', sql.Int, input.MatchID)
      .input('gameType', sql.NVarChar(20), input.GameType)
      .input('gameNumber', sql.Int, gameNumber)
      .input('x01Target', sql.Int, input.X01Target || null)
      .input('doubleIn', sql.Bit, input.DoubleInRequired || false)
      .input('rtwMode', sql.NVarChar(10), input.RtwMode || null)
      .input('rtwSequence', sql.NVarChar(sql.MAX), rtwSequence)
      .query(`
        INSERT INTO Games (MatchID, GameType, GameNumber, X01Target, DoubleInRequired, RtwMode, RtwSequence)
        OUTPUT INSERTED.*
        VALUES (@matchId, @gameType, @gameNumber, @x01Target, @doubleIn, @rtwMode, @rtwSequence)
      `);
    const game = result.recordset[0];

    // Auto-assign players from the match's two teams
    await this.autoAssignPlayers(game.GameID, input.MatchID);

    return game;
  },

  /**
   * Automatically assigns all players from both match teams to a game.
   * Looks up each TeamSeason → Team → Player1/Player2 and inserts into GamePlayers.
   */
  async autoAssignPlayers(gameId: number, matchId: number): Promise<void> {
    const pool = await getPool();

    // Get match to find team season IDs
    const matchResult = await pool.request()
      .input('matchId', sql.Int, matchId)
      .query('SELECT HomeTeamSeasonID, AwayTeamSeasonID FROM Matches WHERE MatchID = @matchId');

    if (matchResult.recordset.length === 0) return;

    const { HomeTeamSeasonID, AwayTeamSeasonID } = matchResult.recordset[0];

    // Get players for both teams via TeamSeasons → Teams → Players
    const playersResult = await pool.request()
      .input('homeTS', sql.Int, HomeTeamSeasonID)
      .input('awayTS', sql.Int, AwayTeamSeasonID)
      .query(`
        SELECT ts.TeamSeasonID, t.Player1ID, t.Player2ID
        FROM TeamSeasons ts
        JOIN Teams t ON ts.TeamID = t.TeamID
        WHERE ts.TeamSeasonID IN (@homeTS, @awayTS)
      `);

    const gamePlayers: { PlayerID: number; TeamSeasonID: number; PlayerOrder: number }[] = [];

    for (const row of playersResult.recordset) {
      if (row.Player1ID) {
        gamePlayers.push({ PlayerID: row.Player1ID, TeamSeasonID: row.TeamSeasonID, PlayerOrder: 1 });
      }
      if (row.Player2ID) {
        gamePlayers.push({ PlayerID: row.Player2ID, TeamSeasonID: row.TeamSeasonID, PlayerOrder: 2 });
      }
    }

    // Insert all game players
    await this.addGamePlayers(gameId, gamePlayers);
  },

  /**
   * Delete (abandon) a game and all related data.
   * Deletes turns, cricket turns, cricket state, game players, and the game itself.
   * For ad-hoc games, also cleans up the match if it has no remaining games.
   */
  async deleteGame(id: number): Promise<void> {
    const pool = await getPool();

    // Get game info before deleting
    const gameResult = await pool.request().input('id', sql.Int, id)
      .query('SELECT MatchID FROM Games WHERE GameID = @id');
    const matchId = gameResult.recordset[0]?.MatchID;

    // Delete in dependency order
    await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM CricketTurns WHERE GameID = @id');
    await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM CricketState WHERE GameID = @id');
    await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM Turns WHERE GameID = @id');
    await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM GamePlayers WHERE GameID = @id');
    await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM Games WHERE GameID = @id');

    // If the match has no remaining games and it's ad-hoc, clean up the match
    if (matchId) {
      const remaining = await pool.request().input('mId', sql.Int, matchId)
        .query('SELECT COUNT(*) AS Cnt FROM Games WHERE MatchID = @mId');
      if (remaining.recordset[0].Cnt === 0) {
        // Check if ad-hoc
        const matchInfo = await pool.request().input('mId', sql.Int, matchId)
          .query(`
            SELECT s.SeasonName FROM Matches m
            JOIN Seasons s ON m.SeasonID = s.SeasonID
            WHERE m.MatchID = @mId
          `);
        if (matchInfo.recordset[0]?.SeasonName === 'Ad-Hoc Play') {
          await pool.request().input('mId', sql.Int, matchId)
            .query('DELETE FROM Matches WHERE MatchID = @mId');
        }
      }
    }
  },

  async updateStatus(id: number, status: string, winnerTeamSeasonId?: number): Promise<Game | null> {
    const pool = await getPool();
    const request = pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.NVarChar(20), status);

    if (winnerTeamSeasonId !== undefined) {
      request.input('winner', sql.Int, winnerTeamSeasonId);
      await request.query(`
        UPDATE Games SET Status = @status, WinnerTeamSeasonID = @winner, UpdatedAt = SYSUTCDATETIME()
        WHERE GameID = @id
      `);
    } else {
      await request.query(`
        UPDATE Games SET Status = @status, UpdatedAt = SYSUTCDATETIME() WHERE GameID = @id
      `);
    }

    const game = await this.getById(id);

    // If game just completed, check if the match should auto-complete
    if (status === 'Completed' && game) {
      await this.checkMatchCompletion(game.MatchID);
    }

    return game;
  },

  /**
   * After a game completes, check if the match should auto-complete.
   * League matches: 5 games, zero-sum, winner = team with 3+ wins.
   * Ad-hoc matches: complete immediately after game finishes.
   */
  async checkMatchCompletion(matchId: number): Promise<void> {
    const pool = await getPool();

    // Get match info
    const matchResult = await pool.request()
      .input('matchId', sql.Int, matchId)
      .query(`
        SELECT m.*, s.SeasonName
        FROM Matches m
        JOIN Seasons s ON m.SeasonID = s.SeasonID
        WHERE m.MatchID = @matchId
      `);

    if (matchResult.recordset.length === 0) return;
    const match = matchResult.recordset[0];

    // Get all games for this match
    const gamesResult = await pool.request()
      .input('matchId', sql.Int, matchId)
      .query('SELECT * FROM Games WHERE MatchID = @matchId');

    const games = gamesResult.recordset;
    if (games.length === 0) return;

    const completedGames = games.filter((g: Game) => g.Status === 'Completed');

    // Ad-hoc matches: complete when any game finishes
    const isAdHoc = match.SeasonName === 'Ad-Hoc Play';

    // Determine MATCH_GAME_COUNT based on context
    const MATCH_GAME_COUNT = isAdHoc ? completedGames.length : 5;

    if (!isAdHoc) {
      // Only auto-complete after exactly 5 games are all done
      if (completedGames.length < 5 || completedGames.length !== games.length) return;
    } else {
      // For ad-hoc, complete when all games are done (usually just 1)
      if (completedGames.length !== games.length || completedGames.length === 0) return;
    }

    // Tally game wins per team
    const winCounts: Record<number, number> = {};
    for (const g of completedGames) {
      if (g.WinnerTeamSeasonID) {
        winCounts[g.WinnerTeamSeasonID] = (winCounts[g.WinnerTeamSeasonID] || 0) + 1;
      }
    }

    const homeWins = winCounts[match.HomeTeamSeasonID] || 0;
    const awayWins = winCounts[match.AwayTeamSeasonID] || 0;

    // Determine match winner — zero-sum, no draws (5 games = odd, always a winner)
    const matchWinner = homeWins > awayWins ? match.HomeTeamSeasonID : match.AwayTeamSeasonID;

    // Update match status with scores
    await pool.request()
      .input('matchId', sql.Int, matchId)
      .input('status', sql.NVarChar(20), 'Completed')
      .input('winner', sql.Int, matchWinner)
      .input('homeScore', sql.Int, homeWins)
      .input('awayScore', sql.Int, awayWins)
      .query(`
        UPDATE Matches
        SET Status = @status, WinnerTeamSeasonID = @winner,
            HomeScore = @homeScore, AwayScore = @awayScore,
            UpdatedAt = SYSUTCDATETIME()
        WHERE MatchID = @matchId
      `);

    // Update TeamSeasons — add game wins to each team's total (skip for ad-hoc)
    if (!isAdHoc) {
      const homeTS = match.HomeTeamSeasonID;
      const awayTS = match.AwayTeamSeasonID;

      await pool.request()
        .input('ts', sql.Int, homeTS)
        .input('gw', sql.Int, homeWins)
        .query('UPDATE TeamSeasons SET GameWins = GameWins + @gw WHERE TeamSeasonID = @ts');

      await pool.request()
        .input('ts', sql.Int, awayTS)
        .input('gw', sql.Int, awayWins)
        .query('UPDATE TeamSeasons SET GameWins = GameWins + @gw WHERE TeamSeasonID = @ts');
    }

    // If this was a playoff semi-final, check if both semis are done to create finals
    if (match.IsPlayoff && match.PlayoffRound === 'Semi') {
      await this.checkSemiFinalsCompletion(match.SeasonID);
    }
  },

  /**
   * After a semi-final completes, check if both semis are done.
   * If so, auto-create the Finals match between the two winners.
   */
  async checkSemiFinalsCompletion(seasonId: number): Promise<void> {
    const pool = await getPool();

    const semisResult = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        SELECT * FROM Matches
        WHERE SeasonID = @seasonId AND IsPlayoff = 1 AND PlayoffRound = 'Semi'
      `);

    const semis = semisResult.recordset;
    if (semis.length !== 2) return;

    const allDone = semis.every((s: any) => s.Status === 'Completed' && s.WinnerTeamSeasonID);
    if (!allDone) return;

    // Check if finals match already exists
    const finalsExist = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`SELECT 1 FROM Matches WHERE SeasonID = @seasonId AND IsPlayoff = 1 AND PlayoffRound = 'Final'`);

    if (finalsExist.recordset.length > 0) return;

    // Get the max round number
    const maxRound = (await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('SELECT ISNULL(MAX(RoundNumber), 0) AS MaxRound FROM Matches WHERE SeasonID = @seasonId')
    ).recordset[0].MaxRound;

    // Create Finals match
    const winner1 = semis[0].WinnerTeamSeasonID;
    const winner2 = semis[1].WinnerTeamSeasonID;

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .input('home', sql.Int, winner1)
      .input('away', sql.Int, winner2)
      .input('round', sql.Int, maxRound + 1)
      .query(`
        INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, IsPlayoff, PlayoffRound)
        VALUES (@seasonId, @home, @away, @round, 1, 'Final')
      `);

    // Mark semi-final losers as eliminated
    const loser1 = semis[0].WinnerTeamSeasonID === semis[0].HomeTeamSeasonID
      ? semis[0].AwayTeamSeasonID : semis[0].HomeTeamSeasonID;
    const loser2 = semis[1].WinnerTeamSeasonID === semis[1].HomeTeamSeasonID
      ? semis[1].AwayTeamSeasonID : semis[1].HomeTeamSeasonID;

    await pool.request().input('ts', sql.Int, loser1)
      .query('UPDATE TeamSeasons SET IsEliminated = 1 WHERE TeamSeasonID = @ts');
    await pool.request().input('ts', sql.Int, loser2)
      .query('UPDATE TeamSeasons SET IsEliminated = 1 WHERE TeamSeasonID = @ts');
  },

  // ----- Turns -----

  async getTurns(gameId: number): Promise<Turn[]> {
    const pool = await getPool();
    const result = await pool.request()
      .input('gameId', sql.Int, gameId)
      .query('SELECT * FROM Turns WHERE GameID = @gameId ORDER BY TurnNumber');
    return result.recordset;
  },

  async addTurn(gameId: number, input: CreateTurnInput): Promise<Turn> {
    const pool = await getPool();
    const result = await pool.request()
      .input('gameId', sql.Int, gameId)
      .input('playerId', sql.Int, input.PlayerID)
      .input('teamSeasonId', sql.Int, input.TeamSeasonID)
      .input('turnNumber', sql.Int, input.TurnNumber)
      .input('roundNumber', sql.Int, input.RoundNumber)
      .input('dartsThrown', sql.Int, input.DartsThrown ?? 3)
      .input('score', sql.Int, input.Score ?? 0)
      .input('remainingScore', sql.Int, input.RemainingScore ?? null)
      .input('isDoubleIn', sql.Bit, input.IsDoubleIn ?? false)
      .input('isGameOut', sql.Bit, input.IsGameOut ?? false)
      .input('marksScored', sql.Int, input.MarksScored ?? null)
      .input('isCricketClose', sql.Bit, input.IsCricketClose ?? false)
      .input('isShanghaiBonus', sql.Bit, input.IsShanghaiBonus ?? false)
      .input('rtwTargetHit', sql.Bit, input.RtwTargetHit ?? false)
      .input('details', sql.NVarChar(sql.MAX), input.Details ?? null)
      .query(`
        INSERT INTO Turns (GameID, PlayerID, TeamSeasonID, TurnNumber, RoundNumber, DartsThrown,
          Score, RemainingScore, IsDoubleIn, IsGameOut, MarksScored, IsCricketClose,
          IsShanghaiBonus, RtwTargetHit, Details)
        OUTPUT INSERTED.*
        VALUES (@gameId, @playerId, @teamSeasonId, @turnNumber, @roundNumber, @dartsThrown,
          @score, @remainingScore, @isDoubleIn, @isGameOut, @marksScored, @isCricketClose,
          @isShanghaiBonus, @rtwTargetHit, @details)
      `);
    return result.recordset[0];
  },

  async undoLastTurn(gameId: number): Promise<boolean> {
    const pool = await getPool();

    // First, get the last turn so we can roll back cricket state if needed
    const lastTurnResult = await pool.request()
      .input('gameId', sql.Int, gameId)
      .query('SELECT TOP 1 * FROM Turns WHERE GameID = @gameId ORDER BY TurnNumber DESC');

    if (lastTurnResult.recordset.length === 0) return false;

    const lastTurn = lastTurnResult.recordset[0];

    // Get the game type to know if we need cricket state rollback
    const gameResult = await pool.request()
      .input('gameId', sql.Int, gameId)
      .query('SELECT GameType FROM Games WHERE GameID = @gameId');

    const gameType = gameResult.recordset[0]?.GameType;

    // Roll back cricket/shanghai state if applicable
    if ((gameType === 'Cricket' || gameType === 'Shanghai') && lastTurn.Details) {
      try {
        const details = JSON.parse(lastTurn.Details);
        if (details.segment && details.marks) {
          const SEGMENT_KEYS: Record<string, string> = {
            '20': 'Seg20', '19': 'Seg19', '18': 'Seg18', '17': 'Seg17',
            '16': 'Seg16', '15': 'Seg15', 'Bull': 'SegBull',
            'T': 'SegTriples', 'D': 'SegDoubles', '3B': 'SegThreeInBed',
          };
          const segKey = SEGMENT_KEYS[details.segment];
          if (segKey) {
            // Get current cricket state for this team
            const stateResult = await pool.request()
              .input('gameId', sql.Int, gameId)
              .input('tsId', sql.Int, lastTurn.TeamSeasonID)
              .query('SELECT * FROM CricketState WHERE GameID = @gameId AND TeamSeasonID = @tsId');

            if (stateResult.recordset.length > 0) {
              const currentState = stateResult.recordset[0];
              const currentMarks = currentState[segKey] || 0;
              const newMarks = Math.max(0, currentMarks - details.marks);
              const pointsToRemove = lastTurn.Score || 0;

              await pool.request()
                .input('gameId', sql.Int, gameId)
                .input('tsId', sql.Int, lastTurn.TeamSeasonID)
                .input('newMarks', sql.Int, newMarks)
                .input('pointsToRemove', sql.Int, pointsToRemove)
                .query(`
                  UPDATE CricketState
                  SET ${segKey} = @newMarks, Points = CASE WHEN Points - @pointsToRemove < 0 THEN 0 ELSE Points - @pointsToRemove END
                  WHERE GameID = @gameId AND TeamSeasonID = @tsId
                `);
            }
          }
        }
        // Handle Shanghai bonus undo
        if (lastTurn.IsShanghaiBonus && lastTurn.Score) {
          await pool.request()
            .input('gameId', sql.Int, gameId)
            .input('tsId', sql.Int, lastTurn.TeamSeasonID)
            .input('score', sql.Int, lastTurn.Score)
            .query(`
              UPDATE CricketState
              SET Points = CASE WHEN Points - @score < 0 THEN 0 ELSE Points - @score END
              WHERE GameID = @gameId AND TeamSeasonID = @tsId
            `);
        }
      } catch {
        // If Details JSON is malformed, just delete the turn without rollback
      }
    }

    // Delete the last turn
    const result = await pool.request()
      .input('turnId', sql.Int, lastTurn.TurnID)
      .query('DELETE FROM Turns WHERE TurnID = @turnId');
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  // ----- Cricket State -----

  async getCricketState(gameId: number): Promise<CricketState[]> {
    const pool = await getPool();
    const result = await pool.request()
      .input('gameId', sql.Int, gameId)
      .query('SELECT * FROM CricketState WHERE GameID = @gameId');
    return result.recordset;
  },

  async upsertCricketState(gameId: number, teamSeasonId: number, state: Partial<CricketState>): Promise<CricketState> {
    const pool = await getPool();

    // Check if exists
    const exists = await pool.request()
      .input('gameId', sql.Int, gameId)
      .input('tsId', sql.Int, teamSeasonId)
      .query('SELECT CricketStateID FROM CricketState WHERE GameID = @gameId AND TeamSeasonID = @tsId');

    if (exists.recordset.length > 0) {
      const sets: string[] = [];
      const request = pool.request()
        .input('gameId', sql.Int, gameId)
        .input('tsId', sql.Int, teamSeasonId);

      const fields = ['Seg20', 'Seg19', 'Seg18', 'Seg17', 'Seg16', 'Seg15', 'SegBull',
        'SegTriples', 'SegDoubles', 'SegThreeInBed', 'Points'] as const;

      for (const field of fields) {
        if (state[field] !== undefined) {
          sets.push(`${field} = @${field}`);
          request.input(field, sql.Int, state[field]);
        }
      }

      if (sets.length > 0) {
        const result = await request.query(`
          UPDATE CricketState SET ${sets.join(', ')}
          OUTPUT INSERTED.*
          WHERE GameID = @gameId AND TeamSeasonID = @tsId
        `);
        return result.recordset[0];
      }
    } else {
      const result = await pool.request()
        .input('gameId', sql.Int, gameId)
        .input('tsId', sql.Int, teamSeasonId)
        .input('Seg20', sql.Int, state.Seg20 ?? 0)
        .input('Seg19', sql.Int, state.Seg19 ?? 0)
        .input('Seg18', sql.Int, state.Seg18 ?? 0)
        .input('Seg17', sql.Int, state.Seg17 ?? 0)
        .input('Seg16', sql.Int, state.Seg16 ?? 0)
        .input('Seg15', sql.Int, state.Seg15 ?? 0)
        .input('SegBull', sql.Int, state.SegBull ?? 0)
        .input('SegTriples', sql.Int, state.SegTriples ?? 0)
        .input('SegDoubles', sql.Int, state.SegDoubles ?? 0)
        .input('SegThreeInBed', sql.Int, state.SegThreeInBed ?? 0)
        .input('Points', sql.Int, state.Points ?? 0)
        .query(`
          INSERT INTO CricketState (GameID, TeamSeasonID, Seg20, Seg19, Seg18, Seg17, Seg16, Seg15,
            SegBull, SegTriples, SegDoubles, SegThreeInBed, Points)
          OUTPUT INSERTED.*
          VALUES (@gameId, @tsId, @Seg20, @Seg19, @Seg18, @Seg17, @Seg16, @Seg15,
            @SegBull, @SegTriples, @SegDoubles, @SegThreeInBed, @Points)
        `);
      return result.recordset[0];
    }

    return (await this.getCricketState(gameId)).find(s => s.TeamSeasonID === teamSeasonId)!;
  },

  // ----- Cricket Turns -----

  async getCricketTurns(gameId: number): Promise<CricketTurn[]> {
    const pool = await getPool();
    const result = await pool.request()
      .input('gameId', sql.Int, gameId)
      .query('SELECT * FROM CricketTurns WHERE GameID = @gameId ORDER BY TurnNumber');
    return result.recordset;
  },

  async addCricketTurn(gameId: number, input: CreateCricketTurnInput): Promise<CricketTurn> {
    const pool = await getPool();
    const segCols = ['Seg1','Seg2','Seg3','Seg4','Seg5','Seg6','Seg7','Seg8','Seg9','Seg10',
      'Seg11','Seg12','Seg13','Seg14','Seg15','Seg16','Seg17','Seg18','Seg19','Seg20','SegBull'];

    const request = pool.request()
      .input('gameId', sql.Int, gameId)
      .input('playerId', sql.Int, input.PlayerID)
      .input('teamSeasonId', sql.Int, input.TeamSeasonID)
      .input('turnNumber', sql.Int, input.TurnNumber)
      .input('roundNumber', sql.Int, input.RoundNumber)
      .input('dartsThrown', sql.Int, input.DartsThrown ?? 3)
      .input('points', sql.Int, input.Points ?? 0)
      .input('marksScored', sql.Int, input.MarksScored ?? 0)
      .input('isCricketClose', sql.Bit, input.IsCricketClose ?? false)
      .input('isShanghaiBonus', sql.Bit, input.IsShanghaiBonus ?? false)
      .input('details', sql.NVarChar(sql.MAX), input.Details ?? null);

    for (const col of segCols) {
      request.input(col, sql.Int, (input as any)[col] ?? 0);
    }

    const colList = segCols.join(', ');
    const paramList = segCols.map(c => `@${c}`).join(', ');

    const result = await request.query(`
      INSERT INTO CricketTurns (GameID, PlayerID, TeamSeasonID, TurnNumber, RoundNumber, DartsThrown,
        ${colList}, Points, MarksScored, IsCricketClose, IsShanghaiBonus, Details)
      OUTPUT INSERTED.*
      VALUES (@gameId, @playerId, @teamSeasonId, @turnNumber, @roundNumber, @dartsThrown,
        ${paramList}, @points, @marksScored, @isCricketClose, @isShanghaiBonus, @details)
    `);
    return result.recordset[0];
  },

  async undoLastCricketTurn(gameId: number): Promise<boolean> {
    const pool = await getPool();

    // Get the last cricket turn
    const lastTurnResult = await pool.request()
      .input('gameId', sql.Int, gameId)
      .query('SELECT TOP 1 * FROM CricketTurns WHERE GameID = @gameId ORDER BY TurnNumber DESC');

    if (lastTurnResult.recordset.length === 0) return false;

    const lastTurn = lastTurnResult.recordset[0];

    // Roll back cricket state: subtract this turn's segment marks
    const segCols = ['Seg1','Seg2','Seg3','Seg4','Seg5','Seg6','Seg7','Seg8','Seg9','Seg10',
      'Seg11','Seg12','Seg13','Seg14','Seg15','Seg16','Seg17','Seg18','Seg19','Seg20','SegBull'];
    const CRICKET_STATE_KEYS: Record<string, string> = {
      'Seg15': 'Seg15', 'Seg16': 'Seg16', 'Seg17': 'Seg17',
      'Seg18': 'Seg18', 'Seg19': 'Seg19', 'Seg20': 'Seg20', 'SegBull': 'SegBull',
    };

    // For cricket state, only segments 15-20 + Bull have state columns
    const stateResult = await pool.request()
      .input('gameId', sql.Int, gameId)
      .input('tsId', sql.Int, lastTurn.TeamSeasonID)
      .query('SELECT * FROM CricketState WHERE GameID = @gameId AND TeamSeasonID = @tsId');

    if (stateResult.recordset.length > 0) {
      const currentState = stateResult.recordset[0];
      const sets: string[] = [];
      const request = pool.request()
        .input('gameId', sql.Int, gameId)
        .input('tsId', sql.Int, lastTurn.TeamSeasonID);

      for (const [turnCol, stateCol] of Object.entries(CRICKET_STATE_KEYS)) {
        const marksToRemove = lastTurn[turnCol] || 0;
        if (marksToRemove > 0) {
          const paramName = `new${stateCol}`;
          const newVal = Math.max(0, (currentState[stateCol] || 0) - marksToRemove);
          sets.push(`${stateCol} = @${paramName}`);
          request.input(paramName, sql.Int, newVal);
        }
      }

      // Also subtract points
      const pointsToRemove = lastTurn.Points || 0;
      if (pointsToRemove > 0) {
        sets.push('Points = CASE WHEN Points - @pointsToRemove < 0 THEN 0 ELSE Points - @pointsToRemove END');
        request.input('pointsToRemove', sql.Int, pointsToRemove);
      }

      if (sets.length > 0) {
        await request.query(`
          UPDATE CricketState SET ${sets.join(', ')}
          WHERE GameID = @gameId AND TeamSeasonID = @tsId
        `);
      }
    }

    // Delete the last cricket turn
    const result = await pool.request()
      .input('turnId', sql.Int, lastTurn.CricketTurnID)
      .query('DELETE FROM CricketTurns WHERE CricketTurnID = @turnId');
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  // ----- Game Players -----

  async addGamePlayers(gameId: number, players: { PlayerID: number; TeamSeasonID: number; PlayerOrder: number }[]): Promise<void> {
    const pool = await getPool();
    for (const p of players) {
      await pool.request()
        .input('gameId', sql.Int, gameId)
        .input('playerId', sql.Int, p.PlayerID)
        .input('tsId', sql.Int, p.TeamSeasonID)
        .input('order', sql.Int, p.PlayerOrder)
        .query(`
          INSERT INTO GamePlayers (GameID, PlayerID, TeamSeasonID, PlayerOrder)
          VALUES (@gameId, @playerId, @tsId, @order)
        `);
    }
  },

  async getGamePlayers(gameId: number): Promise<any[]> {
    const pool = await getPool();
    const result = await pool.request()
      .input('gameId', sql.Int, gameId)
      .query(`
        SELECT gp.*, p.FirstName, p.LastName, p.Nickname, p.ImageData
        FROM GamePlayers gp
        JOIN Players p ON gp.PlayerID = p.PlayerID
        WHERE gp.GameID = @gameId
        ORDER BY gp.TeamSeasonID, gp.PlayerOrder
      `);
    return result.recordset;
  },

  /**
   * Creates an ad-hoc game with all supporting infrastructure:
   * - Gets or creates "Ad-Hoc Play" season
   * - Creates teams for each side
   * - Registers teams to the ad-hoc season
   * - Creates a match between the two team-seasons
   * - Creates the game
   * - Assigns all players as GamePlayers
   */
  async createAdHoc(input: {
    GameType: string;
    X01Target?: number;
    DoubleInRequired?: boolean;
    RtwMode?: string;
    TeamAPlayers: number[];
    TeamBPlayers: number[];
    TeamPlay: boolean;
  }): Promise<Game> {
    const pool = await getPool();

    // 1. Get or create "Ad-Hoc Play" season
    let seasonResult = await pool.request()
      .query(`SELECT SeasonID FROM Seasons WHERE SeasonName = 'Ad-Hoc Play'`);
    let seasonId: number;
    if (seasonResult.recordset.length === 0) {
      const insertSeason = await pool.request()
        .query(`
          INSERT INTO Seasons (SeasonName, Status, IsActive)
          OUTPUT INSERTED.SeasonID
          VALUES ('Ad-Hoc Play', 'RoundRobin', 1)
        `);
      seasonId = insertSeason.recordset[0].SeasonID;
    } else {
      seasonId = seasonResult.recordset[0].SeasonID;
    }

    // 2. Create teams for each side
    const createOrFindTeam = async (playerIds: number[], label: string): Promise<number> => {
      const p1 = playerIds[0];
      const p2 = playerIds.length > 1 ? playerIds[1] : null;

      // Look for existing team with same player combo
      let teamResult;
      if (p2) {
        teamResult = await pool.request()
          .input('p1', sql.Int, p1)
          .input('p2', sql.Int, p2)
          .query(`
            SELECT TeamID FROM Teams
            WHERE (Player1ID = @p1 AND Player2ID = @p2)
               OR (Player1ID = @p2 AND Player2ID = @p1)
          `);
      } else {
        teamResult = await pool.request()
          .input('p1', sql.Int, p1)
          .query(`
            SELECT TeamID FROM Teams
            WHERE Player1ID = @p1 AND Player2ID IS NULL
          `);
      }

      if (teamResult.recordset.length > 0) {
        return teamResult.recordset[0].TeamID;
      }

      // Get player names for auto-naming
      const namesResult = await pool.request()
        .input('ids', sql.NVarChar(200), playerIds.join(','))
        .query(`SELECT PlayerID, FirstName, LastName FROM Players WHERE PlayerID IN (${playerIds.join(',')})`);
      const nameMap = new Map(namesResult.recordset.map((r: any) => [r.PlayerID, `${r.FirstName} ${r.LastName}`]));
      const teamName = playerIds.map(id => nameMap.get(id) || `Player ${id}`).join(' & ');

      const insertTeam = await pool.request()
        .input('name', sql.NVarChar(200), teamName)
        .input('p1', sql.Int, p1)
        .input('p2', sql.Int, p2)
        .query(`
          INSERT INTO Teams (TeamName, Player1ID, Player2ID)
          OUTPUT INSERTED.TeamID
          VALUES (@name, @p1, @p2)
        `);
      return insertTeam.recordset[0].TeamID;
    };

    const teamAId = await createOrFindTeam(input.TeamAPlayers, 'A');
    // Solo play: create a solo "opponent" team using same player
    const isSolo = input.TeamBPlayers.length === 0;
    const teamBId = isSolo
      ? await createOrFindTeam(input.TeamAPlayers, 'A')  // reuse Team A
      : await createOrFindTeam(input.TeamBPlayers, 'B');

    // 3. Register teams to ad-hoc season (if not already)
    const registerTeam = async (teamId: number): Promise<number> => {
      const existing = await pool.request()
        .input('teamId', sql.Int, teamId)
        .input('seasonId', sql.Int, seasonId)
        .query(`SELECT TeamSeasonID FROM TeamSeasons WHERE TeamID = @teamId AND SeasonID = @seasonId`);
      if (existing.recordset.length > 0) {
        return existing.recordset[0].TeamSeasonID;
      }
      const ins = await pool.request()
        .input('teamId', sql.Int, teamId)
        .input('seasonId', sql.Int, seasonId)
        .query(`
          INSERT INTO TeamSeasons (TeamID, SeasonID)
          OUTPUT INSERTED.TeamSeasonID
          VALUES (@teamId, @seasonId)
        `);
      return ins.recordset[0].TeamSeasonID;
    };

    const teamASeasonId = await registerTeam(teamAId);
    const teamBSeasonId = await registerTeam(teamBId);

    // 4. Create match
    const matchResult = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .input('homeTS', sql.Int, teamASeasonId)
      .input('awayTS', sql.Int, teamBSeasonId)
      .query(`
        INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status)
        OUTPUT INSERTED.*
        VALUES (@seasonId, @homeTS, @awayTS, 1, 'InProgress')
      `);
    const matchId = matchResult.recordset[0].MatchID;

    // 5. Create game
    let rtwSequence: string | null = null;
    if (input.GameType === 'RoundTheWorld' && input.RtwMode === 'Random') {
      const nums = Array.from({ length: 20 }, (_, i) => i + 1);
      nums.push(25);
      for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nums[i], nums[j]] = [nums[j], nums[i]];
      }
      rtwSequence = JSON.stringify(nums);
    }

    const gameResult = await pool.request()
      .input('matchId', sql.Int, matchId)
      .input('gameType', sql.NVarChar(20), input.GameType)
      .input('gameNumber', sql.Int, 1)
      .input('x01Target', sql.Int, input.X01Target || null)
      .input('doubleIn', sql.Bit, input.DoubleInRequired || false)
      .input('rtwMode', sql.NVarChar(10), input.RtwMode || null)
      .input('rtwSequence', sql.NVarChar(sql.MAX), rtwSequence)
      .query(`
        INSERT INTO Games (MatchID, GameType, GameNumber, X01Target, DoubleInRequired, RtwMode, RtwSequence, Status)
        OUTPUT INSERTED.*
        VALUES (@matchId, @gameType, @gameNumber, @x01Target, @doubleIn, @rtwMode, @rtwSequence, 'InProgress')
      `);
    const game = gameResult.recordset[0];

    // 6. Assign all players as GamePlayers
    const gamePlayers: { PlayerID: number; TeamSeasonID: number; PlayerOrder: number }[] = [];
    input.TeamAPlayers.forEach((pid, idx) => {
      gamePlayers.push({ PlayerID: pid, TeamSeasonID: teamASeasonId, PlayerOrder: idx + 1 });
    });
    if (!isSolo) {
      input.TeamBPlayers.forEach((pid, idx) => {
        gamePlayers.push({ PlayerID: pid, TeamSeasonID: teamBSeasonId, PlayerOrder: idx + 1 });
      });
    }
    await this.addGamePlayers(game.GameID, gamePlayers);

    return game;
  },
};
