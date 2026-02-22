import { getPool, sql } from '../config/database';
import { Season, TeamSeason } from '../types';
import { AppError } from '../middleware/errorHandler';

export interface CreateSeasonInput {
  SeasonName: string;
  StartDate?: string;
  EndDate?: string;
}

export const seasonService = {
  async getAll(): Promise<Season[]> {
    const pool = await getPool();
    const result = await pool.request().query(
      'SELECT * FROM Seasons ORDER BY CreatedAt DESC'
    );
    return result.recordset;
  },

  async getById(id: number): Promise<Season | null> {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Seasons WHERE SeasonID = @id');
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
    return result.recordset[0];
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

  async generateSchedule(seasonId: number): Promise<number> {
    const pool = await getPool();
    const teamSeasons = await this.getTeamSeasons(seasonId);

    if (teamSeasons.length < 2) {
      throw new AppError(400, 'Need at least 2 teams to generate a schedule');
    }

    // Delete existing non-playoff matches for this season
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('DELETE FROM Matches WHERE SeasonID = @seasonId AND IsPlayoff = 0');

    // Round-robin: every team plays every other team
    const ids = teamSeasons.map(ts => ts.TeamSeasonID);
    let round = 1;
    let matchCount = 0;

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
          .query(`
            INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber)
            VALUES (@seasonId, @home, @away, @round)
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
    const standings = await this.getTeamSeasons(seasonId);

    if (standings.length < 4) {
      throw new AppError(400, 'Need at least 4 teams for playoffs');
    }

    // Delete existing playoff matches
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query('DELETE FROM Matches WHERE SeasonID = @seasonId AND IsPlayoff = 1');

    // Assign seeds to top 4
    const top4 = standings.slice(0, 4);
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

    // 1 vs 4
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .input('home', sql.Int, top4[0].TeamSeasonID)
      .input('away', sql.Int, top4[3].TeamSeasonID)
      .input('round', sql.Int, semiRound)
      .query(`
        INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, IsPlayoff, PlayoffRound)
        VALUES (@seasonId, @home, @away, @round, 1, 'Semi')
      `);

    // 2 vs 3
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .input('home', sql.Int, top4[1].TeamSeasonID)
      .input('away', sql.Int, top4[2].TeamSeasonID)
      .input('round', sql.Int, semiRound)
      .query(`
        INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, IsPlayoff, PlayoffRound)
        VALUES (@seasonId, @home, @away, @round, 1, 'Semi')
      `);

    // Finals slot will be created after semi results are in
    await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query("UPDATE Seasons SET Status = 'Playoffs', UpdatedAt = SYSUTCDATETIME() WHERE SeasonID = @seasonId");
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
