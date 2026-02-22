import { getPool, sql } from '../config/database';
import { Match } from '../types';

export const matchService = {
  /** Get all in-progress matches with their games (exclude completed ad-hoc) */
  async getLive(): Promise<any[]> {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT m.*,
        ht.TeamName AS HomeTeamName,
        at2.TeamName AS AwayTeamName,
        s.SeasonName
      FROM Matches m
      JOIN TeamSeasons hts ON m.HomeTeamSeasonID = hts.TeamSeasonID
      JOIN Teams ht ON hts.TeamID = ht.TeamID
      JOIN TeamSeasons ats ON m.AwayTeamSeasonID = ats.TeamSeasonID
      JOIN Teams at2 ON ats.TeamID = at2.TeamID
      JOIN Seasons s ON m.SeasonID = s.SeasonID
      WHERE m.Status = 'InProgress'
        AND NOT (s.SeasonName = 'Ad-Hoc Play' AND m.Status = 'Completed')
      ORDER BY m.UpdatedAt DESC
    `);
    // Attach games to each match
    for (const match of result.recordset) {
      const games = await pool.request()
        .input('matchId', sql.Int, match.MatchID)
        .query(`
          SELECT g.*, gp.PlayerID, gp.TeamSeasonID, p.FirstName, p.LastName
          FROM Games g
          LEFT JOIN GamePlayers gp ON g.GameID = gp.GameID
          LEFT JOIN Players p ON gp.PlayerID = p.PlayerID
          WHERE g.MatchID = @matchId
          ORDER BY g.GameNumber, gp.PlayerOrder
        `);
      // Group games
      const gamesMap: Record<number, any> = {};
      for (const row of games.recordset) {
        if (!gamesMap[row.GameID]) {
          gamesMap[row.GameID] = { ...row, players: [] };
          delete gamesMap[row.GameID].PlayerID;
          delete gamesMap[row.GameID].FirstName;
          delete gamesMap[row.GameID].LastName;
        }
        if (row.PlayerID) {
          gamesMap[row.GameID].players.push({
            PlayerID: row.PlayerID,
            TeamSeasonID: row.TeamSeasonID,
            FirstName: row.FirstName,
            LastName: row.LastName,
          });
        }
      }
      match.games = Object.values(gamesMap);

      // Attach live scores for in-progress games
      for (const game of match.games) {
        if (game.Status !== 'InProgress') continue;

        if (game.GameType === 'X01') {
          // Get latest remaining score per team
          const x01Res = await pool.request()
            .input('gid', sql.Int, game.GameID)
            .query(`
              SELECT ts.TeamSeasonID, ts.RemainingScore
              FROM (
                SELECT TeamSeasonID, RemainingScore,
                  ROW_NUMBER() OVER (PARTITION BY TeamSeasonID ORDER BY TurnNumber DESC) AS rn
                FROM Turns WHERE GameID = @gid
              ) ts WHERE ts.rn = 1
            `);
          const remaining: Record<number, number> = {};
          for (const r of x01Res.recordset) {
            remaining[r.TeamSeasonID] = r.RemainingScore;
          }
          game.liveScore = {
            type: 'X01',
            homeRemaining: remaining[match.HomeTeamSeasonID] ?? game.X01Target ?? 501,
            awayRemaining: remaining[match.AwayTeamSeasonID] ?? game.X01Target ?? 501,
          };
        } else if (game.GameType === 'Cricket' || game.GameType === 'Shanghai') {
          // Get points per team from CricketState
          const csRes = await pool.request()
            .input('gid', sql.Int, game.GameID)
            .query(`SELECT TeamSeasonID, Points FROM CricketState WHERE GameID = @gid`);
          const points: Record<number, number> = {};
          for (const r of csRes.recordset) {
            points[r.TeamSeasonID] = r.Points;
          }
          game.liveScore = {
            type: game.GameType,
            homePoints: points[match.HomeTeamSeasonID] ?? 0,
            awayPoints: points[match.AwayTeamSeasonID] ?? 0,
          };
        }
      }
    }
    return result.recordset;
  },

  async getBySeason(seasonId: number): Promise<Match[]> {
    const pool = await getPool();
    const result = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        SELECT m.*,
          ht.TeamName AS HomeTeamName,
          at2.TeamName AS AwayTeamName
        FROM Matches m
        JOIN TeamSeasons hts ON m.HomeTeamSeasonID = hts.TeamSeasonID
        JOIN Teams ht ON hts.TeamID = ht.TeamID
        JOIN TeamSeasons ats ON m.AwayTeamSeasonID = ats.TeamSeasonID
        JOIN Teams at2 ON ats.TeamID = at2.TeamID
        WHERE m.SeasonID = @seasonId
        ORDER BY m.RoundNumber, m.MatchID
      `);
    return result.recordset;
  },

  async getById(id: number): Promise<Match | null> {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT m.*,
          ht.TeamName AS HomeTeamName,
          at2.TeamName AS AwayTeamName
        FROM Matches m
        JOIN TeamSeasons hts ON m.HomeTeamSeasonID = hts.TeamSeasonID
        JOIN Teams ht ON hts.TeamID = ht.TeamID
        JOIN TeamSeasons ats ON m.AwayTeamSeasonID = ats.TeamSeasonID
        JOIN Teams at2 ON ats.TeamID = at2.TeamID
        WHERE m.MatchID = @id
      `);
    return result.recordset[0] || null;
  },

  async updateStatus(id: number, status: string, winnerTeamSeasonId?: number): Promise<Match | null> {
    const pool = await getPool();
    const request = pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.NVarChar(20), status);

    if (winnerTeamSeasonId !== undefined) {
      request.input('winner', sql.Int, winnerTeamSeasonId);
      await request.query(`
        UPDATE Matches SET Status = @status, WinnerTeamSeasonID = @winner, UpdatedAt = SYSUTCDATETIME()
        WHERE MatchID = @id
      `);
    } else {
      await request.query(`
        UPDATE Matches SET Status = @status, UpdatedAt = SYSUTCDATETIME()
        WHERE MatchID = @id
      `);
    }

    return this.getById(id);
  },

  async coinToss(id: number): Promise<{ result: string }> {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('result', sql.NVarChar(10), result)
      .query(`
        UPDATE Matches SET CoinTossResult = @result, UpdatedAt = SYSUTCDATETIME()
        WHERE MatchID = @id
      `);
    return { result };
  },

  async setCoinTossWinner(id: number, teamSeasonId: number): Promise<void> {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('tsId', sql.Int, teamSeasonId)
      .query(`
        UPDATE Matches SET CoinTossWinnerTSID = @tsId, UpdatedAt = SYSUTCDATETIME()
        WHERE MatchID = @id
      `);
  },
};
