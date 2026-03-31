/**
 * Simulate remaining Summer 2026 games using Winter 2026 player stats as reference.
 * Both players on a team share ONE score (team-based play).
 * 
 * Usage: node scripts/simulate-summer.js
 * 
 * Requires: mssql package (installed in server/)
 */

const sql = require('mssql');

// DB config
const config = {
  server: 'localhost',
  port: 1433,
  database: 'DartsLeague',
  user: 'DartsAdmin',
  password: '180Allday!',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const SUMMER_SEASON_ID = 13;

// ── Per-player X01 reference stats (from Winter 2026 + historical) ──
// avgTurn = typical score per round of 3 darts (PPR)
// outRate = probability of being the checkout player per game
// inRate = probability of hitting a double-in per game
const WINTER_X01_STATS = {
  10: { avgTurn: 39.8, stdDev: 9.9, outs: 3, ins: 1, highOut: 56, highIn: 45, games: 21 },
  13: { avgTurn: 39.8, stdDev: 9.9, outs: 11, ins: 6, highOut: 52, highIn: 54, games: 21 },
  1:  { avgTurn: 36.6, stdDev: 9.6, outs: 10, ins: 7, highOut: 58, highIn: 48, games: 21 },
  7:  { avgTurn: 36.6, stdDev: 9.6, outs: 4, ins: 0, highOut: 47, highIn: 0, games: 21 },
  11: { avgTurn: 34.6, stdDev: 8.7, outs: 7, ins: 5, highOut: 48, highIn: 48, games: 21 },
  5:  { avgTurn: 34.6, stdDev: 8.7, outs: 5, ins: 2, highOut: 41, highIn: 25, games: 21 },
  15: { avgTurn: 34.2, stdDev: 10.9, outs: 7, ins: 4, highOut: 50, highIn: 33, games: 18 },
  16: { avgTurn: 34.2, stdDev: 10.9, outs: 3, ins: 2, highOut: 47, highIn: 36, games: 18 },
  2:  { avgTurn: 34.0, stdDev: 9.4, outs: 1, ins: 3, highOut: 50, highIn: 27, games: 18 },
  3:  { avgTurn: 34.0, stdDev: 9.4, outs: 5, ins: 3, highOut: 48, highIn: 50, games: 18 },
  9:  { avgTurn: 33.7, stdDev: 9.7, outs: 5, ins: 2, highOut: 42, highIn: 47, games: 18 },
  21: { avgTurn: 33.7, stdDev: 9.7, outs: 1, ins: 4, highOut: 47, highIn: 32, games: 18 },
  20: { avgTurn: 30.2, stdDev: 10.5, outs: 2, ins: 4, highOut: 31, highIn: 25, games: 21 },
  12: { avgTurn: 30.2, stdDev: 10.5, outs: 5, ins: 3, highOut: 47, highIn: 31, games: 21 },
  8:  { avgTurn: 29.1, stdDev: 13.0, outs: 4, ins: 1, highOut: 63, highIn: 21, games: 18 },
  14: { avgTurn: 29.1, stdDev: 13.0, outs: 5, ins: 5, highOut: 39, highIn: 32, games: 18 },
  // Fallback for players not in Winter 2026 (Tony La=6, Jeremy=19)
  6:  { avgTurn: 31.6, stdDev: 9.4, outs: 3, ins: 2, highOut: 40, highIn: 30, games: 18 },
  19: { avgTurn: 36.6, stdDev: 12.0, outs: 4, ins: 3, highOut: 45, highIn: 35, games: 18 },
};

// ── Winter 2026 per-player Cricket reference stats ──
// PlayerID → { mpr, closeRate (closes/games), games }
const WINTER_CRICKET_STATS = {
  5:  { mpr: 1.69, closes: 5, games: 14 },
  11: { mpr: 1.69, closes: 4, games: 14 },
  13: { mpr: 1.62, closes: 4, games: 14 },
  10: { mpr: 1.62, closes: 4, games: 14 },
  1:  { mpr: 1.57, closes: 9, games: 14 },
  7:  { mpr: 1.57, closes: 1, games: 14 },
  8:  { mpr: 1.44, closes: 1, games: 12 },
  14: { mpr: 1.44, closes: 3, games: 12 },
  15: { mpr: 1.42, closes: 2, games: 12 },
  16: { mpr: 1.42, closes: 3, games: 12 },
  20: { mpr: 1.41, closes: 1, games: 14 },
  21: { mpr: 1.41, closes: 2, games: 12 },
  9:  { mpr: 1.41, closes: 4, games: 12 },
  12: { mpr: 1.41, closes: 4, games: 14 },
  2:  { mpr: 1.35, closes: 3, games: 12 },
  3:  { mpr: 1.35, closes: 2, games: 12 },
  // Fallback
  6:  { mpr: 1.31, closes: 3, games: 14 },
  19: { mpr: 2.12, closes: 5, games: 14 },
};

// ── Utility: Gaussian random number with Box-Muller ──
function gaussianRandom(mean, stdDev) {
  let u1, u2;
  do { u1 = Math.random(); } while (u1 === 0);
  u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

// ── Generate a realistic X01 turn score for a player ──
function generateX01TurnScore(playerStats, teamRemaining) {
  const { avgTurn, stdDev } = playerStats;

  // Generate base score from normal distribution around player average
  let score = Math.round(gaussianRandom(avgTurn, stdDev));

  // Clamp to valid range
  if (score < 0) score = 0;
  if (score > 180) score = 180;

  // Small chance of bust (score = 0) for bad rolls
  if (score < 5 && Math.random() < 0.1) score = 0;

  // Occasional high scores based on player skill level
  const skillFactor = avgTurn / 40;
  if (Math.random() < 0.008 * skillFactor) score = 180;
  else if (Math.random() < 0.025 * skillFactor) score = 140 + Math.floor(Math.random() * 21);
  else if (Math.random() < 0.05 * skillFactor) score = 100 + Math.floor(Math.random() * 21);

  // Cap at team remaining
  if (score > teamRemaining) score = teamRemaining;

  // Can't leave 1 (bust) — reduce or bust entirely
  if (teamRemaining - score === 1) {
    if (score > 2) score = score - 1;
    else score = 0; // bust
  }

  return score;
}

// ── Simulate one full X01 game (TEAM-BASED: both players share one score) ──
async function simulateX01Game(pool, gameId, homeTSID, awayTSID, homeP1, homeP2, awayP1, awayP2, target) {
  // Insert GamePlayers
  await pool.request().query(`
    INSERT INTO GamePlayers (GameID, PlayerID, TeamSeasonID, PlayerOrder) VALUES
      (${gameId}, ${homeP1}, ${homeTSID}, 1),
      (${gameId}, ${homeP2}, ${homeTSID}, 2),
      (${gameId}, ${awayP1}, ${awayTSID}, 1),
      (${gameId}, ${awayP2}, ${awayTSID}, 2)
  `);

  // TEAM remaining scores — both players on a team work on the SAME score
  let homeRemaining = target;
  let awayRemaining = target;

  // Turn order: HomeP1, AwayP1, HomeP2, AwayP2 (alternating teams, alternating players)
  const players = [
    { pid: homeP1, tsid: homeTSID, isHome: true },
    { pid: awayP1, tsid: awayTSID, isHome: false },
    { pid: homeP2, tsid: homeTSID, isHome: true },
    { pid: awayP2, tsid: awayTSID, isHome: false },
  ];

  let turnNum = 1;
  let roundNum = 1;
  let winnerTSID = null;
  const doubleInDone = {}; // track per player for IsDoubleIn stat

  const MAX_ROUNDS = 25;

  while (!winnerTSID && roundNum <= MAX_ROUNDS) {
    for (let pIdx = 0; pIdx < 4; pIdx++) {
      if (winnerTSID) break;

      const p = players[pIdx];
      const stats = WINTER_X01_STATS[p.pid] || { avgTurn: 30, stdDev: 10, outs: 2, ins: 1, highOut: 35, highIn: 25, games: 15 };
      const teamRemaining = p.isHome ? homeRemaining : awayRemaining;

      // Game already won by other team's earlier turn this round
      if (teamRemaining <= 0) continue;

      let score = 0;
      let darts = 3;
      let isOut = false;
      let isDoubleIn = false;

      // ── Double-in logic (early turns only) ──
      if (!doubleInDone[p.pid] && roundNum <= 3) {
        const inRate = stats.ins / stats.games;
        if (Math.random() < inRate * 0.4) {
          const maxIn = Math.min(stats.highIn || 40, 60);
          score = Math.max(2, 2 * Math.floor(1 + Math.random() * Math.min(maxIn / 2, 25)));
          if (score > teamRemaining) score = teamRemaining;
          isDoubleIn = true;
          doubleInDone[p.pid] = true;
        }
      }

      // ── Normal scoring (if not a double-in turn) ──
      if (!isDoubleIn) {
        score = generateX01TurnScore(stats, teamRemaining);
      }

      // ── Checkout attempt when team remaining is in checkout range ──
      if (teamRemaining <= 170 && teamRemaining > 1 && !isDoubleIn) {
        const outRate = stats.outs / stats.games;
        let checkoutProb = 0;
        if (teamRemaining <= 20) checkoutProb = 0.30 + outRate * 0.25;
        else if (teamRemaining <= 40) checkoutProb = 0.18 + outRate * 0.20;
        else if (teamRemaining <= 60) checkoutProb = 0.10 + outRate * 0.15;
        else if (teamRemaining <= 100) checkoutProb = 0.04 + outRate * 0.08;
        else checkoutProb = 0.02 + outRate * 0.03;

        if (Math.random() < checkoutProb) {
          // Successful checkout — score equals the team's remaining
          score = teamRemaining;
          darts = 1 + Math.floor(Math.random() * 3);
          isOut = true;
          winnerTSID = p.tsid;
        }
      }

      // ── Prevent impossible states ──
      if (!isOut) {
        // Cap at team remaining
        if (score > teamRemaining) score = teamRemaining;
        // Can't leave 1
        if (teamRemaining - score === 1) {
          if (score > 2) score = score - 1;
          else score = 0;
        }
        // If score would exactly hit 0 accidentally, bust (need a double to finish)
        if (score === teamRemaining && teamRemaining > 1) {
          const outRate = stats.outs / stats.games;
          if (Math.random() < 0.25 + outRate * 0.15) {
            isOut = true;
            darts = 1 + Math.floor(Math.random() * 3);
            winnerTSID = p.tsid;
          } else {
            score = 0; // bust
          }
        }
      }

      // Update team remaining
      const newRemaining = (p.isHome ? homeRemaining : awayRemaining) - score;
      if (p.isHome) homeRemaining = newRemaining;
      else awayRemaining = newRemaining;

      // Build Details JSON for All Star tracking
      let details = null;
      if (score >= 100) {
        details = JSON.stringify({
          allStarLevel: 'triple',
          allStarCount: 1,
          bust: false,
          attemptedScore: score
        });
      } else if (score === 0 && !isDoubleIn) {
        // Bust turn - record what was attempted
        details = JSON.stringify({
          allStarLevel: null,
          allStarCount: 0,
          bust: true,
          attemptedScore: 0
        });
      }

      const detailsVal = details ? `'${details.replace(/'/g, "''")}'` : 'NULL';
      await pool.request().query(`
        INSERT INTO Turns (GameID, PlayerID, TeamSeasonID, TurnNumber, RoundNumber, DartsThrown,
                           Score, RemainingScore, IsDoubleIn, IsGameOut, Details)
        VALUES (${gameId}, ${p.pid}, ${p.tsid}, ${turnNum}, ${roundNum}, ${darts},
                ${score}, ${newRemaining}, ${isDoubleIn ? 1 : 0}, ${isOut ? 1 : 0}, ${detailsVal})
      `);

      turnNum++;
    }
    roundNum++;
  }

  // If no winner after MAX_ROUNDS, force closest team to win
  if (!winnerTSID) {
    winnerTSID = homeRemaining <= awayRemaining ? homeTSID : awayTSID;
    const closerPlayers = winnerTSID === homeTSID
      ? [players[0], players[2]]
      : [players[1], players[3]];
    const wp = closerPlayers[Math.floor(Math.random() * 2)];
    const rem = winnerTSID === homeTSID ? homeRemaining : awayRemaining;

    await pool.request().query(`
      INSERT INTO Turns (GameID, PlayerID, TeamSeasonID, TurnNumber, RoundNumber, DartsThrown,
                         Score, RemainingScore, IsDoubleIn, IsGameOut)
      VALUES (${gameId}, ${wp.pid}, ${wp.tsid}, ${turnNum}, ${roundNum},
              ${1 + Math.floor(Math.random() * 3)},
              ${rem}, 0, 0, 1)
    `);
  }

  // Complete game
  await pool.request().query(`
    UPDATE Games SET Status = 'Completed', WinnerTeamSeasonID = ${winnerTSID}, UpdatedAt = SYSUTCDATETIME()
    WHERE GameID = ${gameId}
  `);

  return winnerTSID;
}

// ── Simulate one full Cricket game ──
async function simulateCricketGame(pool, gameId, homeTSID, awayTSID, homeP1, homeP2, awayP1, awayP2) {
  // Insert GamePlayers
  await pool.request().query(`
    INSERT INTO GamePlayers (GameID, PlayerID, TeamSeasonID, PlayerOrder) VALUES
      (${gameId}, ${homeP1}, ${homeTSID}, 1),
      (${gameId}, ${homeP2}, ${homeTSID}, 2),
      (${gameId}, ${awayP1}, ${awayTSID}, 1),
      (${gameId}, ${awayP2}, ${awayTSID}, 2)
  `);

  // Initialize CricketState
  await pool.request().query(`
    INSERT INTO CricketState (GameID, TeamSeasonID, Seg20, Seg19, Seg18, Seg17, Seg16, Seg15, SegBull, SegTriples, SegDoubles, SegThreeInBed, Points) VALUES
      (${gameId}, ${homeTSID}, 0,0,0,0,0,0,0, 0,0,0, 0),
      (${gameId}, ${awayTSID}, 0,0,0,0,0,0,0, 0,0,0, 0)
  `);

  const SEGMENTS = ['Seg20', 'Seg19', 'Seg18', 'Seg17', 'Seg16', 'Seg15', 'SegBull'];
  const SEG_VALUES = { Seg20: 20, Seg19: 19, Seg18: 18, Seg17: 17, Seg16: 16, Seg15: 15, SegBull: 25 };

  // Team states
  const state = {
    [homeTSID]: { Seg20: 0, Seg19: 0, Seg18: 0, Seg17: 0, Seg16: 0, Seg15: 0, SegBull: 0, Points: 0 },
    [awayTSID]: { Seg20: 0, Seg19: 0, Seg18: 0, Seg17: 0, Seg16: 0, Seg15: 0, SegBull: 0, Points: 0 },
  };

  const players = [
    { pid: homeP1, tsid: homeTSID },
    { pid: awayP1, tsid: awayTSID },
    { pid: homeP2, tsid: homeTSID },
    { pid: awayP2, tsid: awayTSID },
  ];

  let turnNum = 1;
  let roundNum = 1;
  let winnerTSID = null;
  const MAX_ROUNDS = 25;

  while (!winnerTSID && roundNum <= MAX_ROUNDS) {
    for (let pIdx = 0; pIdx < 4; pIdx++) {
      if (winnerTSID) break;

      const p = players[pIdx];
      const cricStats = WINTER_CRICKET_STATS[p.pid] || { mpr: 1.4, closes: 2, games: 14 };
      const opponentTSID = p.tsid === homeTSID ? awayTSID : homeTSID;

      // Generate marks for this turn based on player MPR
      // MPR = marks per round (3 darts). Use Gaussian around MPR
      let totalMarks = Math.round(gaussianRandom(cricStats.mpr, cricStats.mpr * 0.4));
      if (totalMarks < 0) totalMarks = 0;
      if (totalMarks > 9) totalMarks = 9; // max 9 marks in 3 darts

      // Distribute marks across open segments
      const myState = state[p.tsid];
      const oppState = state[opponentTSID];
      
      // Find open segments (not both closed)
      const openSegs = SEGMENTS.filter(seg => {
        const myClosed = myState[seg] >= 3;
        const oppClosed = oppState[seg] >= 3;
        return !(myClosed && oppClosed); // open if not both closed
      });

      // Prioritize: player's unclosed segments first, then scoring opportunities
      const turnMarks = { Seg15: 0, Seg16: 0, Seg17: 0, Seg18: 0, Seg19: 0, Seg20: 0, SegBull: 0 };
      let remainingMarks = totalMarks;
      let turnPoints = 0;

      // Smart distribution: focus on highest value open segments
      // Sort by segment value (highest first), preferring unclosed own segments
      const prioritized = openSegs.sort((a, b) => {
        const aOpen = myState[a] < 3;
        const bOpen = myState[b] < 3;
        if (aOpen && !bOpen) return -1;
        if (!aOpen && bOpen) return 1;
        return SEG_VALUES[b] - SEG_VALUES[a];
      });

      while (remainingMarks > 0 && prioritized.length > 0) {
        // Pick a segment (weighted toward first/best)
        const segIdx = Math.random() < 0.6 ? 0 : Math.floor(Math.random() * prioritized.length);
        const seg = prioritized[segIdx];
        
        // How many marks on this segment (1-3)
        const marksHere = Math.min(remainingMarks, 1 + Math.floor(Math.random() * 3));
        
        turnMarks[seg] += marksHere;
        myState[seg] += marksHere;
        remainingMarks -= marksHere;

        // Check for scoring: if we're past 3 and opponent hasn't closed
        if (myState[seg] > 3 && oppState[seg] < 3) {
          const scoringMarks = Math.min(myState[seg] - 3, marksHere);
          turnPoints += scoringMarks * SEG_VALUES[seg];
        }

        // Cap at 9 marks on a segment 
        if (myState[seg] > 9) myState[seg] = 9;

        // Remove from prioritized if both teams closed
        if (myState[seg] >= 3 && oppState[seg] >= 3) {
          prioritized.splice(segIdx, 1);
        }
      }

      myState.Points += turnPoints;
      let isClose = false;

      // Check for win: all 7 segments closed (>=3) and points >= opponent
      const allClosed = SEGMENTS.every(seg => myState[seg] >= 3);
      if (allClosed && myState.Points >= oppState.Points) {
        winnerTSID = p.tsid;
        isClose = true;
      }

      // Build Details JSON for Cricket allStar tracking (9 marks = all-star)
      let cricketDetails = null;
      if (totalMarks >= 9) {
        cricketDetails = JSON.stringify({
          taps: turnMarks,
          allStarLevel: 'triple',
          allStarCount: 1,
          close: isClose
        });
      } else if (totalMarks >= 6) {
        // 6+ marks = allstar level
        cricketDetails = JSON.stringify({
          taps: turnMarks,
          allStarLevel: 'allstar',
          allStarCount: 1,
          close: isClose
        });
      }

      const cricDetailVal = cricketDetails ? `'${cricketDetails.replace(/'/g, "''")}'` : 'NULL';
      // Insert CricketTurn
      await pool.request().query(`
        INSERT INTO CricketTurns (GameID, PlayerID, TeamSeasonID, TurnNumber, RoundNumber, DartsThrown,
          Seg15, Seg16, Seg17, Seg18, Seg19, Seg20, SegBull,
          Points, MarksScored, IsCricketClose, IsShanghaiBonus, Details)
        VALUES (${gameId}, ${p.pid}, ${p.tsid}, ${turnNum}, ${roundNum}, 3,
          ${turnMarks.Seg15}, ${turnMarks.Seg16}, ${turnMarks.Seg17}, ${turnMarks.Seg18}, 
          ${turnMarks.Seg19}, ${turnMarks.Seg20}, ${turnMarks.SegBull},
          ${turnPoints}, ${totalMarks}, ${isClose ? 1 : 0}, 0, ${cricDetailVal})
      `);

      turnNum++;
    }
    roundNum++;
  }

  // If timed out, pick winner based on who's closer
  if (!winnerTSID) {
    const homeTotal = SEGMENTS.reduce((s, seg) => s + Math.min(state[homeTSID][seg], 3), 0);
    const awayTotal = SEGMENTS.reduce((s, seg) => s + Math.min(state[awayTSID][seg], 3), 0);
    winnerTSID = homeTotal > awayTotal ? homeTSID 
      : awayTotal > homeTotal ? awayTSID 
      : Math.random() < 0.5 ? homeTSID : awayTSID;
  }

  // Update CricketState
  for (const tsid of [homeTSID, awayTSID]) {
    const s = state[tsid];
    await pool.request().query(`
      UPDATE CricketState SET
        Seg20=${s.Seg20}, Seg19=${s.Seg19}, Seg18=${s.Seg18}, Seg17=${s.Seg17},
        Seg16=${s.Seg16}, Seg15=${s.Seg15}, SegBull=${s.SegBull}, Points=${s.Points}
      WHERE GameID=${gameId} AND TeamSeasonID=${tsid}
    `);
  }

  // Complete game
  await pool.request().query(`
    UPDATE Games SET Status = 'Completed', WinnerTeamSeasonID = ${winnerTSID}, UpdatedAt = SYSUTCDATETIME()
    WHERE GameID = ${gameId}
  `);

  return winnerTSID;
}

// ── Simulate a full 5-game match ──
async function simulateMatch(pool, matchId, seasonId, homeTSID, awayTSID, homeP1, homeP2, awayP1, awayP2) {
  // Set match to InProgress
  await pool.request().query(`
    UPDATE Matches SET Status = 'InProgress', UpdatedAt = SYSUTCDATETIME() WHERE MatchID = ${matchId}
  `);

  // Get game format
  const formats = await pool.request().query(`
    SELECT GameNumber, GameType, X01Target FROM SeasonGameFormats
    WHERE SeasonID = ${seasonId} ORDER BY GameNumber
  `);

  let homeGameWins = 0;
  let awayGameWins = 0;

  for (const fmt of formats.recordset) {
    // Create game
    const result = await pool.request().query(`
      INSERT INTO Games (MatchID, GameType, GameNumber, X01Target, Status)
      OUTPUT INSERTED.GameID
      VALUES (${matchId}, '${fmt.GameType}', ${fmt.GameNumber}, ${fmt.X01Target || 'NULL'}, 'InProgress')
    `);
    const gameId = result.recordset[0].GameID;

    let winner;
    if (fmt.GameType === 'X01') {
      winner = await simulateX01Game(pool, gameId, homeTSID, awayTSID, homeP1, homeP2, awayP1, awayP2, fmt.X01Target);
    } else {
      // Cricket or Shanghai
      winner = await simulateCricketGame(pool, gameId, homeTSID, awayTSID, homeP1, homeP2, awayP1, awayP2);
    }

    if (winner === homeTSID) homeGameWins++;
    else awayGameWins++;
  }

  // Determine match winner
  const matchWinner = homeGameWins > awayGameWins ? homeTSID : awayTSID;

  // Complete match
  await pool.request().query(`
    UPDATE Matches SET Status = 'Completed', WinnerTeamSeasonID = ${matchWinner},
      HomeScore = ${homeGameWins}, AwayScore = ${awayGameWins}, UpdatedAt = SYSUTCDATETIME()
    WHERE MatchID = ${matchId}
  `);

  // Update TeamSeasons 
  await pool.request().query(`
    UPDATE TeamSeasons SET GameWins = GameWins + ${homeGameWins} WHERE TeamSeasonID = ${homeTSID};
    UPDATE TeamSeasons SET GameWins = GameWins + ${awayGameWins} WHERE TeamSeasonID = ${awayTSID};
  `);

  if (matchWinner === homeTSID) {
    await pool.request().query(`
      UPDATE TeamSeasons SET Wins = Wins + 1 WHERE TeamSeasonID = ${homeTSID};
      UPDATE TeamSeasons SET Losses = Losses + 1 WHERE TeamSeasonID = ${awayTSID};
    `);
  } else {
    await pool.request().query(`
      UPDATE TeamSeasons SET Wins = Wins + 1 WHERE TeamSeasonID = ${awayTSID};
      UPDATE TeamSeasons SET Losses = Losses + 1 WHERE TeamSeasonID = ${homeTSID};
    `);
  }

  return { matchWinner, homeGameWins, awayGameWins };
}

// ── Main ──
async function main() {
  console.log('=== Summer 2026 Season Simulation (Team-Based Scoring) ===\n');
  
  const pool = await sql.connect(config);

  // ── Step 1: Clean up any previous simulation data for this season ──
  console.log('Cleaning up previous simulation data...');
  
  // Get all games from Summer 2026 matches
  const existingGames = await pool.request().query(`
    SELECT g.GameID FROM Games g
    JOIN Matches m ON g.MatchID = m.MatchID
    WHERE m.SeasonID = ${SUMMER_SEASON_ID}
  `);
  
  if (existingGames.recordset.length > 0) {
    const gameIds = existingGames.recordset.map(r => r.GameID).join(',');
    // Delete in correct FK order
    await pool.request().query(`DELETE FROM CricketTurns WHERE GameID IN (${gameIds})`);
    await pool.request().query(`DELETE FROM CricketState WHERE GameID IN (${gameIds})`);
    await pool.request().query(`DELETE FROM Turns WHERE GameID IN (${gameIds})`);
    await pool.request().query(`DELETE FROM GamePlayers WHERE GameID IN (${gameIds})`);
    await pool.request().query(`DELETE FROM Games WHERE GameID IN (${gameIds})`);
    console.log(`  Deleted ${existingGames.recordset.length} existing games and related data.`);
  }
  
  // Reset match statuses and TeamSeasons W/L/GW 
  await pool.request().query(`
    UPDATE Matches SET Status = 'Scheduled', WinnerTeamSeasonID = NULL, 
      HomeScore = 0, AwayScore = 0, UpdatedAt = SYSUTCDATETIME()
    WHERE SeasonID = ${SUMMER_SEASON_ID}
  `);
  await pool.request().query(`
    UPDATE TeamSeasons SET Wins = 0, Losses = 0, Draws = 0, GameWins = 0
    WHERE SeasonID = ${SUMMER_SEASON_ID}
  `);
  console.log('  Reset matches and standings.\n');

  // Get all scheduled matches for Summer 2026
  const matches = await pool.request().query(`
    SELECT m.MatchID, m.RoundNumber, m.HomeTeamSeasonID, m.AwayTeamSeasonID,
      ht.TeamName AS HomeTeam, at2.TeamName AS AwayTeam,
      t1.Player1ID AS HP1, t1.Player2ID AS HP2,
      t2.Player1ID AS AP1, t2.Player2ID AS AP2
    FROM Matches m
    JOIN TeamSeasons hts ON m.HomeTeamSeasonID = hts.TeamSeasonID
    JOIN Teams t1 ON hts.TeamID = t1.TeamID
    JOIN Teams ht ON hts.TeamID = ht.TeamID
    JOIN TeamSeasons ats ON m.AwayTeamSeasonID = ats.TeamSeasonID
    JOIN Teams t2 ON ats.TeamID = t2.TeamID
    JOIN Teams at2 ON ats.TeamID = at2.TeamID
    WHERE m.SeasonID = ${SUMMER_SEASON_ID} AND m.Status = 'Scheduled'
    ORDER BY m.RoundNumber, m.MatchID
  `);

  console.log(`Found ${matches.recordset.length} scheduled matches to simulate.\n`);

  let currentRound = 0;

  for (const match of matches.recordset) {
    if (match.RoundNumber !== currentRound) {
      currentRound = match.RoundNumber;
      console.log(`\n── Round ${currentRound} ──`);
    }

    const result = await simulateMatch(
      pool,
      match.MatchID,
      SUMMER_SEASON_ID,
      match.HomeTeamSeasonID,
      match.AwayTeamSeasonID,
      match.HP1, match.HP2,
      match.AP1, match.AP2
    );

    const winnerName = result.matchWinner === match.HomeTeamSeasonID ? match.HomeTeam : match.AwayTeam;
    console.log(`  Match ${match.MatchID}: ${match.HomeTeam} vs ${match.AwayTeam}  →  ${winnerName} wins (${result.homeGameWins}-${result.awayGameWins})`);
  }

  // Print final standings
  const standings = await pool.request().query(`
    SELECT t.TeamName, ts.Wins, ts.Losses, ts.GameWins
    FROM TeamSeasons ts
    JOIN Teams t ON ts.TeamID = t.TeamID
    WHERE ts.SeasonID = ${SUMMER_SEASON_ID}
    ORDER BY ts.Wins DESC, ts.GameWins DESC
  `);

  console.log('\n\n=== Final Standings ===');
  console.log('Team                                    W    L    GW');
  console.log('─'.repeat(55));
  for (const row of standings.recordset) {
    console.log(`${row.TeamName.padEnd(40)} ${String(row.Wins).padStart(2)}   ${String(row.Losses).padStart(2)}   ${String(row.GameWins).padStart(3)}`);
  }

  // Print player stat summary
  const playerStats = await pool.request().query(`
    SELECT p.FirstName + ' ' + p.LastName AS PlayerName,
      COUNT(DISTINCT t.GameID) as GP,
      CAST(ROUND(AVG(CAST(t.Score AS FLOAT) / NULLIF(t.DartsThrown,0)) * 3, 1) AS DECIMAL(6,1)) as PPR,
      SUM(CASE WHEN t.IsGameOut = 1 THEN 1 ELSE 0 END) as Outs,
      SUM(CASE WHEN t.IsDoubleIn = 1 THEN 1 ELSE 0 END) as Ins
    FROM Turns t
    JOIN Games g ON t.GameID = g.GameID
    JOIN Matches m ON g.MatchID = m.MatchID
    JOIN Players p ON t.PlayerID = p.PlayerID
    WHERE m.SeasonID = ${SUMMER_SEASON_ID} AND g.GameType = 'X01'
    GROUP BY p.PlayerID, p.FirstName, p.LastName
    ORDER BY PPR DESC
  `);

  console.log('\n=== X01 Player Stats ===');
  console.log('Player                          GP    PPR   OUT   IN');
  console.log('─'.repeat(55));
  for (const row of playerStats.recordset) {
    console.log(`${row.PlayerName.padEnd(32)} ${String(row.GP).padStart(2)}   ${String(row.PPR).padStart(5)}   ${String(row.Outs).padStart(3)}   ${String(row.Ins).padStart(3)}`);
  }

  const cricketStats = await pool.request().query(`
    SELECT p.FirstName + ' ' + p.LastName AS PlayerName,
      COUNT(DISTINCT ct.GameID) as GP,
      CAST(ROUND(AVG(CAST(ct.MarksScored AS FLOAT) / NULLIF(ct.DartsThrown,0)) * 3, 2) AS DECIMAL(6,2)) as MPR,
      SUM(CASE WHEN ct.IsCricketClose = 1 THEN 1 ELSE 0 END) as Closes
    FROM CricketTurns ct
    JOIN Games g ON ct.GameID = g.GameID
    JOIN Matches m ON g.MatchID = m.MatchID
    JOIN Players p ON ct.PlayerID = p.PlayerID
    WHERE m.SeasonID = ${SUMMER_SEASON_ID}
    GROUP BY p.PlayerID, p.FirstName, p.LastName
    ORDER BY MPR DESC
  `);

  console.log('\n=== Cricket Player Stats ===');
  console.log('Player                          GP     MPR   CL');
  console.log('─'.repeat(50));
  for (const row of cricketStats.recordset) {
    console.log(`${row.PlayerName.padEnd(32)} ${String(row.GP).padStart(2)}   ${String(row.MPR).padStart(5)}   ${String(row.Closes).padStart(3)}`);
  }

  // Validation: turns per game to confirm team-based scoring works
  const turnsPerGame = await pool.request().query(`
    SELECT g.GameType, g.X01Target,
      AVG(tc.TurnCount) as AvgTurns, MIN(tc.TurnCount) as MinTurns, MAX(tc.TurnCount) as MaxTurns
    FROM Games g
    JOIN Matches m ON g.MatchID = m.MatchID
    CROSS APPLY (
      SELECT COUNT(*) as TurnCount FROM Turns t WHERE t.GameID = g.GameID
      UNION ALL
      SELECT COUNT(*) FROM CricketTurns ct WHERE ct.GameID = g.GameID
    ) tc
    WHERE m.SeasonID = ${SUMMER_SEASON_ID} AND tc.TurnCount > 0
    GROUP BY g.GameType, g.X01Target
    ORDER BY g.GameType, g.X01Target
  `);

  console.log('\n=== Turns Per Game (validation) ===');
  for (const row of turnsPerGame.recordset) {
    console.log(`  ${row.GameType} ${row.X01Target || ''}: avg=${row.AvgTurns} min=${row.MinTurns} max=${row.MaxTurns}`);
  }

  console.log('\n=== Simulation Complete ===');
  
  await pool.close();
}

main().catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
