import { getPool, sql } from '../config/database';
import { PlayerStats } from '../types';

export const statsService = {
  async getPlayerStats(playerId: number, seasonId?: number): Promise<PlayerStats | null> {
    const pool = await getPool();
    const request = pool.request().input('playerId', sql.Int, playerId);

    // Season filters for each table alias
    let turnsFilter = '';
    let cricketFilter = '';
    let gpFilter = '';
    if (seasonId) {
      request.input('seasonId', sql.Int, seasonId);
      turnsFilter = 'AND t.TeamSeasonID IN (SELECT TeamSeasonID FROM TeamSeasons WHERE SeasonID = @seasonId)';
      cricketFilter = 'AND ct.TeamSeasonID IN (SELECT TeamSeasonID FROM TeamSeasons WHERE SeasonID = @seasonId)';
      gpFilter = 'AND gp.TeamSeasonID IN (SELECT TeamSeasonID FROM TeamSeasons WHERE SeasonID = @seasonId)';
    }

    // PPD: total X01 points scored / total darts thrown in X01 games
    const ppdResult = await request.query(`
      SELECT
        CASE WHEN SUM(t.DartsThrown) > 0
          THEN CAST(SUM(t.Score) AS FLOAT) / SUM(t.DartsThrown)
          ELSE 0
        END AS PPD,
        SUM(t.DartsThrown) AS X01Darts
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      WHERE t.PlayerID = @playerId AND g.GameType = 'X01' ${turnsFilter}
    `);

    // MPR: total marks / total rounds in Cricket + Shanghai games
    // Cricket data is in CricketTurns; Shanghai data is in Turns (Shanghai only)
    const request2 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request2.input('seasonId', sql.Int, seasonId);

    const mprResult = await request2.query(`
      SELECT
        CASE WHEN COUNT(DISTINCT CONCAT(src.GameID, '-', src.RoundNumber)) > 0
          THEN CAST(SUM(ISNULL(src.MarksScored, 0)) AS FLOAT) / COUNT(DISTINCT CONCAT(src.GameID, '-', src.RoundNumber))
          ELSE 0
        END AS MPR,
        SUM(CASE WHEN src.GameType = 'Cricket' THEN src.DartsThrown ELSE 0 END) AS CricketDarts,
        SUM(CASE WHEN src.GameType = 'Shanghai' THEN src.DartsThrown ELSE 0 END) AS ShanghaiDarts
      FROM (
        SELECT ct.GameID, ct.RoundNumber, ct.MarksScored, ct.DartsThrown, ct.TeamSeasonID, 'Cricket' AS GameType
        FROM CricketTurns ct
        JOIN Games g ON ct.GameID = g.GameID
        WHERE ct.PlayerID = @playerId AND g.GameType = 'Cricket'
        UNION ALL
        SELECT t.GameID, t.RoundNumber, t.MarksScored, t.DartsThrown, t.TeamSeasonID, 'Shanghai' AS GameType
        FROM Turns t
        JOIN Games g ON t.GameID = g.GameID
        WHERE t.PlayerID = @playerId AND g.GameType = 'Shanghai'
      ) src
      WHERE 1=1 ${seasonId ? 'AND src.TeamSeasonID IN (SELECT TeamSeasonID FROM TeamSeasons WHERE SeasonID = @seasonId)' : ''}
    `);

    // INs (count, avg, highest)
    const request3 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request3.input('seasonId', sql.Int, seasonId);

    const insResult = await request3.query(`
      SELECT
        COUNT(*) AS InCount,
        CASE WHEN COUNT(*) > 0
          THEN AVG(CAST(COALESCE(CAST(JSON_VALUE(t.Details, '$.inScore') AS INT), t.Score) AS FLOAT))
          ELSE 0 END AS InAvg,
        ISNULL(MAX(COALESCE(CAST(JSON_VALUE(t.Details, '$.inScore') AS INT), t.Score)), 0) AS HighestIn
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      WHERE t.PlayerID = @playerId AND t.IsDoubleIn = 1 ${turnsFilter}
    `);

    // OUTs (count, avg, highest)
    const request4 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request4.input('seasonId', sql.Int, seasonId);

    const outsResult = await request4.query(`
      SELECT
        COUNT(*) AS OutCount,
        CASE WHEN COUNT(*) > 0
          THEN AVG(CAST(COALESCE(CAST(JSON_VALUE(t.Details, '$.outScore') AS INT), t.Score) AS FLOAT))
          ELSE 0 END AS OutAvg,
        ISNULL(MAX(COALESCE(CAST(JSON_VALUE(t.Details, '$.outScore') AS INT), t.Score)), 0) AS HighestOut
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      WHERE t.PlayerID = @playerId AND t.IsGameOut = 1 ${turnsFilter}
    `);

    // CLOSEs — Cricket from CricketTurns, Shanghai from Turns
    const request5 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request5.input('seasonId', sql.Int, seasonId);

    const closesResult = await request5.query(`
      SELECT (
        (SELECT COUNT(*) FROM CricketTurns ct
         JOIN Games g ON ct.GameID = g.GameID
         WHERE ct.PlayerID = @playerId AND ct.IsCricketClose = 1 AND g.GameType = 'Cricket'
         ${cricketFilter})
        +
        (SELECT COUNT(*) FROM Turns t
         JOIN Games g ON t.GameID = g.GameID
         WHERE t.PlayerID = @playerId AND t.IsCricketClose = 1 AND g.GameType = 'Shanghai'
         ${turnsFilter})
      ) AS CloseCount
    `);

    // Total games
    const request6 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request6.input('seasonId', sql.Int, seasonId);

    const gamesResult = await request6.query(`
      SELECT COUNT(DISTINCT gp.GameID) AS TotalGames
      FROM GamePlayers gp
      JOIN Games g ON gp.GameID = g.GameID
      WHERE gp.PlayerID = @playerId ${gpFilter}
    `);

    // Player info
    const playerResult = await pool.request()
      .input('pid', sql.Int, playerId)
      .query('SELECT FirstName, LastName FROM Players WHERE PlayerID = @pid');

    // All-Stars from Turns (X01, RoundTheWorld, Shanghai)
    const request7 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request7.input('seasonId', sql.Int, seasonId);
    const allStarTurns = await request7.query(`
      SELECT ISNULL(SUM(CAST(JSON_VALUE(t.Details, '$.allStarCount') AS INT)), 0) AS Cnt
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      WHERE t.PlayerID = @playerId
        AND t.Details IS NOT NULL
        AND JSON_VALUE(t.Details, '$.allStarCount') IS NOT NULL
        ${turnsFilter}
    `);

    // All-Stars from CricketTurns (Cricket, Shanghai cricket turns)
    const request8 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request8.input('seasonId', sql.Int, seasonId);
    const allStarCricket = await request8.query(`
      SELECT ISNULL(SUM(CAST(JSON_VALUE(ct.Details, '$.allStarCount') AS INT)), 0) AS Cnt
      FROM CricketTurns ct
      JOIN Games g ON ct.GameID = g.GameID
      WHERE ct.PlayerID = @playerId
        AND ct.Details IS NOT NULL
        AND JSON_VALUE(ct.Details, '$.allStarCount') IS NOT NULL
        ${cricketFilter}
    `);

    const allStarCount = (allStarTurns.recordset[0].Cnt || 0) + (allStarCricket.recordset[0].Cnt || 0);

    if (!playerResult.recordset[0]) return null;

    return {
      PlayerID: playerId,
      FirstName: playerResult.recordset[0].FirstName,
      LastName: playerResult.recordset[0].LastName,
      TotalGames: gamesResult.recordset[0].TotalGames,
      PPD: Math.round((ppdResult.recordset[0].PPD || 0) * 100) / 100,
      MPR: Math.round((mprResult.recordset[0].MPR || 0) * 100) / 100,
      InCount: insResult.recordset[0].InCount,
      InAvg: Math.round((insResult.recordset[0].InAvg || 0) * 100) / 100,
      HighestIn: insResult.recordset[0].HighestIn || 0,
      OutCount: outsResult.recordset[0].OutCount,
      OutAvg: Math.round((outsResult.recordset[0].OutAvg || 0) * 100) / 100,
      HighestOut: outsResult.recordset[0].HighestOut || 0,
      CloseCount: closesResult.recordset[0].CloseCount,
      AllStarCount: allStarCount,
      CricketDarts: mprResult.recordset[0].CricketDarts || 0,
      ShanghaiDarts: mprResult.recordset[0].ShanghaiDarts || 0,
      X01Darts: ppdResult.recordset[0].X01Darts || 0,
    };
  },

  async getPlayerSeasonHistory(playerId: number): Promise<any[]> {
    const pool = await getPool();

    // Main stats from Turns (X01, Shanghai, RoundTheWorld)
    const result = await pool.request()
      .input('playerId', sql.Int, playerId)
      .query(`
        SELECT
          s.SeasonID,
          s.SeasonName,
          COUNT(DISTINCT gp.GameID) AS GamesPlayed,
          -- PPD
          CASE WHEN SUM(CASE WHEN g.GameType = 'X01' THEN t.DartsThrown ELSE 0 END) > 0
            THEN CAST(SUM(CASE WHEN g.GameType = 'X01' THEN t.Score ELSE 0 END) AS FLOAT)
                 / SUM(CASE WHEN g.GameType = 'X01' THEN t.DartsThrown ELSE 0 END)
            ELSE 0 END AS PPD,
          -- Shanghai marks/rounds for MPR
          SUM(CASE WHEN g.GameType = 'Shanghai' THEN ISNULL(t.MarksScored, 0) ELSE 0 END) AS ShanghaiMarks,
          COUNT(DISTINCT CASE WHEN g.GameType = 'Shanghai' THEN CONCAT(g.GameID, '-', t.RoundNumber) END) AS ShanghaiRounds,
          -- INs / OUTs
          SUM(CASE WHEN t.IsDoubleIn = 1 THEN 1 ELSE 0 END) AS InCount,
          SUM(CASE WHEN t.IsGameOut = 1 THEN 1 ELSE 0 END) AS OutCount,
          -- Close from Turns (Shanghai)
          SUM(CASE WHEN t.IsCricketClose = 1 THEN 1 ELSE 0 END) AS TurnsCloseCount,
          -- AllStars from Turns
          ISNULL(SUM(CAST(JSON_VALUE(t.Details, '$.allStarCount') AS INT)), 0) AS TurnsAllStarCount,
          -- Wins
          COUNT(DISTINCT CASE WHEN g.WinnerTeamSeasonID = gp.TeamSeasonID THEN g.GameID END) AS Wins
        FROM GamePlayers gp
        JOIN Games g ON gp.GameID = g.GameID
        JOIN TeamSeasons ts ON gp.TeamSeasonID = ts.TeamSeasonID
        JOIN Seasons s ON ts.SeasonID = s.SeasonID
        LEFT JOIN Turns t ON t.GameID = g.GameID AND t.PlayerID = @playerId
        WHERE gp.PlayerID = @playerId AND g.Status = 'Completed'
        GROUP BY s.SeasonID, s.SeasonName
        ORDER BY s.SeasonID
      `);

    // Cricket data from CricketTurns
    const cricketResult = await pool.request()
      .input('playerId', sql.Int, playerId)
      .query(`
        SELECT
          s.SeasonID,
          COUNT(DISTINCT CONCAT(ct.GameID, '-', ct.RoundNumber)) AS CricketRounds,
          SUM(ISNULL(ct.MarksScored, 0)) AS CricketMarks,
          SUM(CASE WHEN ct.IsCricketClose = 1 THEN 1 ELSE 0 END) AS CricketCloseCount,
          ISNULL(SUM(CAST(JSON_VALUE(ct.Details, '$.allStarCount') AS INT)), 0) AS CricketAllStarCount
        FROM CricketTurns ct
        JOIN Games g ON ct.GameID = g.GameID
        JOIN GamePlayers gp ON gp.GameID = g.GameID AND gp.PlayerID = @playerId
        JOIN TeamSeasons ts ON gp.TeamSeasonID = ts.TeamSeasonID
        JOIN Seasons s ON ts.SeasonID = s.SeasonID
        WHERE ct.PlayerID = @playerId AND g.Status = 'Completed' AND g.GameType = 'Cricket'
        GROUP BY s.SeasonID
      `);

    const cricketMap = new Map<number, any>();
    for (const row of cricketResult.recordset) {
      cricketMap.set(row.SeasonID, row);
    }

    return result.recordset.map((row: any) => {
      const cricket = cricketMap.get(row.SeasonID);
      const cricketRounds = cricket?.CricketRounds || 0;
      const cricketMarks = cricket?.CricketMarks || 0;
      const shanghaiRounds = row.ShanghaiRounds || 0;
      const shanghaiMarks = row.ShanghaiMarks || 0;
      const totalMPRRounds = cricketRounds + shanghaiRounds;
      const totalMPRMarks = cricketMarks + shanghaiMarks;
      const mpr = totalMPRRounds > 0 ? totalMPRMarks / totalMPRRounds : 0;

      return {
        SeasonID: row.SeasonID,
        SeasonName: row.SeasonName,
        GamesPlayed: row.GamesPlayed,
        Wins: row.Wins,
        PPD: Math.round((row.PPD || 0) * 100) / 100,
        MPR: Math.round(mpr * 100) / 100,
        InCount: row.InCount || 0,
        OutCount: row.OutCount || 0,
        CloseCount: (row.TurnsCloseCount || 0) + (cricket?.CricketCloseCount || 0),
        AllStarCount: (row.TurnsAllStarCount || 0) + (cricket?.CricketAllStarCount || 0),
      };
    });
  },

  async getTeamStats(teamSeasonId: number): Promise<any> {
    const pool = await getPool();

    const teamResult = await pool.request()
      .input('tsId', sql.Int, teamSeasonId)
      .query(`
        SELECT ts.*, t.TeamName, t.Player1ID, t.Player2ID
        FROM TeamSeasons ts
        JOIN Teams t ON ts.TeamID = t.TeamID
        WHERE ts.TeamSeasonID = @tsId
      `);

    if (!teamResult.recordset[0]) return null;

    const team = teamResult.recordset[0];
    const player1Stats = await this.getPlayerStats(team.Player1ID, team.SeasonID);
    const player2Stats = team.Player2ID ? await this.getPlayerStats(team.Player2ID, team.SeasonID) : null;

    return {
      TeamSeasonID: teamSeasonId,
      TeamName: team.TeamName,
      Record: { Wins: team.Wins, Losses: team.Losses, Draws: team.Draws },
      PointsFor: team.PointsFor,
      PointsAgainst: team.PointsAgainst,
      Player1: player1Stats,
      Player2: player2Stats,
      CombinedPPD: player1Stats && player2Stats
        ? Math.round(((player1Stats.PPD + player2Stats.PPD) / 2) * 100) / 100
        : 0,
      CombinedMPR: player1Stats && player2Stats
        ? Math.round(((player1Stats.MPR + player2Stats.MPR) / 2) * 100) / 100
        : 0,
    };
  },

  async getSeasonLeaderboard(seasonId: number): Promise<any> {
    const pool = await getPool();
    const result = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        ;WITH PlayerGames AS (
          SELECT DISTINCT gp.PlayerID, gp.GameID
          FROM GamePlayers gp
          JOIN Games g ON gp.GameID = g.GameID
          JOIN Matches m ON g.MatchID = m.MatchID
          WHERE m.SeasonID = @seasonId AND g.Status = 'Completed'
        ),
        X01Stats AS (
          SELECT t.PlayerID,
            SUM(t.Score) AS TotalX01Score,
            SUM(t.DartsThrown) AS TotalX01Darts,
            SUM(CASE WHEN t.IsDoubleIn = 1 THEN 1 ELSE 0 END) AS InCount,
            SUM(CASE WHEN t.IsGameOut = 1 THEN 1 ELSE 0 END) AS OutCount,
            CASE WHEN SUM(CASE WHEN t.IsGameOut = 1 THEN 1 ELSE 0 END) > 0
              THEN AVG(CASE WHEN t.IsGameOut = 1 THEN CAST(COALESCE(CAST(JSON_VALUE(t.Details, '$.outScore') AS INT), t.Score) AS FLOAT) END)
              ELSE 0 END AS OutAvg,
            CASE WHEN SUM(CASE WHEN t.IsDoubleIn = 1 THEN 1 ELSE 0 END) > 0
              THEN AVG(CASE WHEN t.IsDoubleIn = 1 THEN CAST(COALESCE(CAST(JSON_VALUE(t.Details, '$.inScore') AS INT), t.Score) AS FLOAT) END)
              ELSE 0 END AS InAvg,
            ISNULL(SUM(CAST(JSON_VALUE(t.Details, '$.allStarCount') AS INT)), 0) AS TurnAllStars
          FROM Turns t
          JOIN Games g ON t.GameID = g.GameID
          JOIN Matches m ON g.MatchID = m.MatchID
          WHERE m.SeasonID = @seasonId AND t.PlayerID IN (SELECT PlayerID FROM PlayerGames)
          GROUP BY t.PlayerID
        ),
        CricketStats AS (
          SELECT src.PlayerID,
            SUM(src.MarksScored) AS TotalMarks,
            COUNT(DISTINCT CONCAT(src.GameID, '-', src.RoundNumber)) AS TotalRounds,
            SUM(src.DartsThrown) AS TotalCricketDarts,
            SUM(CASE WHEN src.IsCricketClose = 1 THEN 1 ELSE 0 END) AS CloseCount,
            SUM(src.AllStarHit) AS CricketAllStars
          FROM (
            SELECT ct.PlayerID, ct.MarksScored, ct.DartsThrown, ct.GameID, ct.RoundNumber,
              ct.IsCricketClose,
              ISNULL(CAST(JSON_VALUE(ct.Details, '$.allStarCount') AS INT), 0) AS AllStarHit
            FROM CricketTurns ct
            JOIN Games g ON ct.GameID = g.GameID
            JOIN Matches m ON g.MatchID = m.MatchID
            WHERE m.SeasonID = @seasonId AND g.GameType = 'Cricket'
              AND ct.PlayerID IN (SELECT PlayerID FROM PlayerGames)
            UNION ALL
            SELECT t.PlayerID, t.MarksScored, t.DartsThrown, t.GameID, t.RoundNumber,
              t.IsCricketClose,
              ISNULL(CAST(JSON_VALUE(t.Details, '$.allStarCount') AS INT), 0) AS AllStarHit
            FROM Turns t
            JOIN Games g ON t.GameID = g.GameID
            JOIN Matches m ON g.MatchID = m.MatchID
            WHERE m.SeasonID = @seasonId AND g.GameType = 'Shanghai'
              AND t.PlayerID IN (SELECT PlayerID FROM PlayerGames)
          ) src
          GROUP BY src.PlayerID
        )
        SELECT p.PlayerID, p.FirstName, p.LastName,
          (SELECT COUNT(*) FROM PlayerGames pg WHERE pg.PlayerID = p.PlayerID) AS GamesPlayed,
          CASE WHEN ISNULL(x.TotalX01Darts, 0) > 0
            THEN CAST(x.TotalX01Score AS FLOAT) / x.TotalX01Darts ELSE 0
          END AS PPD,
          CASE WHEN ISNULL(c.TotalRounds, 0) > 0
            THEN CAST(c.TotalMarks AS FLOAT) / c.TotalRounds ELSE 0
          END AS MPR,
          ISNULL(x.InCount, 0) AS InCount,
          ISNULL(x.OutCount, 0) AS OutCount,
          ISNULL(x.OutAvg, 0) AS OutAvg,
          ISNULL(x.InAvg, 0) AS InAvg,
          ISNULL(c.CloseCount, 0) AS CloseCount,
          ISNULL(x.TurnAllStars, 0) + ISNULL(c.CricketAllStars, 0) AS AllStarCount,
          ISNULL(x.TotalX01Darts, 0) AS X01Darts,
          ISNULL(c.TotalCricketDarts, 0) AS CricketDarts
        FROM Players p
        JOIN (SELECT DISTINCT PlayerID FROM PlayerGames) pg ON p.PlayerID = pg.PlayerID
        LEFT JOIN X01Stats x ON p.PlayerID = x.PlayerID
        LEFT JOIN CricketStats c ON p.PlayerID = c.PlayerID
        ORDER BY PPD DESC
      `);
    return result.recordset;
  },

  /** Per-game stats log for a player (optionally filtered by season) */
  async getPlayerGameLog(playerId: number, seasonId?: number): Promise<any[]> {
    const pool = await getPool();
    const request = pool.request().input('playerId', sql.Int, playerId);
    let seasonFilter = '';
    if (seasonId) {
      request.input('seasonId', sql.Int, seasonId);
      seasonFilter = 'AND m.SeasonID = @seasonId';
    }

    const result = await request.query(`
      SELECT
        g.GameID, g.GameType, g.GameNumber, g.X01Target, g.Status AS GameStatus,
        g.WinnerTeamSeasonID,
        m.MatchID, m.RoundNumber,
        gp.TeamSeasonID,
        -- X01 stats from Turns
        CASE WHEN g.GameType = 'X01' AND SUM(t.DartsThrown) > 0
          THEN CAST(SUM(t.Score) AS FLOAT) / SUM(t.DartsThrown)
          ELSE NULL
        END AS PPD,
        -- MPR: Cricket from CricketTurns, Shanghai from Turns
        CASE WHEN g.GameType = 'Cricket' THEN
          (SELECT CASE WHEN COUNT(*) > 0
            THEN CAST(SUM(ct.MarksScored) AS FLOAT) / COUNT(DISTINCT ct.RoundNumber)
            ELSE NULL END
            FROM CricketTurns ct WHERE ct.GameID = g.GameID AND ct.PlayerID = @playerId)
        WHEN g.GameType = 'Shanghai' THEN
          CASE WHEN COUNT(DISTINCT t.RoundNumber) > 0
            THEN CAST(SUM(ISNULL(t.MarksScored, 0)) AS FLOAT) / COUNT(DISTINCT t.RoundNumber)
            ELSE NULL END
        ELSE NULL END AS MPR,
        CASE WHEN g.GameType = 'Cricket' THEN
          ISNULL((SELECT SUM(ct.DartsThrown) FROM CricketTurns ct WHERE ct.GameID = g.GameID AND ct.PlayerID = @playerId), 0)
        ELSE ISNULL(SUM(t.DartsThrown), 0) END AS TotalDarts,
        SUM(t.Score) AS TotalScore,
        MAX(CASE WHEN t.IsDoubleIn = 1 THEN 1 ELSE 0 END) AS HadDoubleIn,
        MAX(CASE WHEN t.IsGameOut = 1 THEN 1 ELSE 0 END) AS HadGameOut,
        -- Close: Cricket from CricketTurns, Shanghai from Turns
        CASE WHEN g.GameType = 'Cricket' THEN
          ISNULL((SELECT MAX(CASE WHEN ct.IsCricketClose = 1 THEN 1 ELSE 0 END)
            FROM CricketTurns ct WHERE ct.GameID = g.GameID AND ct.PlayerID = @playerId), 0)
        ELSE MAX(CASE WHEN t.IsCricketClose = 1 THEN 1 ELSE 0 END) END AS HadClose,
        -- AllStars from both tables
        ISNULL(SUM(CAST(JSON_VALUE(t.Details, '$.allStarCount') AS INT)), 0) +
          ISNULL((SELECT SUM(CAST(JSON_VALUE(ct.Details, '$.allStarCount') AS INT))
          FROM CricketTurns ct WHERE ct.GameID = g.GameID AND ct.PlayerID = @playerId), 0) AS AllStarCount,
        -- Cricket/Shanghai darts
        CASE WHEN g.GameType = 'Cricket' THEN
          (SELECT SUM(ct.DartsThrown) FROM CricketTurns ct WHERE ct.GameID = g.GameID AND ct.PlayerID = @playerId)
        WHEN g.GameType = 'Shanghai' THEN SUM(t.DartsThrown)
        ELSE NULL END AS CricketDarts
      FROM Games g
      JOIN Matches m ON g.MatchID = m.MatchID
      JOIN GamePlayers gp ON gp.GameID = g.GameID AND gp.PlayerID = @playerId
      LEFT JOIN Turns t ON t.GameID = g.GameID AND t.PlayerID = @playerId
      WHERE g.Status = 'Completed' ${seasonFilter}
      GROUP BY g.GameID, g.GameType, g.GameNumber, g.X01Target, g.Status,
               g.WinnerTeamSeasonID, m.MatchID, m.RoundNumber, gp.TeamSeasonID
      ORDER BY m.RoundNumber, g.GameNumber
    `);
    return result.recordset;
  },

  /** Team leaderboard for a season — aggregates both players per team */
  async getSeasonTeamLeaderboard(seasonId: number): Promise<any[]> {
    const pool = await getPool();
    const result = await pool.request()
      .input('seasonId', sql.Int, seasonId)
      .query(`
        ;WITH TeamGames AS (
          SELECT DISTINCT gp.TeamSeasonID, gp.GameID
          FROM GamePlayers gp
          JOIN Games g ON gp.GameID = g.GameID
          JOIN Matches m ON g.MatchID = m.MatchID
          WHERE m.SeasonID = @seasonId AND g.Status = 'Completed'
        ),
        TeamX01 AS (
          SELECT gp.TeamSeasonID,
            SUM(t.Score) AS TotalX01Score,
            SUM(t.DartsThrown) AS TotalX01Darts,
            SUM(CASE WHEN t.IsDoubleIn = 1 THEN 1 ELSE 0 END) AS InCount,
            SUM(CASE WHEN t.IsGameOut = 1 THEN 1 ELSE 0 END) AS OutCount,
            ISNULL(SUM(CAST(JSON_VALUE(t.Details, '$.allStarCount') AS INT)), 0) AS TurnAllStars
          FROM Turns t
          JOIN Games g ON t.GameID = g.GameID
          JOIN Matches m ON g.MatchID = m.MatchID
          JOIN GamePlayers gp ON gp.GameID = g.GameID AND gp.PlayerID = t.PlayerID
          WHERE m.SeasonID = @seasonId AND g.GameType = 'X01' AND g.Status = 'Completed'
          GROUP BY gp.TeamSeasonID
        ),
        TeamCricket AS (
          SELECT gp.TeamSeasonID,
            SUM(src.MarksScored) AS TotalMarks,
            COUNT(DISTINCT CONCAT(src.GameID, '-', src.RoundNumber, '-', src.PlayerID)) AS TotalRounds,
            SUM(src.DartsThrown) AS TotalDarts,
            SUM(CASE WHEN src.IsCricketClose = 1 THEN 1 ELSE 0 END) AS CloseCount,
            SUM(src.AllStarHit) AS CricketAllStars
          FROM (
            SELECT ct.GameID, ct.RoundNumber, ct.PlayerID, ct.MarksScored, ct.DartsThrown,
              ct.IsCricketClose,
              ISNULL(CAST(JSON_VALUE(ct.Details, '$.allStarCount') AS INT), 0) AS AllStarHit
            FROM CricketTurns ct
            JOIN Games g ON ct.GameID = g.GameID
            JOIN Matches m ON g.MatchID = m.MatchID
            WHERE m.SeasonID = @seasonId AND g.GameType = 'Cricket' AND g.Status = 'Completed'
            UNION ALL
            SELECT t.GameID, t.RoundNumber, t.PlayerID, t.MarksScored, t.DartsThrown,
              t.IsCricketClose,
              ISNULL(CAST(JSON_VALUE(t.Details, '$.allStarCount') AS INT), 0) AS AllStarHit
            FROM Turns t
            JOIN Games g ON t.GameID = g.GameID
            JOIN Matches m ON g.MatchID = m.MatchID
            WHERE m.SeasonID = @seasonId AND g.GameType = 'Shanghai' AND g.Status = 'Completed'
          ) src
          JOIN GamePlayers gp ON gp.GameID = src.GameID AND gp.PlayerID = src.PlayerID
          GROUP BY gp.TeamSeasonID
        )
        SELECT ts.TeamSeasonID, tm.TeamName,
          p1.FirstName AS P1First, p1.LastName AS P1Last,
          p2.FirstName AS P2First, p2.LastName AS P2Last,
          ts.Wins, ts.Losses, ts.Draws, ts.PointsFor, ts.PointsAgainst,
          (SELECT COUNT(*) FROM TeamGames tg WHERE tg.TeamSeasonID = ts.TeamSeasonID) AS GamesPlayed,
          CASE WHEN ISNULL(x.TotalX01Darts, 0) > 0
            THEN CAST(x.TotalX01Score AS FLOAT) / x.TotalX01Darts ELSE 0
          END AS PPD,
          CASE WHEN ISNULL(c.TotalRounds, 0) > 0
            THEN CAST(c.TotalMarks AS FLOAT) / c.TotalRounds ELSE 0
          END AS MPR,
          ISNULL(x.InCount, 0) AS InCount,
          ISNULL(x.OutCount, 0) AS OutCount,
          ISNULL(c.CloseCount, 0) AS CloseCount,
          ISNULL(x.TurnAllStars, 0) + ISNULL(c.CricketAllStars, 0) AS AllStarCount
        FROM TeamSeasons ts
        JOIN Teams tm ON ts.TeamID = tm.TeamID
        JOIN Players p1 ON tm.Player1ID = p1.PlayerID
        LEFT JOIN Players p2 ON tm.Player2ID = p2.PlayerID
        LEFT JOIN TeamX01 x ON ts.TeamSeasonID = x.TeamSeasonID
        LEFT JOIN TeamCricket c ON ts.TeamSeasonID = c.TeamSeasonID
        WHERE ts.SeasonID = @seasonId
        ORDER BY PPD DESC
      `);
    return result.recordset;
  },

  /** All-time highest IN scores across all league seasons (excludes Ad-Hoc) */
  async getHighestInScores(limit: number = 20, seasonId?: number): Promise<any[]> {
    const pool = await getPool();
    const req = pool.request().input('limit', sql.Int, limit);
    if (seasonId) req.input('seasonId', sql.Int, seasonId);
    const result = await req.query(`
        SELECT TOP (@limit)
          p.PlayerID, p.FirstName, p.LastName,
          COALESCE(CAST(JSON_VALUE(t.Details, '$.inScore') AS INT), t.Score) AS InScore,
          g.GameID, g.GameType, g.X01Target,
          m.MatchDate,
          s.SeasonName
        FROM Turns t
        JOIN Games g ON t.GameID = g.GameID
        JOIN Matches m ON g.MatchID = m.MatchID
        JOIN Seasons s ON m.SeasonID = s.SeasonID
        JOIN Players p ON t.PlayerID = p.PlayerID
        WHERE t.IsDoubleIn = 1 AND s.SeasonName <> 'Ad-Hoc Play'
          ${seasonId ? 'AND s.SeasonID = @seasonId' : ''}
        ORDER BY COALESCE(CAST(JSON_VALUE(t.Details, '$.inScore') AS INT), t.Score) DESC, m.MatchDate DESC
      `);
    return result.recordset;
  },

  /** All-time highest OUT scores across all league seasons (excludes Ad-Hoc) */
  async getHighestOutScores(limit: number = 20, seasonId?: number): Promise<any[]> {
    const pool = await getPool();
    const req = pool.request().input('limit', sql.Int, limit);
    if (seasonId) req.input('seasonId', sql.Int, seasonId);
    const result = await req.query(`
        SELECT TOP (@limit)
          p.PlayerID, p.FirstName, p.LastName,
          COALESCE(CAST(JSON_VALUE(t.Details, '$.outScore') AS INT), t.Score) AS OutScore,
          g.GameID, g.GameType, g.X01Target,
          m.MatchDate,
          s.SeasonName
        FROM Turns t
        JOIN Games g ON t.GameID = g.GameID
        JOIN Matches m ON g.MatchID = m.MatchID
        JOIN Seasons s ON m.SeasonID = s.SeasonID
        JOIN Players p ON t.PlayerID = p.PlayerID
        WHERE t.IsGameOut = 1 AND s.SeasonName <> 'Ad-Hoc Play'
          ${seasonId ? 'AND s.SeasonID = @seasonId' : ''}
        ORDER BY COALESCE(CAST(JSON_VALUE(t.Details, '$.outScore') AS INT), t.Score) DESC, m.MatchDate DESC
      `);
    return result.recordset;
  },

  /** Top team game averages for X01 (both players combined avg PPD×3) */
  async getTopTeamGameAverages(x01Target: number, limit: number = 10, seasonId?: number): Promise<any[]> {
    const pool = await getPool();
    const req = pool.request().input('target', sql.Int, x01Target).input('limit', sql.Int, limit);
    if (seasonId) req.input('seasonId', sql.Int, seasonId);
    const result = await req.query(`
        SELECT TOP (@limit)
          g.GameID, g.X01Target,
          gp.TeamSeasonID,
          tm.TeamName,
          p1.FirstName AS P1First, p1.LastName AS P1Last,
          p2.FirstName AS P2First, p2.LastName AS P2Last,
          CAST(SUM(t.Score) AS FLOAT) / NULLIF(SUM(t.DartsThrown), 0) * 3 AS TeamAvg,
          m.MatchDate,
          s.SeasonName
        FROM Turns t
        JOIN Games g ON t.GameID = g.GameID
        JOIN Matches m ON g.MatchID = m.MatchID
        JOIN Seasons s ON m.SeasonID = s.SeasonID
        JOIN GamePlayers gp ON gp.GameID = g.GameID AND gp.PlayerID = t.PlayerID
        JOIN TeamSeasons ts ON gp.TeamSeasonID = ts.TeamSeasonID
        JOIN Teams tm ON ts.TeamID = tm.TeamID
        JOIN Players p1 ON tm.Player1ID = p1.PlayerID
        LEFT JOIN Players p2 ON tm.Player2ID = p2.PlayerID
        WHERE g.GameType = 'X01' AND g.X01Target = @target AND g.Status = 'Completed'
          AND s.SeasonName <> 'Ad-Hoc Play'
          ${seasonId ? 'AND s.SeasonID = @seasonId' : ''}
        GROUP BY g.GameID, g.X01Target, gp.TeamSeasonID, tm.TeamName,
          p1.FirstName, p1.LastName, p2.FirstName, p2.LastName,
          m.MatchDate, s.SeasonName
        HAVING SUM(t.DartsThrown) > 0
        ORDER BY TeamAvg DESC
      `);
    return result.recordset;
  },

  /** Top team game MPR for Cricket (both players combined) */
  async getTopTeamGameMPR(limit: number = 10, seasonId?: number): Promise<any[]> {
    const pool = await getPool();
    const req = pool.request().input('limit', sql.Int, limit);
    if (seasonId) req.input('seasonId', sql.Int, seasonId);
    const result = await req.query(`
        SELECT TOP (@limit)
          g.GameID,
          gp.TeamSeasonID,
          tm.TeamName,
          p1.FirstName AS P1First, p1.LastName AS P1Last,
          p2.FirstName AS P2First, p2.LastName AS P2Last,
          CAST(SUM(ct.MarksScored) AS FLOAT) / NULLIF(COUNT(DISTINCT CONCAT(ct.GameID, '-', ct.RoundNumber, '-', ct.PlayerID)), 0) AS TeamMPR,
          m.MatchDate,
          s.SeasonName
        FROM CricketTurns ct
        JOIN Games g ON ct.GameID = g.GameID
        JOIN Matches m ON g.MatchID = m.MatchID
        JOIN Seasons s ON m.SeasonID = s.SeasonID
        JOIN GamePlayers gp ON gp.GameID = g.GameID AND gp.PlayerID = ct.PlayerID
        JOIN TeamSeasons ts ON gp.TeamSeasonID = ts.TeamSeasonID
        JOIN Teams tm ON ts.TeamID = tm.TeamID
        JOIN Players p1 ON tm.Player1ID = p1.PlayerID
        LEFT JOIN Players p2 ON tm.Player2ID = p2.PlayerID
        WHERE g.GameType = 'Cricket' AND g.Status = 'Completed'
          AND s.SeasonName <> 'Ad-Hoc Play'
          ${seasonId ? 'AND s.SeasonID = @seasonId' : ''}
        GROUP BY g.GameID, gp.TeamSeasonID, tm.TeamName,
          p1.FirstName, p1.LastName, p2.FirstName, p2.LastName,
          m.MatchDate, s.SeasonName
        HAVING COUNT(DISTINCT CONCAT(ct.GameID, '-', ct.RoundNumber, '-', ct.PlayerID)) > 0
        ORDER BY TeamMPR DESC
      `);
    return result.recordset;
  },

  /** Top individual game averages for X01 (PPD×3) */
  async getTopIndividualGameAverages(x01Target: number, limit: number = 10, seasonId?: number): Promise<any[]> {
    const pool = await getPool();
    const req = pool.request().input('target', sql.Int, x01Target).input('limit', sql.Int, limit);
    if (seasonId) req.input('seasonId', sql.Int, seasonId);
    const result = await req.query(`
        SELECT TOP (@limit)
          g.GameID, g.X01Target,
          p.PlayerID, p.FirstName, p.LastName,
          tm.TeamName,
          CAST(SUM(t.Score) AS FLOAT) / NULLIF(SUM(t.DartsThrown), 0) * 3 AS PlayerAvg,
          m.MatchDate,
          s.SeasonName
        FROM Turns t
        JOIN Games g ON t.GameID = g.GameID
        JOIN Matches m ON g.MatchID = m.MatchID
        JOIN Seasons s ON m.SeasonID = s.SeasonID
        JOIN Players p ON t.PlayerID = p.PlayerID
        JOIN GamePlayers gp ON gp.GameID = g.GameID AND gp.PlayerID = t.PlayerID
        JOIN TeamSeasons ts ON gp.TeamSeasonID = ts.TeamSeasonID
        JOIN Teams tm ON ts.TeamID = tm.TeamID
        WHERE g.GameType = 'X01' AND g.X01Target = @target AND g.Status = 'Completed'
          AND s.SeasonName <> 'Ad-Hoc Play'
          ${seasonId ? 'AND s.SeasonID = @seasonId' : ''}
        GROUP BY g.GameID, g.X01Target, p.PlayerID, p.FirstName, p.LastName, tm.TeamName,
          m.MatchDate, s.SeasonName
        HAVING SUM(t.DartsThrown) > 0
        ORDER BY PlayerAvg DESC
      `);
    return result.recordset;
  },

  /** Top individual game MPR for Cricket */
  async getTopIndividualGameMPR(limit: number = 10, seasonId?: number): Promise<any[]> {
    const pool = await getPool();
    const req = pool.request().input('limit', sql.Int, limit);
    if (seasonId) req.input('seasonId', sql.Int, seasonId);
    const result = await req.query(`
        SELECT TOP (@limit)
          g.GameID,
          p.PlayerID, p.FirstName, p.LastName,
          tm.TeamName,
          CAST(SUM(ct.MarksScored) AS FLOAT) / NULLIF(COUNT(DISTINCT ct.RoundNumber), 0) AS PlayerMPR,
          m.MatchDate,
          s.SeasonName
        FROM CricketTurns ct
        JOIN Games g ON ct.GameID = g.GameID
        JOIN Matches m ON g.MatchID = m.MatchID
        JOIN Seasons s ON m.SeasonID = s.SeasonID
        JOIN Players p ON ct.PlayerID = p.PlayerID
        JOIN GamePlayers gp ON gp.GameID = g.GameID AND gp.PlayerID = ct.PlayerID
        JOIN TeamSeasons ts ON gp.TeamSeasonID = ts.TeamSeasonID
        JOIN Teams tm ON ts.TeamID = tm.TeamID
        WHERE g.GameType = 'Cricket' AND g.Status = 'Completed'
          AND s.SeasonName <> 'Ad-Hoc Play'
          ${seasonId ? 'AND s.SeasonID = @seasonId' : ''}
        GROUP BY g.GameID, p.PlayerID, p.FirstName, p.LastName, tm.TeamName,
          m.MatchDate, s.SeasonName
        HAVING COUNT(DISTINCT ct.RoundNumber) > 0
        ORDER BY PlayerMPR DESC
      `);
    return result.recordset;
  },

  /** All-time hall of fame records across all league seasons (excludes Ad-Hoc) */
  async getHallOfFame(): Promise<any> {
    const pool = await getPool();

    // Most All Stars in a season
    const mostAllStarsSeason = await pool.request().query(`
      SELECT TOP 5
        p.PlayerID, p.FirstName, p.LastName,
        s.SeasonName, s.SeasonID,
        (
          ISNULL((SELECT COUNT(*) FROM Turns t2
           JOIN Games g2 ON t2.GameID = g2.GameID
           JOIN Matches m2 ON g2.MatchID = m2.MatchID
           JOIN GamePlayers gp2 ON gp2.GameID = g2.GameID AND gp2.PlayerID = t2.PlayerID
           JOIN TeamSeasons ts2 ON gp2.TeamSeasonID = ts2.TeamSeasonID
           WHERE t2.PlayerID = p.PlayerID AND ts2.SeasonID = s.SeasonID
             AND t2.Details IS NOT NULL AND JSON_VALUE(t2.Details, '$.allStarLevel') IS NOT NULL), 0)
          +
          ISNULL((SELECT COUNT(*) FROM CricketTurns ct2
           JOIN Games g2 ON ct2.GameID = g2.GameID
           JOIN Matches m2 ON g2.MatchID = m2.MatchID
           JOIN GamePlayers gp2 ON gp2.GameID = g2.GameID AND gp2.PlayerID = ct2.PlayerID
           JOIN TeamSeasons ts2 ON gp2.TeamSeasonID = ts2.TeamSeasonID
           WHERE ct2.PlayerID = p.PlayerID AND ts2.SeasonID = s.SeasonID
             AND ct2.Details IS NOT NULL AND JSON_VALUE(ct2.Details, '$.allStarLevel') IS NOT NULL), 0)
        ) AS AllStarCount
      FROM Players p
      CROSS JOIN Seasons s
      WHERE s.SeasonName <> 'Ad-Hoc Play'
      ORDER BY AllStarCount DESC
    `);

    // Most OUTs in a season
    const mostOutsSeason = await pool.request().query(`
      SELECT TOP 5
        p.PlayerID, p.FirstName, p.LastName,
        s.SeasonName,
        (SELECT COUNT(*) FROM Turns t2
         JOIN Games g2 ON t2.GameID = g2.GameID
         JOIN Matches m2 ON g2.MatchID = m2.MatchID
         JOIN GamePlayers gp2 ON gp2.GameID = g2.GameID AND gp2.PlayerID = t2.PlayerID
         JOIN TeamSeasons ts2 ON gp2.TeamSeasonID = ts2.TeamSeasonID
         WHERE t2.PlayerID = p.PlayerID AND ts2.SeasonID = s.SeasonID AND t2.IsGameOut = 1) AS OutCount
      FROM Players p
      CROSS JOIN Seasons s
      WHERE s.SeasonName <> 'Ad-Hoc Play'
      ORDER BY OutCount DESC
    `);

    // Most CLOSEs in a season
    const mostClosesSeason = await pool.request().query(`
      SELECT TOP 5
        p.PlayerID, p.FirstName, p.LastName,
        s.SeasonName,
        (
          (SELECT COUNT(*) FROM CricketTurns ct2
           JOIN Games g2 ON ct2.GameID = g2.GameID
           JOIN Matches m2 ON g2.MatchID = m2.MatchID
           JOIN GamePlayers gp2 ON gp2.GameID = g2.GameID AND gp2.PlayerID = ct2.PlayerID
           JOIN TeamSeasons ts2 ON gp2.TeamSeasonID = ts2.TeamSeasonID
           WHERE ct2.PlayerID = p.PlayerID AND ts2.SeasonID = s.SeasonID AND ct2.IsCricketClose = 1)
          +
          (SELECT COUNT(*) FROM Turns t2
           JOIN Games g2 ON t2.GameID = g2.GameID
           JOIN Matches m2 ON g2.MatchID = m2.MatchID
           JOIN GamePlayers gp2 ON gp2.GameID = g2.GameID AND gp2.PlayerID = t2.PlayerID
           JOIN TeamSeasons ts2 ON gp2.TeamSeasonID = ts2.TeamSeasonID
           WHERE t2.PlayerID = p.PlayerID AND ts2.SeasonID = s.SeasonID AND t2.IsCricketClose = 1 AND g2.GameType = 'Shanghai')
        ) AS CloseCount
      FROM Players p
      CROSS JOIN Seasons s
      WHERE s.SeasonName <> 'Ad-Hoc Play'
      ORDER BY CloseCount DESC
    `);

    // Highest IN score all-time
    const highestIn = await pool.request().query(`
      SELECT TOP 10
        p.PlayerID, p.FirstName, p.LastName,
        COALESCE(CAST(JSON_VALUE(t.Details, '$.inScore') AS INT), t.Score) AS InScore,
        m.MatchDate, s.SeasonName
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      JOIN Matches m ON g.MatchID = m.MatchID
      JOIN Seasons s ON m.SeasonID = s.SeasonID
      JOIN Players p ON t.PlayerID = p.PlayerID
      WHERE t.IsDoubleIn = 1 AND s.SeasonName <> 'Ad-Hoc Play'
      ORDER BY COALESCE(CAST(JSON_VALUE(t.Details, '$.inScore') AS INT), t.Score) DESC
    `);

    // Highest OUT score all-time
    const highestOut = await pool.request().query(`
      SELECT TOP 10
        p.PlayerID, p.FirstName, p.LastName,
        COALESCE(CAST(JSON_VALUE(t.Details, '$.outScore') AS INT), t.Score) AS OutScore,
        m.MatchDate, s.SeasonName
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      JOIN Matches m ON g.MatchID = m.MatchID
      JOIN Seasons s ON m.SeasonID = s.SeasonID
      JOIN Players p ON t.PlayerID = p.PlayerID
      WHERE t.IsGameOut = 1 AND s.SeasonName <> 'Ad-Hoc Play'
      ORDER BY COALESCE(CAST(JSON_VALUE(t.Details, '$.outScore') AS INT), t.Score) DESC
    `);

    // Most team points in a season
    const mostTeamPoints = await pool.request().query(`
      SELECT TOP 5
        ts.TeamSeasonID, tm.TeamName,
        p1.FirstName AS P1First, p1.LastName AS P1Last,
        p2.FirstName AS P2First, p2.LastName AS P2Last,
        ts.PointsFor, s.SeasonName
      FROM TeamSeasons ts
      JOIN Teams tm ON ts.TeamID = tm.TeamID
      JOIN Seasons s ON ts.SeasonID = s.SeasonID
      JOIN Players p1 ON tm.Player1ID = p1.PlayerID
      LEFT JOIN Players p2 ON tm.Player2ID = p2.PlayerID
      WHERE s.SeasonName <> 'Ad-Hoc Play'
      ORDER BY ts.PointsFor DESC
    `);

    // Top 10 team 501 game averages
    const topTeam501 = await this.getTopTeamGameAverages(501, 10);
    const topTeam301 = await this.getTopTeamGameAverages(301, 10);
    const topTeamCricketMPR = await this.getTopTeamGameMPR(10);
    const topIndividual501 = await this.getTopIndividualGameAverages(501, 10);
    const topIndividual301 = await this.getTopIndividualGameAverages(301, 10);
    const topIndividualCricketMPR = await this.getTopIndividualGameMPR(10);

    // Highest individual 501 season average
    const highest501SeasonAvg = await pool.request().query(`
      SELECT TOP 5
        p.PlayerID, p.FirstName, p.LastName,
        s.SeasonName,
        CAST(SUM(t.Score) AS FLOAT) / NULLIF(SUM(t.DartsThrown), 0) * 3 AS SeasonAvg
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      JOIN Matches m ON g.MatchID = m.MatchID
      JOIN Seasons s ON m.SeasonID = s.SeasonID
      JOIN Players p ON t.PlayerID = p.PlayerID
      WHERE g.GameType = 'X01' AND g.X01Target = 501 AND g.Status = 'Completed'
        AND s.SeasonName <> 'Ad-Hoc Play'
      GROUP BY p.PlayerID, p.FirstName, p.LastName, s.SeasonName
      HAVING SUM(t.DartsThrown) > 0
      ORDER BY SeasonAvg DESC
    `);

    // Highest team 501 season average
    const highestTeam501SeasonAvg = await pool.request().query(`
      SELECT TOP 5
        tm.TeamName,
        p1.FirstName AS P1First, p1.LastName AS P1Last,
        p2.FirstName AS P2First, p2.LastName AS P2Last,
        s.SeasonName,
        CAST(SUM(t.Score) AS FLOAT) / NULLIF(SUM(t.DartsThrown), 0) * 3 AS SeasonAvg
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      JOIN Matches m ON g.MatchID = m.MatchID
      JOIN Seasons s ON m.SeasonID = s.SeasonID
      JOIN GamePlayers gp ON gp.GameID = g.GameID AND gp.PlayerID = t.PlayerID
      JOIN TeamSeasons ts ON gp.TeamSeasonID = ts.TeamSeasonID
      JOIN Teams tm ON ts.TeamID = tm.TeamID
      JOIN Players p1 ON tm.Player1ID = p1.PlayerID
      LEFT JOIN Players p2 ON tm.Player2ID = p2.PlayerID
      WHERE g.GameType = 'X01' AND g.X01Target = 501 AND g.Status = 'Completed'
        AND s.SeasonName <> 'Ad-Hoc Play'
      GROUP BY ts.TeamSeasonID, tm.TeamName, p1.FirstName, p1.LastName, p2.FirstName, p2.LastName, s.SeasonName
      HAVING SUM(t.DartsThrown) > 0
      ORDER BY SeasonAvg DESC
    `);

    // Highest team 301 season average
    const highestTeam301SeasonAvg = await pool.request().query(`
      SELECT TOP 5
        tm.TeamName,
        p1.FirstName AS P1First, p1.LastName AS P1Last,
        p2.FirstName AS P2First, p2.LastName AS P2Last,
        s.SeasonName,
        CAST(SUM(t.Score) AS FLOAT) / NULLIF(SUM(t.DartsThrown), 0) * 3 AS SeasonAvg
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      JOIN Matches m ON g.MatchID = m.MatchID
      JOIN Seasons s ON m.SeasonID = s.SeasonID
      JOIN GamePlayers gp ON gp.GameID = g.GameID AND gp.PlayerID = t.PlayerID
      JOIN TeamSeasons ts ON gp.TeamSeasonID = ts.TeamSeasonID
      JOIN Teams tm ON ts.TeamID = tm.TeamID
      JOIN Players p1 ON tm.Player1ID = p1.PlayerID
      LEFT JOIN Players p2 ON tm.Player2ID = p2.PlayerID
      WHERE g.GameType = 'X01' AND g.X01Target = 301 AND g.Status = 'Completed'
        AND s.SeasonName <> 'Ad-Hoc Play'
      GROUP BY ts.TeamSeasonID, tm.TeamName, p1.FirstName, p1.LastName, p2.FirstName, p2.LastName, s.SeasonName
      HAVING SUM(t.DartsThrown) > 0
      ORDER BY SeasonAvg DESC
    `);

    // Highest team Cricket season MPR
    const highestTeamCricketSeasonMPR = await pool.request().query(`
      SELECT TOP 5
        tm.TeamName,
        p1.FirstName AS P1First, p1.LastName AS P1Last,
        p2.FirstName AS P2First, p2.LastName AS P2Last,
        s.SeasonName,
        CAST(SUM(ct.MarksScored) AS FLOAT) / NULLIF(COUNT(DISTINCT CONCAT(ct.GameID, '-', ct.RoundNumber, '-', ct.PlayerID)), 0) AS SeasonMPR
      FROM CricketTurns ct
      JOIN Games g ON ct.GameID = g.GameID
      JOIN Matches m ON g.MatchID = m.MatchID
      JOIN Seasons s ON m.SeasonID = s.SeasonID
      JOIN GamePlayers gp ON gp.GameID = g.GameID AND gp.PlayerID = ct.PlayerID
      JOIN TeamSeasons ts ON gp.TeamSeasonID = ts.TeamSeasonID
      JOIN Teams tm ON ts.TeamID = tm.TeamID
      JOIN Players p1 ON tm.Player1ID = p1.PlayerID
      LEFT JOIN Players p2 ON tm.Player2ID = p2.PlayerID
      WHERE g.GameType = 'Cricket' AND g.Status = 'Completed'
        AND s.SeasonName <> 'Ad-Hoc Play'
      GROUP BY ts.TeamSeasonID, tm.TeamName, p1.FirstName, p1.LastName, p2.FirstName, p2.LastName, s.SeasonName
      HAVING COUNT(DISTINCT CONCAT(ct.GameID, '-', ct.RoundNumber, '-', ct.PlayerID)) > 0
      ORDER BY SeasonMPR DESC
    `);

    return {
      mostAllStarsSeason: mostAllStarsSeason.recordset.filter((r: any) => r.AllStarCount > 0),
      mostOutsSeason: mostOutsSeason.recordset.filter((r: any) => r.OutCount > 0),
      mostClosesSeason: mostClosesSeason.recordset.filter((r: any) => r.CloseCount > 0),
      highestIn: highestIn.recordset,
      highestOut: highestOut.recordset,
      mostTeamPoints: mostTeamPoints.recordset.filter((r: any) => r.PointsFor > 0),
      topTeam501: topTeam501,
      topTeam301: topTeam301,
      topTeamCricketMPR: topTeamCricketMPR,
      topIndividual501: topIndividual501,
      topIndividual301: topIndividual301,
      topIndividualCricketMPR: topIndividualCricketMPR,
      highest501SeasonAvg: highest501SeasonAvg.recordset,
      highestTeam501SeasonAvg: highestTeam501SeasonAvg.recordset,
      highestTeam301SeasonAvg: highestTeam301SeasonAvg.recordset,
      highestTeamCricketSeasonMPR: highestTeamCricketSeasonMPR.recordset,
    };
  },
};
