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
    // Cricket data is in CricketTurns; Shanghai data is in Turns
    const request2 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request2.input('seasonId', sql.Int, seasonId);

    const mprResult = await request2.query(`
      SELECT
        CASE WHEN COUNT(DISTINCT CONCAT(src.GameID, '-', src.RoundNumber)) > 0
          THEN CAST(SUM(ISNULL(src.MarksScored, 0)) AS FLOAT) / COUNT(DISTINCT CONCAT(src.GameID, '-', src.RoundNumber))
          ELSE 0
        END AS MPR,
        SUM(src.DartsThrown) AS CricketDarts
      FROM (
        SELECT ct.GameID, ct.RoundNumber, ct.MarksScored, ct.DartsThrown, ct.TeamSeasonID
        FROM CricketTurns ct
        JOIN Games g ON ct.GameID = g.GameID
        WHERE ct.PlayerID = @playerId AND g.GameType = 'Cricket'
        UNION ALL
        SELECT t.GameID, t.RoundNumber, t.MarksScored, t.DartsThrown, t.TeamSeasonID
        FROM Turns t
        JOIN Games g ON t.GameID = g.GameID
        WHERE t.PlayerID = @playerId AND g.GameType = 'Shanghai'
      ) src
      WHERE 1=1 ${seasonId ? 'AND src.TeamSeasonID IN (SELECT TeamSeasonID FROM TeamSeasons WHERE SeasonID = @seasonId)' : ''}
    `);

    // INs
    const request3 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request3.input('seasonId', sql.Int, seasonId);

    const insResult = await request3.query(`
      SELECT
        COUNT(*) AS InCount,
        CASE WHEN COUNT(*) > 0 THEN AVG(CAST(t.Score AS FLOAT)) ELSE 0 END AS InAvg
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      WHERE t.PlayerID = @playerId AND t.IsDoubleIn = 1 ${turnsFilter}
    `);

    // OUTs
    const request4 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request4.input('seasonId', sql.Int, seasonId);

    const outsResult = await request4.query(`
      SELECT
        COUNT(*) AS OutCount,
        CASE WHEN COUNT(*) > 0 THEN AVG(CAST(t.Score AS FLOAT)) ELSE 0 END AS OutAvg
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
      SELECT COUNT(*) AS Cnt
      FROM Turns t
      JOIN Games g ON t.GameID = g.GameID
      WHERE t.PlayerID = @playerId
        AND t.Details IS NOT NULL
        AND JSON_VALUE(t.Details, '$.allStarLevel') IS NOT NULL
        ${turnsFilter}
    `);

    // All-Stars from CricketTurns (Cricket, Shanghai cricket turns)
    const request8 = pool.request().input('playerId', sql.Int, playerId);
    if (seasonId) request8.input('seasonId', sql.Int, seasonId);
    const allStarCricket = await request8.query(`
      SELECT COUNT(*) AS Cnt
      FROM CricketTurns ct
      JOIN Games g ON ct.GameID = g.GameID
      WHERE ct.PlayerID = @playerId
        AND ct.Details IS NOT NULL
        AND JSON_VALUE(ct.Details, '$.allStarLevel') IS NOT NULL
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
      OutCount: outsResult.recordset[0].OutCount,
      OutAvg: Math.round((outsResult.recordset[0].OutAvg || 0) * 100) / 100,
      CloseCount: closesResult.recordset[0].CloseCount,
      AllStarCount: allStarCount,
      CricketDarts: mprResult.recordset[0].CricketDarts || 0,
      X01Darts: ppdResult.recordset[0].X01Darts || 0,
    };
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
            SUM(CASE WHEN t.Details IS NOT NULL AND JSON_VALUE(t.Details, '$.allStarLevel') IS NOT NULL THEN 1 ELSE 0 END) AS TurnAllStars
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
              CASE WHEN ct.Details IS NOT NULL AND JSON_VALUE(ct.Details, '$.allStarLevel') IS NOT NULL THEN 1 ELSE 0 END AS AllStarHit
            FROM CricketTurns ct
            JOIN Games g ON ct.GameID = g.GameID
            JOIN Matches m ON g.MatchID = m.MatchID
            WHERE m.SeasonID = @seasonId AND g.GameType = 'Cricket'
              AND ct.PlayerID IN (SELECT PlayerID FROM PlayerGames)
            UNION ALL
            SELECT t.PlayerID, t.MarksScored, t.DartsThrown, t.GameID, t.RoundNumber,
              t.IsCricketClose,
              CASE WHEN t.Details IS NOT NULL AND JSON_VALUE(t.Details, '$.allStarLevel') IS NOT NULL THEN 1 ELSE 0 END AS AllStarHit
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
        ISNULL(SUM(CASE WHEN t.Details IS NOT NULL AND JSON_VALUE(t.Details, '$.allStarLevel') IS NOT NULL THEN 1 ELSE 0 END), 0) +
          ISNULL((SELECT SUM(CASE WHEN ct.Details IS NOT NULL AND JSON_VALUE(ct.Details, '$.allStarLevel') IS NOT NULL THEN 1 ELSE 0 END)
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
};
