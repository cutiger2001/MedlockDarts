const sql = require('mssql');
const config = {
  server: 'localhost',
  database: 'DartsLeague',
  user: 'DartsAdmin',
  password: '180Allday!',
  options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
  const pool = await sql.connect(config);

  // Fix: Complete the season that already has a completed Final
  const result = await pool.request().query(`
    UPDATE s
    SET s.Status = 'Completed',
        s.ChampionTeamSeasonID = m.WinnerTeamSeasonID,
        s.IsActive = 0,
        s.UpdatedAt = SYSUTCDATETIME()
    FROM Seasons s
    JOIN Matches m ON m.SeasonID = s.SeasonID
      AND m.IsPlayoff = 1
      AND m.PlayoffRound = 'Final'
      AND m.Status = 'Completed'
    WHERE s.SeasonName LIKE '%Summer 2026%'
      AND s.Status = 'Playoffs';
    
    -- Also mark the finals loser as eliminated
    UPDATE ts
    SET ts.IsEliminated = 1
    FROM TeamSeasons ts
    JOIN Matches m ON m.SeasonID = ts.SeasonID
      AND m.IsPlayoff = 1
      AND m.PlayoffRound = 'Final'
      AND m.Status = 'Completed'
    JOIN Seasons s ON s.SeasonID = m.SeasonID
    WHERE s.SeasonName LIKE '%Summer 2026%'
      AND (ts.TeamSeasonID = m.HomeTeamSeasonID OR ts.TeamSeasonID = m.AwayTeamSeasonID)
      AND ts.TeamSeasonID != m.WinnerTeamSeasonID;
  `);
  console.log('Updated rows:', result.rowsAffected);

  // Verify
  const check = await pool.request().query(
    "SELECT SeasonID, SeasonName, Status, IsActive, ChampionTeamSeasonID FROM Seasons WHERE SeasonName LIKE '%Summer 2026%'"
  );
  console.log('=== Season After Fix ===');
  console.log(JSON.stringify(check.recordset, null, 2));

  await pool.close();
}

main().catch(e => { console.error(e); process.exit(1); });
