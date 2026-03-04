/**
 * Import historical dart league data from Excel into the DartsLeague database.
 *
 * This script:
 *  1. Wipes all existing data (turns, games, matches, team-seasons, teams, seasons, players)
 *  2. Creates Players from unique names in the spreadsheet
 *  3. Creates Seasons
 *  4. Creates Teams + TeamSeasons
 *  5. Creates Matches (round-robin schedule)
 *  6. Creates Games (G1 501, G2 501, G3 Cricket, G4 Cricket, G5 301)
 *  7. Creates GamePlayers
 *  8. Creates synthetic Turns/CricketTurns to reproduce team averages
 *     (each player is credited with half the team total)
 *  9. Records Outs, Ins, Closes, All-Stars as flagged turns
 * 10. Tallies TeamSeason win/loss/points
 *
 * Usage:  node scripts/import-history.js
 */

const XLSX = require('xlsx');
const mssql = require('mssql');

// ---------- config ----------
const DB_CONFIG = {
  server: 'localhost',
  database: 'DartsLeague',
  user: 'DartsAdmin',
  password: '180Allday!',
  options: { encrypt: false, trustServerCertificate: true },
};

const EXCEL_PATH = 'History/Darts Rankings 2024 (1).xlsx';
const SHEET_NAME = 'Match Data - T';

// The standard 5-game match format for all historical seasons
const GAME_FORMAT = [
  { gameNumber: 1, gameType: 'X01', x01Target: 501 },
  { gameNumber: 2, gameType: 'X01', x01Target: 501 },
  { gameNumber: 3, gameType: 'Cricket', x01Target: null },
  { gameNumber: 4, gameType: 'Cricket', x01Target: null },
  { gameNumber: 5, gameType: 'X01', x01Target: 301 },
];

// ---------- helpers ----------

/** Parse MatchID like "3-2" → { round: 3, matchNum: 2 } */
function parseMatchId(mid) {
  const [round, num] = mid.split('-').map(Number);
  return { round, matchNum: num };
}

/**
 * Convert a team PPD×3 average back to synthetic turns.
 * We assume both players split evenly. We fabricate a single "summary turn"
 * per player per game with DartsThrown computed to reproduce the average.
 *
 * For X01:  The "G1 501 Avg" etc. in the Excel is the TEAM average (points per
 *   3-dart round).  Both players are assumed to score identically.
 *   Give each player 1 turn: Score = teamAvg, DartsThrown = 3.
 *   PPD = teamAvg / 3.  ✓
 *
 * For Cricket: teamMPR = marks per round.
 *   Give each player: MarksScored = teamMPR (one round), DartsThrown = 3.
 *   MPR = teamMPR / 1 = teamMPR.  ✓
 *
 * So:
 *   X01 turn per player: Score = round(teamAvg * 100) / 100, DartsThrown = 3
 *     (this makes individual PPD = teamAvg / 3)
 *   Cricket turn per player: MarksScored = round(teamMPR * 100) / 100, DartsThrown = 3
 */

// ---------- main ----------

