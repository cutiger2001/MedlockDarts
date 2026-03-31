const sql = require('mssql');

(async () => {
  await sql.connect({
    server: 'localhost', database: 'DartsLeague',
    user: 'DartsAdmin', password: '180Allday!',
    options: { trustServerCertificate: true }
  });

  const leagueFilter = `s.SeasonName LIKE '%Summer%' OR s.SeasonName LIKE '%Winter%'`;

  // Find players NOT in any Summer/Winter league season
  const r = await sql.query(`
    SELECT p.PlayerID, p.FirstName, p.LastName
    FROM Players p
    WHERE p.PlayerID NOT IN (
      SELECT DISTINCT t.Player1ID
      FROM Teams t
      JOIN TeamSeasons ts ON t.TeamID = ts.TeamID
      JOIN Seasons s ON ts.SeasonID = s.SeasonID
      WHERE ${leagueFilter}
      UNION
      SELECT DISTINCT t.Player2ID
      FROM Teams t
      JOIN TeamSeasons ts ON t.TeamID = ts.TeamID
      JOIN Seasons s ON ts.SeasonID = s.SeasonID
      WHERE (${leagueFilter})
        AND t.Player2ID IS NOT NULL
    )
    ORDER BY p.PlayerID
  `);

  console.log('Players NOT in any Summer/Winter season:');
  r.recordset.forEach(p => console.log(`  ${p.PlayerID}: ${p.FirstName} ${p.LastName}`));
  console.log(`Total: ${r.recordset.length}`);

  // Also show all players in league seasons for reference
  const r2 = await sql.query(`
    SELECT DISTINCT p.PlayerID, p.FirstName, p.LastName
    FROM Players p
    WHERE p.PlayerID IN (
      SELECT DISTINCT t.Player1ID
      FROM Teams t
      JOIN TeamSeasons ts ON t.TeamID = ts.TeamID
      JOIN Seasons s ON ts.SeasonID = s.SeasonID
      WHERE ${leagueFilter}
      UNION
      SELECT DISTINCT t.Player2ID
      FROM Teams t
      JOIN TeamSeasons ts ON t.TeamID = ts.TeamID
      JOIN Seasons s ON ts.SeasonID = s.SeasonID
      WHERE (${leagueFilter})
        AND t.Player2ID IS NOT NULL
    )
    ORDER BY p.PlayerID
  `);
  console.log('\nPlayers IN league seasons (keeping):');
  r2.recordset.forEach(p => console.log(`  ${p.PlayerID}: ${p.FirstName} ${p.LastName}`));
  console.log(`Total: ${r2.recordset.length}`);

  if (r.recordset.length === 0) {
    console.log('\nNo orphan players to delete.');
    await sql.close();
    return;
  }

  const orphanIds = r.recordset.map(p => p.PlayerID);
  console.log(`\nDeleting orphan teams referencing these players...`);
  const delTeams = await sql.query(`
    DELETE FROM Teams
    WHERE Player1ID IN (${orphanIds.join(',')})
       OR Player2ID IN (${orphanIds.join(',')})
  `);
  console.log(`  Deleted ${delTeams.rowsAffected[0]} orphan teams.`);

  console.log(`Deleting ${orphanIds.length} orphan players...`);
  const delPlayers = await sql.query(`
    DELETE FROM Players WHERE PlayerID IN (${orphanIds.join(',')})
  `);
  console.log(`  Deleted ${delPlayers.rowsAffected[0]} players.`);

  await sql.close();
})();
