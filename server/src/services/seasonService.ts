import { getPool, sql } from '../config/database';
import { Season, TeamSeason } from '../types';
import { AppError } from '../middleware/errorHandler';

export interface CreateSeasonInput {
  SeasonName: string;
  StartDate?: string;
  EndDate?: string;
}

interface ScheduleOptions {
  preserveMakeUpMatches?: boolean;
}

interface MakeUpRoundInput {
  matchDate?: string;
}

const DEFAULT_SEASON_FORMATS = [
  { GameNumber: 1, GameType: 'X01', X01Target: 501, DoubleInRequired: false },
  { GameNumber: 2, GameType: 'X01', X01Target: 501, DoubleInRequired: false },
  { GameNumber: 3, GameType: 'Cricket', X01Target: null, DoubleInRequired: false },
  { GameNumber: 4, GameType: 'Cricket', X01Target: null, DoubleInRequired: false },
  { GameNumber: 5, GameType: 'X01', X01Target: 301, DoubleInRequired: true },
] as const;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toUtcDateOnly(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value === 'string') {
    const isoDate = value.slice(0, 10);
    return new Date(`${isoDate}T00:00:00Z`);
  }

  return null;
}

export const seasonService = {
  async getAll(): Promise<Season[]> {
    const pool = await getPool();
    const result = await pool.request().query(
      `SELECT s.*, t.TeamName AS ChampionTeamName
       FROM Seasons s
       LEFT JOIN TeamSeasons ts ON ts.TeamSeasonID = s.ChampionTeamSeasonID
       LEFT JOIN Teams t ON t.TeamID = ts.TeamID
       WHERE s.SeasonName <> 'Ad-Hoc Play'
       ORDER BY s.SeasonID DESC`
    );
    return result.recordset;
  },

  async getById(id: number): Promise<Season | null> {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT s.*, t.TeamName AS ChampionTeamName
              FROM Seasons s
              LEFT JOIN TeamSeasons ts ON ts.TeamSeasonID = s.ChampionTeamSeasonID
              LEFT JOIN Teams t ON t.TeamID = ts.TeamID
              WHERE s.SeasonID = @id`);
    return result.recordset[0] || null;
  },

  async create(input: CreateSeasonInput): Promise<Season> {
    const pool = await getPool();
    const result = await pool.request()
      .input('SeasonName', sql.NVarChar(200), input.SeasonName)
      .input('StartDate', sql.Date, input.StartDate || null)
      .input('EndDate', sql.Date, input.EndDate || null)
      .query(`
        INSERT INTO Seasons (SeasonName, StartDate, EndDate)
        OUTPUT INSERTED.*
        VALUES (@SeasonName, @StartDate, @EndDate)
      `);
    const season = result.recordset[0];

    for (const format of DEFAULT_SEASON_FORMATS) {
      await pool.request()
        .input('seasonId', sql.Int, season.SeasonID)
        .input('gameNumber', sql.Int, format.GameNumber)
        .input('gameType', sql.NVarChar(20), format.GameType)
        .input('x01Target', sql.Int, format.X01Target)
        .input('doubleIn', sql.Bit, format.DoubleInRequired)
        .query(`
          INSERT INTO SeasonGameFormats (SeasonID, GameNumber, GameType, X01Target, DoubleInRequired)
          VALUES (@seasonId, @gameNumber, @gameType, @x01Target, @doubleIn)
        `);
    }

    return season;
  },

  async update(id: number, input: Partial<CreateSeasonInput & { Status: string; IsActive: boolean }>): Promise<Season | null> {
    const pool = await getPool();
    const sets: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (input.SeasonName !== undefined) {
      sets.push('SeasonName = @SeasonName');
      request.input('SeasonName', sql.NVarChar(200), input.SeasonName);
    }
    if (input.StartDate !== undefined) {
      sets.push('StartDate = @StartDate');
      request.input('StartDate', sql.Date, input.StartDate);
    }
    if (input.EndDate !== undefined) {
      sets.push('EndDate = @EndDate');
      request.input('EndDate', sql.Date, input.EndDate);
    }
    if (input.Status !== undefined) {
      sets.push('Status = @Status');
      request.input('Status', sql.NVarChar(20), input.Status);
    }
    if (input.IsActive !== undefined) {
      sets.push('IsActive = @IsActive');
      request.input('IsActive', sql.Bit, input.IsActive);
    }

    if (sets.length === 0) return this.getById(id);

    sets.push('UpdatedAt = SYSUTCDATETIME()');
    await request.query(`UPDATE Seasons SET ${sets.join(', ')} WHERE SeasonID = @id`);
    return this.getById(id);
  },

  // ----- Team-Season registration -----

  async getTeamSeasons(seasonId: number): Promise<TeamSeason[]> {
    const pool = await getPool();
    const result = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        SELECT ts.*,
          t.TeamName,
          p1.FirstName AS Player1FirstName, p1.LastName AS Player1LastName,
          p2.FirstName AS Player2FirstName, p2.LastName AS Player2LastName
        FROM TeamSeasons ts
        JOIN Teams t ON ts.TeamID = t.TeamID
        JOIN Players p1 ON t.Player1ID = p1.PlayerID
        JOIN Players p2 ON t.Player2ID = p2.PlayerID
        WHERE ts.SeasonID = @seasonId
        ORDER BY ts.GameWins DESC, ts.TeamSeasonID ASC
      `);
    return result.recordset;
  },

  async addTeamToSeason(seasonId: number, teamId: number): Promise<TeamSeason> {
    const pool = await getPool();
    const result = await pool.request()
      .input('teamId', sql.Int, teamId)
      .input('seasonId', sql.Int, seasonId)
      .query(`
        INSERT INTO TeamSeasons (TeamID, SeasonID)
        OUTPUT INSERTED.*
        VALUES (@teamId, @seasonId)
      `);
    return result.recordset[0];
  },

  async removeTeamFromSeason(seasonId: number, teamId: number): Promise<boolean> {
    const pool = await getPool();
    const result = await pool.request()
      .input('teamId', sql.Int, teamId)
      .input('seasonId', sql.Int, seasonId)
      .query('DELETE FROM TeamSeasons WHERE TeamID = @teamId AND SeasonID = @seasonId');
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  // ----- Round-Robin schedule generation -----

  async generateSchedule(seasonId: number, options: ScheduleOptions = {}): Promise<number> {
    const pool = await getPool();
    const season = await this.getById(seasonId);
    const teamSeasons = await this.getTeamSeasons(seasonId);

    if (teamSeasons.length < 2) {
      throw new AppError(400, 'Need at least 2 teams to generate a schedule');
    }

    // Delete existing non-playoff matches for this season
    if (options.preserveMakeUpMatches) {
      await pool.request()
        .input('seasonId', sql.Int, seasonId)
        .query(`
          DELETE FROM Matches
          WHERE SeasonID = @seasonId
            AND IsPlayoff = 0
            AND ISNULL(PlayoffRound, '') <> 'MakeUp'
        `);
    } else {
      await pool.request()
        .input('seasonId', sql.Int, seasonId)
        .query('DELETE FROM Matches WHERE SeasonID = @seasonId AND IsPlayoff = 0');
    }

    // Round-robin: every team plays every other team
    const ids = teamSeasons.map(ts => ts.TeamSeasonID);
    let round = 1;
    let matchCount = 0;
    const startDate = toUtcDateOnly(season?.StartDate);

    // Circle method for round-robin scheduling
    const n = ids.length;
    const rounds = n % 2 === 0 ? n - 1 : n;
    const list = [...ids];
    if (n % 2 !== 0) list.push(-1); // bye

    const half = list.length / 2;

    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < half; i++) {
        const home = list[i];
        const away = list[list.length - 1 - i];
        if (home === -1 || away === -1) continue; // skip byes

        await pool.request()
          .input('seasonId', sql.Int, seasonId)
          .input('home', sql.Int, home)
          .input('away', sql.Int, away)
          .input('round', sql.Int, round)
          .input('matchDate', sql.DateTime2, startDate ? addDays(startDate, (round - 1) * 7) : null)
          .query(`
            INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, MatchDate)
            VALUES (@seasonId, @home, @away, @round, @matchDate)
          `);
        matchCount++;
      }
      round++;
      // Rotate: fix first element, rotate the rest
      const last = list.pop()!;
      list.splice(1, 0, last);
    }

    // Update season status
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query("UPDATE Seasons SET Status = 'RoundRobin', UpdatedAt = SYSUTCDATETIME() WHERE SeasonID = @seasonId");

    return matchCount;
  },

  // ----- Playoff generation -----

  async generatePlayoffs(seasonId: number): Promise<void> {
    const pool = await getPool();
    const season = await this.getById(seasonId);
    const standings = await this.getTeamSeasons(seasonId);
    const incompleteRegularMatches = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        SELECT COUNT(*) AS IncompleteCount
        FROM Matches
        WHERE SeasonID = @seasonId
          AND IsPlayoff = 0
          AND ISNULL(PlayoffRound, '') <> 'MakeUp'
          AND Status <> 'Completed'
      `);

    if (standings.length < 4) {
      throw new AppError(400, 'Need at least 4 teams for playoffs');
    }
    if ((incompleteRegularMatches.recordset[0]?.IncompleteCount || 0) > 0) {
      throw new AppError(400, 'All regular season matches must be completed before generating playoffs');
    }

    // Resolve tiebreaks to determine top 4 seeding
    const top4 = await this.resolvePlayoffSeeding(pool, seasonId, standings);

    // Delete existing playoff matches
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('DELETE FROM Matches WHERE SeasonID = @seasonId AND IsPlayoff = 1');

    for (let i = 0; i < 4; i++) {
      await pool.request()
        .input('tsId', sql.Int, top4[i].TeamSeasonID)
        .input('seed', sql.Int, i + 1)
        .query('UPDATE TeamSeasons SET PlayoffSeed = @seed WHERE TeamSeasonID = @tsId');
    }

    // Semi-finals: 1v4, 2v3
    const maxRound = (await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('SELECT ISNULL(MAX(RoundNumber), 0) AS MaxRound FROM Matches WHERE SeasonID = @seasonId')
    ).recordset[0].MaxRound;

    const semiRound = maxRound + 1;
    const seasonStartDate = toUtcDateOnly(season?.StartDate);
    const semiDate = seasonStartDate ? addDays(seasonStartDate, (semiRound - 1) * 7) : null;

    // 1 vs 4
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .input('home', sql.Int, top4[0].TeamSeasonID)
      .input('away', sql.Int, top4[3].TeamSeasonID)
      .input('round', sql.Int, semiRound)
      .input('matchDate', sql.DateTime2, semiDate)
      .query(`
        INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, MatchDate, IsPlayoff, PlayoffRound)
        VALUES (@seasonId, @home, @away, @round, @matchDate, 1, 'Semi')
      `);

    // 2 vs 3
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .input('home', sql.Int, top4[1].TeamSeasonID)
      .input('away', sql.Int, top4[2].TeamSeasonID)
      .input('round', sql.Int, semiRound)
      .input('matchDate', sql.DateTime2, semiDate)
      .query(`
        INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, MatchDate, IsPlayoff, PlayoffRound)
        VALUES (@seasonId, @home, @away, @round, @matchDate, 1, 'Semi')
      `);

    // Finals slot will be created after semi results are in
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query("UPDATE Seasons SET Status = 'Playoffs', UpdatedAt = SYSUTCDATETIME() WHERE SeasonID = @seasonId");
  },

  /**
   * Resolve playoff seeding for top 4 teams, applying tiebreakers in order:
   * 1) Game Wins (primary sort, already in standings)
   * 2) Head-to-head results
   * 3) 501 team average PPR
   * 4) Cricket team average MPR
   * 5) 301 team average PPR
   * 6) Most All-Stars combined
   * 7) Highest OUT score
   * 8) Highest IN score
   * 9) Coin flip (random)
   */
  async resolvePlayoffSeeding(
    pool: any,
    seasonId: number,
    standings: TeamSeason[]
  ): Promise<TeamSeason[]> {
    // Gather all tiebreak data upfront
    const tsIds = standings.map(s => s.TeamSeasonID);

    // Head-to-head: game wins between any two teams in the season
    const h2hResult = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        SELECT m.HomeTeamSeasonID, m.AwayTeamSeasonID,
          SUM(CASE WHEN g.WinnerTeamSeasonID = m.HomeTeamSeasonID THEN 1 ELSE 0 END) AS HomeGW,
          SUM(CASE WHEN g.WinnerTeamSeasonID = m.AwayTeamSeasonID THEN 1 ELSE 0 END) AS AwayGW
        FROM Matches m
        JOIN Games g ON g.MatchID = m.MatchID AND g.Status = 'Completed'
        WHERE m.SeasonID = @seasonId AND m.IsPlayoff = 0
        GROUP BY m.HomeTeamSeasonID, m.AwayTeamSeasonID
      `);

    // Build H2H lookup: h2h[teamA][teamB] = net game wins for A against B
    const h2h: Record<number, Record<number, number>> = {};
    for (const id of tsIds) h2h[id] = {};
    for (const row of h2hResult.recordset) {
      const home = row.HomeTeamSeasonID;
      const away = row.AwayTeamSeasonID;
      h2h[home] = h2h[home] || {};
      h2h[away] = h2h[away] || {};
      h2h[home][away] = (h2h[home][away] || 0) + row.HomeGW - row.AwayGW;
      h2h[away][home] = (h2h[away][home] || 0) + row.AwayGW - row.HomeGW;
    }

    // Per-game-type stats: 501 PPR, 301 PPR, Cricket MPR per team
    const gameTypeStatsResult = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        SELECT gp.TeamSeasonID,
          g.GameType, g.X01Target,
          SUM(t.Score) AS TotalScore,
          SUM(t.DartsThrown) AS TotalDarts
        FROM GamePlayers gp
        JOIN Turns t ON t.GameID = gp.GameID AND t.PlayerID = gp.PlayerID
        JOIN Games g ON gp.GameID = g.GameID
        JOIN Matches m ON g.MatchID = m.MatchID
        WHERE m.SeasonID = @seasonId AND g.Status = 'Completed' AND m.IsPlayoff = 0
        GROUP BY gp.TeamSeasonID, g.GameType, g.X01Target
      `);

    // Cricket MPR from CricketTurns
    const cricketStatsResult = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        SELECT gp.TeamSeasonID,
          SUM(ct.MarksScored) AS TotalMarks,
          COUNT(DISTINCT ct.RoundNumber * 10000 + ct.GameID) AS TotalRounds
        FROM GamePlayers gp
        JOIN CricketTurns ct ON ct.GameID = gp.GameID AND ct.PlayerID = gp.PlayerID
        JOIN Games g ON gp.GameID = g.GameID
        JOIN Matches m ON g.MatchID = m.MatchID
        WHERE m.SeasonID = @seasonId AND g.Status = 'Completed'
          AND g.GameType = 'Cricket' AND m.IsPlayoff = 0
        GROUP BY gp.TeamSeasonID
      `);

    // All-Stars combined per team (from both Turns and CricketTurns)
    const allStarsResult = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        SELECT TeamSeasonID, SUM(Stars) AS TotalStars FROM (
          SELECT gp.TeamSeasonID,
            SUM(CASE
              WHEN JSON_VALUE(t.Details, '$.allStarCount') IS NOT NULL
              THEN CAST(JSON_VALUE(t.Details, '$.allStarCount') AS INT)
              WHEN JSON_VALUE(t.Details, '$.allStarLevel') IS NOT NULL THEN 1
              ELSE 0 END) AS Stars
          FROM GamePlayers gp
          JOIN Turns t ON t.GameID = gp.GameID AND t.PlayerID = gp.PlayerID
          JOIN Games g ON gp.GameID = g.GameID
          JOIN Matches m ON g.MatchID = m.MatchID
          WHERE m.SeasonID = @seasonId AND g.Status = 'Completed'
            AND t.Details IS NOT NULL AND m.IsPlayoff = 0
          GROUP BY gp.TeamSeasonID
          UNION ALL
          SELECT gp.TeamSeasonID,
            SUM(CASE
              WHEN JSON_VALUE(ct.Details, '$.allStarCount') IS NOT NULL
              THEN CAST(JSON_VALUE(ct.Details, '$.allStarCount') AS INT)
              WHEN JSON_VALUE(ct.Details, '$.allStarLevel') IS NOT NULL THEN 1
              ELSE 0 END) AS Stars
          FROM GamePlayers gp
          JOIN CricketTurns ct ON ct.GameID = gp.GameID AND ct.PlayerID = gp.PlayerID
          JOIN Games g ON gp.GameID = g.GameID
          JOIN Matches m ON g.MatchID = m.MatchID
          WHERE m.SeasonID = @seasonId AND g.Status = 'Completed'
            AND ct.Details IS NOT NULL AND m.IsPlayoff = 0
          GROUP BY gp.TeamSeasonID
        ) combined
        GROUP BY TeamSeasonID
      `);

    // Highest OUT and highest IN per team
    const highOutResult = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        SELECT gp.TeamSeasonID, MAX(t.Score) AS HighOut
        FROM Turns t
        JOIN GamePlayers gp ON gp.GameID = t.GameID AND gp.PlayerID = t.PlayerID
        JOIN Games g ON t.GameID = g.GameID
        JOIN Matches m ON g.MatchID = m.MatchID
        WHERE m.SeasonID = @seasonId AND g.Status = 'Completed'
          AND g.GameType = 'X01' AND t.IsGameOut = 1 AND m.IsPlayoff = 0
        GROUP BY gp.TeamSeasonID
      `);

    const highInResult = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        SELECT gp.TeamSeasonID, MAX(t.Score) AS HighIn
        FROM Turns t
        JOIN GamePlayers gp ON gp.GameID = t.GameID AND gp.PlayerID = t.PlayerID
        JOIN Games g ON t.GameID = g.GameID
        JOIN Matches m ON g.MatchID = m.MatchID
        WHERE m.SeasonID = @seasonId AND g.Status = 'Completed'
          AND g.GameType = 'X01' AND t.IsDoubleIn = 1 AND m.IsPlayoff = 0
        GROUP BY gp.TeamSeasonID
      `);

    // Build lookup maps
    const ppr501: Record<number, number> = {};
    const ppr301: Record<number, number> = {};
    for (const row of gameTypeStatsResult.recordset) {
      if (row.GameType === 'X01' && row.TotalDarts > 0) {
        const ppr = (row.TotalScore / row.TotalDarts) * 3;
        if (row.X01Target === 501) ppr501[row.TeamSeasonID] = ppr;
        else if (row.X01Target === 301) ppr301[row.TeamSeasonID] = ppr;
      }
    }

    const mprCricket: Record<number, number> = {};
    for (const row of cricketStatsResult.recordset) {
      if (row.TotalRounds > 0) {
        mprCricket[row.TeamSeasonID] = row.TotalMarks / row.TotalRounds;
      }
    }

    const allStars: Record<number, number> = {};
    for (const row of allStarsResult.recordset) {
      allStars[row.TeamSeasonID] = row.TotalStars;
    }

    const highOut: Record<number, number> = {};
    for (const row of highOutResult.recordset) {
      highOut[row.TeamSeasonID] = row.HighOut;
    }

    const highIn: Record<number, number> = {};
    for (const row of highInResult.recordset) {
      highIn[row.TeamSeasonID] = row.HighIn;
    }

    // Sort: primary by GameWins DESC, then apply tiebreakers for equal GameWins
    const sorted = [...standings];
    sorted.sort((a, b) => {
      // Primary: Game Wins
      if (a.GameWins !== b.GameWins) return b.GameWins - a.GameWins;

      // Tiebreak 1: Head-to-head game wins
      const h2hNet = (h2h[a.TeamSeasonID]?.[b.TeamSeasonID]) || 0;
      if (h2hNet !== 0) return h2hNet > 0 ? -1 : 1;

      // Tiebreak 2: 501 team average PPR (higher is better)
      const ppr501Diff = (ppr501[a.TeamSeasonID] || 0) - (ppr501[b.TeamSeasonID] || 0);
      if (Math.abs(ppr501Diff) > 0.001) return ppr501Diff > 0 ? -1 : 1;

      // Tiebreak 3: Cricket team average MPR (higher is better)
      const mprDiff = (mprCricket[a.TeamSeasonID] || 0) - (mprCricket[b.TeamSeasonID] || 0);
      if (Math.abs(mprDiff) > 0.001) return mprDiff > 0 ? -1 : 1;

      // Tiebreak 4: 301 team average PPR (higher is better)
      const ppr301Diff = (ppr301[a.TeamSeasonID] || 0) - (ppr301[b.TeamSeasonID] || 0);
      if (Math.abs(ppr301Diff) > 0.001) return ppr301Diff > 0 ? -1 : 1;

      // Tiebreak 5: Most All-Stars combined (higher is better)
      const asDiff = (allStars[a.TeamSeasonID] || 0) - (allStars[b.TeamSeasonID] || 0);
      if (asDiff !== 0) return asDiff > 0 ? -1 : 1;

      // Tiebreak 6: Highest OUT score (higher is better)
      const outDiff = (highOut[a.TeamSeasonID] || 0) - (highOut[b.TeamSeasonID] || 0);
      if (outDiff !== 0) return outDiff > 0 ? -1 : 1;

      // Tiebreak 7: Highest IN score (higher is better)
      const inDiff = (highIn[a.TeamSeasonID] || 0) - (highIn[b.TeamSeasonID] || 0);
      if (inDiff !== 0) return inDiff > 0 ? -1 : 1;

      // Tiebreak 8: Coin flip (random)
      return Math.random() - 0.5;
    });

    return sorted.slice(0, 4);
  },

  async createMakeUpRound(seasonId: number, input: MakeUpRoundInput): Promise<any> {
    const pool = await getPool();
    if (!input.matchDate) {
      throw new AppError(400, 'MatchDate is required for a make-up week');
    }

    const teamSeasons = await this.getTeamSeasons(seasonId);
    if (teamSeasons.length < 2) {
      throw new AppError(400, 'Need at least 2 teams in the season before adding a make-up week');
    }

    const placeholderDate = new Date(`${input.matchDate}T00:00:00Z`);
    const firstTeamSeasonId = teamSeasons[0].TeamSeasonID;
    const secondTeamSeasonId = teamSeasons[1].TeamSeasonID;

    const shiftedRounds = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .input('placeholderDate', sql.DateTime2, placeholderDate)
      .query(`
        SELECT MatchID, RoundNumber
        FROM Matches
        WHERE SeasonID = @seasonId
          AND IsPlayoff = 0
          AND MatchDate >= @placeholderDate
        ORDER BY MatchDate, RoundNumber, MatchID
      `);

    const insertRound = shiftedRounds.recordset.length > 0
      ? shiftedRounds.recordset[0].RoundNumber
      : ((await pool.request()
        .input('seasonId', sql.Int, seasonId)
        .query(`
          SELECT ISNULL(MAX(RoundNumber), 0) AS MaxRound
          FROM Matches
          WHERE SeasonID = @seasonId AND IsPlayoff = 0
        `)).recordset[0].MaxRound + 1);

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .input('placeholderDate', sql.DateTime2, placeholderDate)
      .query(`
        UPDATE Matches
        SET RoundNumber = RoundNumber + 1,
            MatchDate = DATEADD(day, 7, MatchDate),
            UpdatedAt = SYSUTCDATETIME()
        WHERE SeasonID = @seasonId
          AND IsPlayoff = 0
          AND MatchDate >= @placeholderDate
      `);

    const result = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .input('home', sql.Int, firstTeamSeasonId)
      .input('away', sql.Int, secondTeamSeasonId)
      .input('round', sql.Int, insertRound)
      .input('matchDate', sql.DateTime2, placeholderDate)
      .query(`
        INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, MatchDate, PlayoffRound)
        OUTPUT INSERTED.*
        VALUES (@seasonId, @home, @away, @round, @matchDate, 'MakeUp')
      `);

    return result.recordset[0];
  },

  async updateScheduleDates(seasonId: number, matchIds: number[], matchDate: string): Promise<number> {
    if (!matchDate) {
      throw new AppError(400, 'MatchDate is required');
    }

    if (!Array.isArray(matchIds) || matchIds.length === 0) {
      throw new AppError(400, 'At least one match must be selected');
    }

    const pool = await getPool();
    const normalizedIds = [...new Set(matchIds.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];
    if (normalizedIds.length === 0) {
      throw new AppError(400, 'At least one valid match must be selected');
    }

    const placeholderParams = normalizedIds.map((_, index) => `@matchId${index}`).join(', ');
    const request = pool.request()
      .input('seasonId', sql.Int, seasonId)
      .input('matchDate', sql.DateTime2, new Date(`${matchDate}T00:00:00Z`));

    normalizedIds.forEach((id, index) => {
      request.input(`matchId${index}`, sql.Int, id);
    });

    const result = await request.query(`
      UPDATE Matches
      SET MatchDate = @matchDate,
          UpdatedAt = SYSUTCDATETIME()
      WHERE SeasonID = @seasonId
        AND MatchID IN (${placeholderParams})
    `);

    return result.rowsAffected[0] ?? 0;
  },

  async deleteSeason(seasonId: number): Promise<void> {
    const pool = await getPool();

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('UPDATE Seasons SET ChampionTeamSeasonID = NULL WHERE SeasonID = @seasonId');

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        DELETE FROM CricketTurns
        WHERE GameID IN (
          SELECT g.GameID
          FROM Games g
          JOIN Matches m ON m.MatchID = g.MatchID
          WHERE m.SeasonID = @seasonId
        )
      `);

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        DELETE FROM Turns
        WHERE GameID IN (
          SELECT g.GameID
          FROM Games g
          JOIN Matches m ON m.MatchID = g.MatchID
          WHERE m.SeasonID = @seasonId
        )
      `);

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        DELETE FROM CricketState
        WHERE GameID IN (
          SELECT g.GameID
          FROM Games g
          JOIN Matches m ON m.MatchID = g.MatchID
          WHERE m.SeasonID = @seasonId
        )
      `);

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        DELETE FROM GamePlayers
        WHERE GameID IN (
          SELECT g.GameID
          FROM Games g
          JOIN Matches m ON m.MatchID = g.MatchID
          WHERE m.SeasonID = @seasonId
        )
      `);

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        DELETE FROM Games
        WHERE MatchID IN (SELECT MatchID FROM Matches WHERE SeasonID = @seasonId)
      `);

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('DELETE FROM Matches WHERE SeasonID = @seasonId');

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('DELETE FROM SeasonGameFormats WHERE SeasonID = @seasonId');

    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('DELETE FROM TeamSeasons WHERE SeasonID = @seasonId');

    const result = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('DELETE FROM Seasons WHERE SeasonID = @seasonId');

    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new AppError(404, 'Season not found');
    }
  },

  /* =============================== */
  /*  Team-Season Setup               */
  /* =============================== */

  async updateTeamSeason(teamSeasonId: number, input: { TeamColor?: string; TeamNickname?: string }): Promise<TeamSeason | null> {
    const pool = await getPool();
    const sets: string[] = [];
    const request = pool.request().input('id', sql.Int, teamSeasonId);

    if (input.TeamColor !== undefined) {
      sets.push('TeamColor = @TeamColor');
      request.input('TeamColor', sql.NVarChar(7), input.TeamColor || null);
    }
    if (input.TeamNickname !== undefined) {
      sets.push('TeamNickname = @TeamNickname');
      request.input('TeamNickname', sql.NVarChar(100), input.TeamNickname || null);
    }

    if (sets.length === 0) return null;

    await request.query(`UPDATE TeamSeasons SET ${sets.join(', ')} WHERE TeamSeasonID = @id`);

    // Return updated record with joins
    const result = await pool.request()
      .input('id', sql.Int, teamSeasonId)
      .query(`
        SELECT ts.*,
          t.TeamName,
          p1.FirstName AS Player1FirstName, p1.LastName AS Player1LastName,
          p2.FirstName AS Player2FirstName, p2.LastName AS Player2LastName
        FROM TeamSeasons ts
        JOIN Teams t ON ts.TeamID = t.TeamID
        JOIN Players p1 ON t.Player1ID = p1.PlayerID
        JOIN Players p2 ON t.Player2ID = p2.PlayerID
        WHERE ts.TeamSeasonID = @id
      `);
    return result.recordset[0] || null;
  },

  /* =============================== */
  /*  Season Game Formats             */
  /* =============================== */

  async getGameFormats(seasonId: number): Promise<any[]> {
    const pool = await getPool();
    const result = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('SELECT * FROM SeasonGameFormats WHERE SeasonID = @seasonId ORDER BY GameNumber');
    return result.recordset;
  },

  async setGameFormats(seasonId: number, formats: { GameNumber: number; GameType: string; X01Target?: number; DoubleInRequired?: boolean }[]): Promise<any[]> {
    const pool = await getPool();

    // Delete existing formats for this season
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('DELETE FROM SeasonGameFormats WHERE SeasonID = @seasonId');

    // Insert new formats
    for (const f of formats) {
      await pool.request()
        .input('seasonId', sql.Int, seasonId)
        .input('gameNumber', sql.Int, f.GameNumber)
        .input('gameType', sql.NVarChar(20), f.GameType)
        .input('x01Target', sql.Int, f.X01Target || null)
        .input('doubleIn', sql.Bit, f.DoubleInRequired || false)
        .query(`
          INSERT INTO SeasonGameFormats (SeasonID, GameNumber, GameType, X01Target, DoubleInRequired)
          VALUES (@seasonId, @gameNumber, @gameType, @x01Target, @doubleIn)
        `);
    }

    return this.getGameFormats(seasonId);
  },
};