async function main() {
  console.log('Connecting to database...');
  const pool = await mssql.connect(DB_CONFIG);

  console.log('Reading Excel file...');
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[SHEET_NAME];
  const rows = XLSX.utils.sheet_to_json(ws);
  console.log(`  ${rows.length} data rows read.`);

  // ========== DATA CLEANUP — fix typos in Excel ==========
  const NAME_FIXES = {
    'MIke A': 'Mike A',
    'Kvein': 'Kevin',
  };
  const TEXT_FIELDS = ['Team Captain', 'Partner', 'G1 Out Player', 'G2 Out Player',
    'G5 Out Player', 'G5 In Player', 'G3 Crick Close', 'G4 Crick Close'];
  for (const r of rows) {
    for (const f of TEXT_FIELDS) {
      if (r[f] && NAME_FIXES[r[f].trim()]) {
        console.log(`  FIX: "${r[f]}" → "${NAME_FIXES[r[f].trim()]}" in ${r['MatchID']} ${r['Season']}`);
        r[f] = NAME_FIXES[r[f].trim()];
      }
    }
    // "Paul/Neil" is a team name, not a player name — fix wherever it appears as a player
    if (r['Team Captain'] === 'Paul/Neil') {
      console.log(`  FIX: Splitting "Paul/Neil" captain → Paul + Neil in ${r['MatchID']} ${r['Season']}`);
      r['Team Captain'] = 'Paul';
      if (!r['Partner']) r['Partner'] = 'Neil';
    }
    // "Paul/Neil" in player-name fields → default to captain "Paul"
    for (const pf of ['G1 Out Player','G2 Out Player','G5 Out Player','G5 In Player','G3 Crick Close','G4 Crick Close']) {
      if (r[pf] && r[pf].trim() === 'Paul/Neil') {
        console.log(`  FIX: "${pf}" = "Paul/Neil" → "Paul" in ${r['MatchID']} ${r['Season']}`);
        r[pf] = 'Paul';
      }
    }
  }
  console.log('  Data cleanup complete.');

  // ========== STEP 1: Wipe all existing data ==========
  console.log('\n--- Wiping existing data ---');
  await pool.request().query(`
    UPDATE Seasons SET ChampionTeamSeasonID = NULL;
    DELETE FROM CricketTurns;
    DELETE FROM Turns;
    DELETE FROM CricketState;
    DELETE FROM GamePlayers;
    DELETE FROM Games;
    DELETE FROM Matches;
    DELETE FROM SeasonGameFormats;
    DELETE FROM TeamSeasons;
    DELETE FROM Teams;
    DELETE FROM Seasons;
    DELETE FROM Players;
  `);
  console.log('  All tables cleared.');

  // Reseed identities
  const tables = ['Players','Seasons','Teams','TeamSeasons','Matches','Games',
    'GamePlayers','Turns','CricketTurns','CricketState','SeasonGameFormats'];
  for (const t of tables) {
    try { await pool.request().query(`DBCC CHECKIDENT ('${t}', RESEED, 0)`); } catch (_) { /* ignore */ }
  }
  console.log('  Identity columns reseeded.');

  // ========== STEP 2: Collect unique players ==========
  const playerNames = new Set();
  for (const r of rows) {
    if (r['Team Captain']) playerNames.add(r['Team Captain'].trim());
    if (r['Partner']) playerNames.add(r['Partner'].trim());
    // Check out/in/close player fields — some reference players by first name
    for (const field of ['G1 Out Player','G2 Out Player','G5 Out Player','G5 In Player',
                         'G3 Crick Close','G4 Crick Close']) {
      if (r[field]) playerNames.add(r[field].trim());
    }
  }
  console.log(`\n--- Creating ${playerNames.size} players ---`);

  // Full last names from Hall of Fame / league records
  const LAST_NAMES = {
    'Brian': 'Lane',
    'Kevin': 'Hannan',
    'Daniel': 'Jean',
    'Tayven': 'Hike',
    'Mike H': 'Hendricks',
    'Mike C': 'Condella',
    'Mark': 'Arabis',
    'Tristan': '',
    'Paul': 'Streeter',
    'Todd': 'Dickerson',
    'Clarence': 'Lau',
    'Neil': 'Barber',
    'Jason': 'Trkovsky',
    'Mike A': 'Alshouse',
    'David': 'Abbott',
    'Troy': 'Gilliland',
    'Matt': 'Scott',
    'Tony': 'La',
    'Olver': 'Thorarinsson',
    'Jeremy': '',
    'Art': '',
  };

  const playerMap = {}; // name → PlayerID
  for (const name of playerNames) {
    const lastName = LAST_NAMES[name] || '';
    const result = await pool.request()
      .input('first', mssql.NVarChar, name)
      .input('last', mssql.NVarChar, lastName)
      .query(`INSERT INTO Players (FirstName, LastName) OUTPUT INSERTED.PlayerID VALUES (@first, @last)`);
    playerMap[name] = result.recordset[0].PlayerID;
    console.log(`  ${name} ${lastName} → PlayerID ${playerMap[name]}`);
  }

  // ========== STEP 3: Create Seasons (chronological order for proper SeasonID ordering) ==========
  // Create pre-data 2023 seasons FIRST so they get lower SeasonIDs
  const preSeasonDefs = [
    { name: '2023 Winter', status: 'Completed' },
    { name: '2023 Summer', status: 'Completed' },
  ];
  const seasonMap = {}; // seasonName → SeasonID
  console.log('\n--- Creating seasons ---');
  for (const ps of preSeasonDefs) {
    const result = await pool.request()
      .input('name', mssql.NVarChar, ps.name)
      .input('status', mssql.NVarChar, ps.status)
      .query(`INSERT INTO Seasons (SeasonName, Status) OUTPUT INSERTED.SeasonID VALUES (@name, @status)`);
    seasonMap[ps.name] = result.recordset[0].SeasonID;
    console.log(`  ${ps.name} → SeasonID ${seasonMap[ps.name]} (${ps.status})`);
  }

  // Now create data seasons from Excel in order
  const seasonNames = [...new Set(rows.map(r => r['Season']))];
  for (const name of seasonNames) {
    const status = name === '2026 Winter' ? 'RoundRobin' : 'Completed';
    const result = await pool.request()
      .input('name', mssql.NVarChar, name)
      .input('status', mssql.NVarChar, status)
      .query(`INSERT INTO Seasons (SeasonName, Status) OUTPUT INSERTED.SeasonID VALUES (@name, @status)`);
    seasonMap[name] = result.recordset[0].SeasonID;
    console.log(`  ${name} → SeasonID ${seasonMap[name]} (${status})`);
  }

  // ========== STEP 4: Create SeasonGameFormats ==========
  console.log('\n--- Creating season game formats ---');
  for (const sName of seasonNames) {
    const sId = seasonMap[sName];
    for (const gf of GAME_FORMAT) {
      await pool.request()
        .input('sid', mssql.Int, sId)
        .input('gn', mssql.Int, gf.gameNumber)
        .input('gt', mssql.NVarChar, gf.gameType)
        .input('t', mssql.Int, gf.x01Target)
        .query(`INSERT INTO SeasonGameFormats (SeasonID, GameNumber, GameType, X01Target)
                VALUES (@sid, @gn, @gt, @t)`);
    }
    console.log(`  ${sName}: 5 game formats`);
  }

  // ========== STEP 5: Create Teams + TeamSeasons ==========
  console.log('\n--- Creating teams & team-seasons ---');

  // Group rows by season, then collect teams per season with their players
  const seasonTeams = {}; // seasonName → Map<teamId, {captain, partner}>
  for (const r of rows) {
    const sName = r['Season'];
    const teamId = r['TeamID'];
    if (!seasonTeams[sName]) seasonTeams[sName] = new Map();
    if (!seasonTeams[sName].has(teamId)) {
      seasonTeams[sName].set(teamId, {
        captain: r['Team Captain'].trim(),
        partner: r['Partner'].trim(),
      });
    }
  }

  const teamMap = {}; // `teamName|seasonName` → { teamId, teamSeasonId }
  const teamDbMap = {}; // `p1-p2-name` → TeamID (reuse teams across seasons if same pairing AND name)

  for (const sName of seasonNames) {
    const teams = seasonTeams[sName];
    for (const [teamName, { captain, partner }] of teams) {
      const p1Id = playerMap[captain];
      const p2Id = playerMap[partner];

      // Create or reuse team (sorted player pair + name is the key)
      const pairKey = [p1Id, p2Id].sort((a, b) => a - b).join('-') + '-' + teamName;
      let teamId;
      if (teamDbMap[pairKey]) {
        teamId = teamDbMap[pairKey];
      } else {
        const tResult = await pool.request()
          .input('name', mssql.NVarChar, teamName)
          .input('p1', mssql.Int, Math.min(p1Id, p2Id))
          .input('p2', mssql.Int, Math.max(p1Id, p2Id))
          .query(`INSERT INTO Teams (TeamName, Player1ID, Player2ID)
                  OUTPUT INSERTED.TeamID VALUES (@name, @p1, @p2)`);
        teamId = tResult.recordset[0].TeamID;
        teamDbMap[pairKey] = teamId;
      }

      // Create TeamSeason
      const tsResult = await pool.request()
        .input('tid', mssql.Int, teamId)
        .input('sid', mssql.Int, seasonMap[sName])
        .query(`INSERT INTO TeamSeasons (TeamID, SeasonID)
                OUTPUT INSERTED.TeamSeasonID VALUES (@tid, @sid)`);
      const tsId = tsResult.recordset[0].TeamSeasonID;

      teamMap[`${teamName}|${sName}`] = { teamId, teamSeasonId: tsId, captain, partner };
      console.log(`  ${teamName} [${sName}] → TeamSeasonID ${tsId}`);
    }
  }

  // ========== STEP 6: Create Matches ==========
  console.log('\n--- Creating matches ---');

  // Group rows into match pairs: same MatchID + Season = one match (H + V rows)
  const matchGroups = {}; // `matchId|season` → [homeRow, awayRow]
  for (const r of rows) {
    const key = `${r['MatchID']}|${r['Season']}`;
    if (!matchGroups[key]) matchGroups[key] = [];
    matchGroups[key].push(r);
  }

  const dbMatchMap = {}; // `matchId|season` → DB MatchID
  let matchCount = 0;

  for (const [key, pair] of Object.entries(matchGroups)) {
    const homeRow = pair.find(r => r['H/V'] === 'H');
    const awayRow = pair.find(r => r['H/V'] === 'V');
    if (!homeRow || !awayRow) {
      console.warn(`  WARNING: Incomplete match ${key}, skipping.`);
      continue;
    }

    const sName = homeRow['Season'];
    const { round } = parseMatchId(homeRow['MatchID']);
    const homeTs = teamMap[`${homeRow['TeamID']}|${sName}`].teamSeasonId;
    const awayTs = teamMap[`${awayRow['TeamID']}|${sName}`].teamSeasonId;

    // Determine match winner (team with more Tot Points)
    const homePts = homeRow['Tot Points'] || 0;
    const awayPts = awayRow['Tot Points'] || 0;
    const isPlayed = homePts > 0 || awayPts > 0;
    const winnerTs = isPlayed ? (homePts > awayPts ? homeTs : (awayPts > homePts ? awayTs : null)) : null;
    const matchStatus = isPlayed ? 'Completed' : 'Scheduled';

    const mResult = await pool.request()
      .input('sid', mssql.Int, seasonMap[sName])
      .input('hts', mssql.Int, homeTs)
      .input('ats', mssql.Int, awayTs)
      .input('rd', mssql.Int, round)
      .input('status', mssql.NVarChar, matchStatus)
      .input('winner', mssql.Int, winnerTs)
      .query(`INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status, WinnerTeamSeasonID)
              OUTPUT INSERTED.MatchID VALUES (@sid, @hts, @ats, @rd, @status, @winner)`);
    dbMatchMap[key] = { matchId: mResult.recordset[0].MatchID, isPlayed };
    matchCount++;
  }
  console.log(`  ${matchCount} matches created.`);

  // ========== STEP 7 & 8: Create Games, GamePlayers, and Turns ==========
  console.log('\n--- Creating games, players, and turns ---');

  let gameCount = 0;
  let turnCount = 0;
  let cricketTurnCount = 0;

  // Track totals for TeamSeason W/L/PF/PA at match level
  const tsStats = {}; // teamSeasonId → { wins, losses, draws, pf, pa, gameWins }

  function ensureTsStat(tsId) {
    if (!tsStats[tsId]) tsStats[tsId] = { wins: 0, losses: 0, draws: 0, pf: 0, pa: 0, gameWins: 0 };
  }

  for (const [key, pair] of Object.entries(matchGroups)) {
    const homeRow = pair.find(r => r['H/V'] === 'H');
    const awayRow = pair.find(r => r['H/V'] === 'V');
    if (!homeRow || !awayRow) continue;

    const sName = homeRow['Season'];
    const { matchId: dbMatchId, isPlayed } = dbMatchMap[key];
    const homeInfo = teamMap[`${homeRow['TeamID']}|${sName}`];
    const awayInfo = teamMap[`${awayRow['TeamID']}|${sName}`];
    const homeTs = homeInfo.teamSeasonId;
    const awayTs = awayInfo.teamSeasonId;

    ensureTsStat(homeTs);
    ensureTsStat(awayTs);

    // Skip stats and game creation for unplayed matches
    if (!isPlayed) continue;

    // Track match-level points
    const homeTotPts = homeRow['Tot Points'] || 0;
    const awayTotPts = awayRow['Tot Points'] || 0;
    tsStats[homeTs].pf += homeTotPts;
    tsStats[homeTs].pa += awayTotPts;
    tsStats[awayTs].pf += awayTotPts;
    tsStats[awayTs].pa += homeTotPts;

    if (homeTotPts > awayTotPts) {
      tsStats[homeTs].wins++;
      tsStats[awayTs].losses++;
    } else if (awayTotPts > homeTotPts) {
      tsStats[awayTs].wins++;
      tsStats[homeTs].losses++;
    } else {
      tsStats[homeTs].draws++;
      tsStats[awayTs].draws++;
    }

    // Create 5 games per match
    const gameConfigs = [
      { gn: 1, type: 'X01', target: 501, avgField: 'G1 501 Avg', ptsField: 'G1 501 Pts',
        outPlayerField: 'G1 Out Player', outScoreField: 'Out Score' },
      { gn: 2, type: 'X01', target: 501, avgField: 'G2 501 Avg', ptsField: 'G2 501 Pts',
        outPlayerField: 'G2 Out Player', outScoreField: 'G2 Out Score' },
      { gn: 3, type: 'Cricket', target: null, avgField: 'G3 Crick Avg', ptsField: 'G3 Crick Pts',
        closeField: 'G3 Crick Close' },
      { gn: 4, type: 'Cricket', target: null, avgField: 'G4 Crick Avg', ptsField: 'G4 Crick Pts',
        closeField: 'G4 Crick Close' },
      { gn: 5, type: 'X01', target: 301, avgField: '301 Avg', ptsField: '301 Pts',
        inPlayerField: 'G5 In Player', inScoreField: 'G5 In Score',
        outPlayerField: 'G5 Out Player', outScoreField: 'G5 Out Score' },
    ];

    for (const gc of gameConfigs) {
      const homePts = homeRow[gc.ptsField] || 0;
      const awayPts = awayRow[gc.ptsField] || 0;
      const winnerTsId = homePts > awayPts ? homeTs : (awayPts > homePts ? awayTs : null);

      // Track game wins
      if (winnerTsId) {
        tsStats[winnerTsId].gameWins++;
      }

      // Create Game
      const gResult = await pool.request()
        .input('mid', mssql.Int, dbMatchId)
        .input('gt', mssql.NVarChar, gc.type)
        .input('gn', mssql.Int, gc.gn)
        .input('t', mssql.Int, gc.target)
        .input('status', mssql.NVarChar, 'Completed')
        .input('winner', mssql.Int, winnerTsId)
        .query(`INSERT INTO Games (MatchID, GameType, GameNumber, X01Target, Status, WinnerTeamSeasonID)
                OUTPUT INSERTED.GameID VALUES (@mid, @gt, @gn, @t, @status, @winner)`);
      const gameId = gResult.recordset[0].GameID;
      gameCount++;

      // Resolve players for each side
      const homeCaptainId = playerMap[homeInfo.captain];
      const homePartnerId = playerMap[homeInfo.partner];
      const awayCaptainId = playerMap[awayInfo.captain];
      const awayPartnerId = playerMap[awayInfo.partner];

      // Create GamePlayers (4 per game)
      for (const [pid, tsid, order] of [
        [homeCaptainId, homeTs, 1], [homePartnerId, homeTs, 2],
        [awayCaptainId, awayTs, 1], [awayPartnerId, awayTs, 2],
      ]) {
        await pool.request()
          .input('gid', mssql.Int, gameId)
          .input('pid', mssql.Int, pid)
          .input('tsid', mssql.Int, tsid)
          .input('ord', mssql.Int, order)
          .query(`INSERT INTO GamePlayers (GameID, PlayerID, TeamSeasonID, PlayerOrder)
                  VALUES (@gid, @pid, @tsid, @ord)`);
      }

      // --- Create Turns ---
      const homeAvg = homeRow[gc.avgField] || 0;
      const awayAvg = awayRow[gc.avgField] || 0;
      let turnNum = 0;

      if (gc.type === 'X01') {
        // For X01: create ONE turn per player with Score = teamAvg (team avg per 3-dart round),
        // DartsThrown = 3. PPD = teamAvg / 3. ✓
        // Out/In scores stored in Details JSON so stats queries can read them.
        for (const [teamRow, teamInfo, tsId, captainId, partnerId] of [
          [homeRow, homeInfo, homeTs, homeCaptainId, homePartnerId],
          [awayRow, awayInfo, awayTs, awayCaptainId, awayPartnerId],
        ]) {
          const teamAvg = teamRow[gc.avgField] || 0;
          const perPlayerScore = Math.round(teamAvg * 100) / 100;

          for (const [playerId, playerOrder] of [[captainId, 1], [partnerId, 2]]) {
            turnNum++;

            // Check if this player got an OUT in this game
            let isOut = 0;
            let outScore = 0;
            if (gc.outPlayerField) {
              const outPlayer = teamRow[gc.outPlayerField];
              if (outPlayer && playerMap[outPlayer.trim()] === playerId) {
                isOut = 1;
                outScore = teamRow[gc.outScoreField] || 0;
              }
            }

            // Check if this player got a Double-IN (G5 only)
            let isIn = 0;
            let inScore = 0;
            if (gc.inPlayerField) {
              const inPlayer = teamRow[gc.inPlayerField];
              if (inPlayer && playerMap[inPlayer.trim()] === playerId) {
                isIn = 1;
                inScore = teamRow[gc.inScoreField] || 0;
              }
            }

            // Check for all-stars on this game for this player
            const allStarField = playerOrder === 1
              ? `TC-G${gc.gn}-AS`
              : `P-G${gc.gn}-AS`;
            const asCount = teamRow[allStarField] || 0;

            // Build Details JSON with all metadata
            const detailsObj = {};
            if (asCount > 0) {
              detailsObj.allStarCount = asCount;
              detailsObj.allStarLevel = asCount >= 3 ? 'gold' : (asCount >= 2 ? 'silver' : 'bronze');
            }
            if (isOut && outScore > 0) detailsObj.outScore = outScore;
            if (isIn && inScore > 0) detailsObj.inScore = inScore;
            const details = Object.keys(detailsObj).length > 0 ? JSON.stringify(detailsObj) : null;

            // Single turn: Score = teamAvg, flags for out/in, scores in Details
            await pool.request()
              .input('gid', mssql.Int, gameId)
              .input('pid', mssql.Int, playerId)
              .input('tsid', mssql.Int, tsId)
              .input('tn', mssql.Int, turnNum)
              .input('rn', mssql.Int, 1)
              .input('darts', mssql.Int, 3)
              .input('score', mssql.Int, Math.round(perPlayerScore))
              .input('remaining', mssql.Int, isOut ? 0 : null)
              .input('isIn', mssql.Bit, isIn ? 1 : 0)
              .input('isOut', mssql.Bit, isOut ? 1 : 0)
              .input('details', mssql.NVarChar, details)
              .query(`INSERT INTO Turns (GameID, PlayerID, TeamSeasonID, TurnNumber, RoundNumber,
                  DartsThrown, Score, RemainingScore, IsDoubleIn, IsGameOut, Details)
                  VALUES (@gid, @pid, @tsid, @tn, 1, @darts, @score, @remaining, @isIn, @isOut, @details)`);
            turnCount++;
          }
        }
      } else {
        // Cricket game — use CricketTurns
        for (const [teamRow, teamInfo, tsId, captainId, partnerId] of [
          [homeRow, homeInfo, homeTs, homeCaptainId, homePartnerId],
          [awayRow, awayInfo, awayTs, awayCaptainId, awayPartnerId],
        ]) {
          const teamMPR = teamRow[gc.avgField] || 0;
          const perPlayerMarks = Math.round(teamMPR * 100) / 100;

          for (const [playerId, playerOrder] of [[captainId, 1], [partnerId, 2]]) {
            turnNum++;

            // Check for close
            let isClose = 0;
            if (gc.closeField) {
              const closePlayer = teamRow[gc.closeField];
              if (closePlayer && playerMap[closePlayer.trim()] === playerId) {
                isClose = 1;
              }
            }

            // Check for all-stars
            const allStarField = playerOrder === 1
              ? `TC-G${gc.gn}-AS`
              : `P-G${gc.gn}-AS`;
            const asCount = teamRow[allStarField] || 0;
            const details = asCount > 0
              ? JSON.stringify({ allStarCount: asCount, allStarLevel: asCount >= 3 ? 'gold' : (asCount >= 2 ? 'silver' : 'bronze') })
              : null;

            await pool.request()
              .input('gid', mssql.Int, gameId)
              .input('pid', mssql.Int, playerId)
              .input('tsid', mssql.Int, tsId)
              .input('tn', mssql.Int, turnNum)
              .input('rn', mssql.Int, 1)
              .input('darts', mssql.Int, 3)
              .input('marks', mssql.Decimal(6, 2), perPlayerMarks)
              .input('isClose', mssql.Bit, isClose)
              .input('details', mssql.NVarChar, details)
              .query(`INSERT INTO CricketTurns (GameID, PlayerID, TeamSeasonID, TurnNumber, RoundNumber,
                  DartsThrown, MarksScored, IsCricketClose, Details)
                  VALUES (@gid, @pid, @tsid, @tn, 1, @darts, @marks, @isClose, @details)`);
            cricketTurnCount++;
          }
        }
      }
    }
  }

  console.log(`  ${gameCount} games created.`);
  console.log(`  ${turnCount} X01 turns created.`);
  console.log(`  ${cricketTurnCount} Cricket turns created.`);

  // ========== STEP 9: Update TeamSeason standings ==========
  console.log('\n--- Updating team-season standings ---');
  for (const [tsId, s] of Object.entries(tsStats)) {
    await pool.request()
      .input('tsid', mssql.Int, Number(tsId))
      .input('w', mssql.Int, s.wins)
      .input('l', mssql.Int, s.losses)
      .input('d', mssql.Int, s.draws)
      .input('pf', mssql.Int, s.pf)
      .input('pa', mssql.Int, s.pa)
      .input('gw', mssql.Int, s.gameWins)
      .query(`UPDATE TeamSeasons SET Wins=@w, Losses=@l, Draws=@d, PointsFor=@pf, PointsAgainst=@pa, GameWins=@gw
              WHERE TeamSeasonID=@tsid`);
  }
  console.log(`  ${Object.keys(tsStats).length} team-season records updated.`);

  // ========== STEP 10: Update match HomeScore/AwayScore from game winners ==========
  console.log('\n--- Updating match scores (HomeScore / AwayScore) ---');
  const matchScoreResult = await pool.request().query(`
    UPDATE m SET
      HomeScore = ISNULL((SELECT COUNT(*) FROM Games g WHERE g.MatchID = m.MatchID AND g.WinnerTeamSeasonID = m.HomeTeamSeasonID), 0),
      AwayScore = ISNULL((SELECT COUNT(*) FROM Games g WHERE g.MatchID = m.MatchID AND g.WinnerTeamSeasonID = m.AwayTeamSeasonID), 0)
    FROM Matches m
    WHERE m.Status = 'Completed'
  `);
  console.log(`  ${matchScoreResult.rowsAffected[0]} match scores updated.`);

  // ========== STEP 11: Handle per-game all-stars that lack game breakdown ==========
  // Some rows have TC All Stars / Partner All Stars totals but no per-game breakdown.
  // The per-game AS fields (TC-G1-AS etc.) are only populated for SOME rows.
  // We already handled per-game all-stars above. For rows where the total doesn't match,
  // we can't assign them to specific games, so we'll skip — the per-game data we have
  // is the best we can do.

  // ========== STEP 12: Create pre-data seasons & Set season champions ==========
  console.log('\n--- Setting season champions ---');

  // Create champion teams/team-seasons for 2023 pre-data seasons
  const preChampions = [
    { name: '2023 Winter', champion1: 'Jason', champion2: 'Tayven' },
    { name: '2023 Summer', champion1: 'Daniel', champion2: 'Olver' },
  ];

  for (const ps of preChampions) {
    const preSeasonId = seasonMap[ps.name];
    if (!preSeasonId) { console.log(`  WARNING: Season ${ps.name} not found`); continue; }

    const p1Result = await pool.request()
      .input('name', mssql.NVarChar, ps.champion1)
      .query(`SELECT PlayerID FROM Players WHERE FirstName = @name`);
    const p2Result = await pool.request()
      .input('name', mssql.NVarChar, ps.champion2)
      .query(`SELECT PlayerID FROM Players WHERE FirstName = @name`);

    if (p1Result.recordset.length && p2Result.recordset.length) {
      const p1Id = p1Result.recordset[0].PlayerID;
      const p2Id = p2Result.recordset[0].PlayerID;

      const teamName = `${ps.champion1}/${ps.champion2}`;
      const sortedP1 = Math.min(p1Id, p2Id);
      const sortedP2 = Math.max(p1Id, p2Id);
      const teamResult = await pool.request()
        .input('p1', mssql.Int, sortedP1)
        .input('p2', mssql.Int, sortedP2)
        .input('tname', mssql.NVarChar, teamName)
        .query(`IF NOT EXISTS (SELECT 1 FROM Teams WHERE Player1ID=@p1 AND Player2ID=@p2)
                  INSERT INTO Teams (TeamName, Player1ID, Player2ID) OUTPUT INSERTED.TeamID VALUES (@tname, @p1, @p2)
                ELSE
                  SELECT TeamID FROM Teams WHERE Player1ID=@p1 AND Player2ID=@p2`);
      const teamId = teamResult.recordset[0].TeamID;

      const tsResult = await pool.request()
        .input('tid', mssql.Int, teamId)
        .input('sid', mssql.Int, preSeasonId)
        .query(`INSERT INTO TeamSeasons (TeamID, SeasonID) OUTPUT INSERTED.TeamSeasonID VALUES (@tid, @sid)`);
      const champTsId = tsResult.recordset[0].TeamSeasonID;

      await pool.request()
        .input('sid', mssql.Int, preSeasonId)
        .input('champId', mssql.Int, champTsId)
        .query(`UPDATE Seasons SET ChampionTeamSeasonID = @champId WHERE SeasonID = @sid`);
      console.log(`  ${ps.name} champion: ${ps.champion1}/${ps.champion2} (TeamSeasonID ${champTsId})`);
    } else {
      console.log(`  WARNING: Could not find players for ${ps.name} champion: ${ps.champion1}/${ps.champion2}`);
    }
  }

  // Set champions for data seasons using SQL lookup
  const dataChampions = [
    { season: '2024 Winter', p1: 'Kevin', p2: 'Paul' },
    { season: '2024 Summer', p1: 'Brian', p2: 'Neil' },
    { season: '2025 Winter', p1: 'Todd', p2: 'Mark' },
    { season: '2025 Summer', p1: 'Mike C', p2: 'Paul' },
  ];

  for (const dc of dataChampions) {
    const result = await pool.request()
      .input('sname', mssql.NVarChar, dc.season)
      .input('p1', mssql.NVarChar, dc.p1)
      .input('p2', mssql.NVarChar, dc.p2)
      .query(`
        UPDATE s SET ChampionTeamSeasonID = ts.TeamSeasonID
        FROM Seasons s
        JOIN TeamSeasons ts ON ts.SeasonID = s.SeasonID
        JOIN Teams t ON t.TeamID = ts.TeamID
        JOIN Players p1 ON p1.PlayerID = t.Player1ID
        JOIN Players p2 ON p2.PlayerID = t.Player2ID
        WHERE s.SeasonName = @sname
          AND ((p1.FirstName = @p1 AND p2.FirstName = @p2) OR (p1.FirstName = @p2 AND p2.FirstName = @p1))
      `);
    if (result.rowsAffected[0] > 0) {
      console.log(`  ${dc.season} champion: ${dc.p1}/${dc.p2}`);
    } else {
      console.log(`  WARNING: Could not match champion for ${dc.season}: ${dc.p1}/${dc.p2}`);
    }
  }


  // ========== Done ==========
  console.log('\n=== IMPORT COMPLETE ===');

  // Quick verification
  const counts = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM Players) AS Players,
      (SELECT COUNT(*) FROM Seasons) AS Seasons,
      (SELECT COUNT(*) FROM Teams) AS Teams,
      (SELECT COUNT(*) FROM TeamSeasons) AS TeamSeasons,
      (SELECT COUNT(*) FROM Matches) AS Matches,
      (SELECT COUNT(*) FROM Games) AS Games,
      (SELECT COUNT(*) FROM GamePlayers) AS GamePlayers,
      (SELECT COUNT(*) FROM Turns) AS Turns,
      (SELECT COUNT(*) FROM CricketTurns) AS CricketTurns
  `);
  console.log('\nDatabase counts:', counts.recordset[0]);

  await pool.close();
  console.log('Done.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
