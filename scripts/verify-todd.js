const mssql = require('mssql');

async function main() {
  const pool = await mssql.connect({
    server: 'localhost',
    database: 'DartsLeague',
    user: 'DartsAdmin',
    password: '180Allday!',
    options: { encrypt: false, trustServerCertificate: true }
  });

  // Check all Todd 2025 Winter match scores
  const r = await pool.query(`
    SELECT m.MatchID, m.HomeScore, m.AwayScore, m.RoundNumber,
           ht.TeamName AS Home, at2.TeamName AS Away
    FROM Matches m
    JOIN TeamSeasons hts ON m.HomeTeamSeasonID = hts.TeamSeasonID
    JOIN Teams ht ON hts.TeamID = ht.TeamID
    JOIN TeamSeasons ats ON m.AwayTeamSeasonID = ats.TeamSeasonID
    JOIN Teams at2 ON ats.TeamID = at2.TeamID
    JOIN Seasons s ON m.SeasonID = s.SeasonID
    WHERE s.SeasonName = '2025 Winter'
      AND (ht.TeamName LIKE '%Todd%' OR at2.TeamName LIKE '%Todd%')
    ORDER BY m.RoundNumber
  `);
  console.log('Todd 2025 Winter match scores:');
  for (const row of r.recordset) {
    console.log(`  Rd${row.RoundNumber}: ${row.Home} ${row.HomeScore}-${row.AwayScore} ${row.Away}`);
  }

  // Brian/Tony vs Todd/Mark game details
  const r2 = await pool.query(`
    SELECT m.MatchID, m.HomeScore, m.AwayScore, m.RoundNumber,
           ht.TeamName AS Home, at2.TeamName AS Away,
           g.GameNumber, g.GameType, g.X01Target, wt.TeamName AS Winner
    FROM Matches m
    JOIN TeamSeasons hts ON m.HomeTeamSeasonID = hts.TeamSeasonID
    JOIN Teams ht ON hts.TeamID = ht.TeamID
    JOIN TeamSeasons ats ON m.AwayTeamSeasonID = ats.TeamSeasonID
    JOIN Teams at2 ON ats.TeamID = at2.TeamID
    JOIN Seasons s ON m.SeasonID = s.SeasonID
    JOIN Games g ON g.MatchID = m.MatchID
    LEFT JOIN TeamSeasons wts ON g.WinnerTeamSeasonID = wts.TeamSeasonID
    LEFT JOIN Teams wt ON wts.TeamID = wt.TeamID
    WHERE s.SeasonName = '2025 Winter'
      AND ht.TeamName LIKE '%Brian%' AND at2.TeamName LIKE '%Todd%'
    ORDER BY g.GameNumber
  `);
  console.log('\nBrian/Tony vs Todd/Mark games:');
  for (const row of r2.recordset) {
    const game = row.GameType === 'X01' ? `${row.X01Target}` : row.GameType;
    console.log(`  G${row.GameNumber} ${game}: Won by ${row.Winner || 'DRAW'} | Match: ${row.HomeScore}-${row.AwayScore}`);
  }

  await pool.close();
}

main().catch(e => { console.error(e); process.exit(1); });
