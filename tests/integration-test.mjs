/**
 * Integration Test Script — Darts League App
 * 
 * Tests all major API flows by interacting with the running server.
 * Run: node tests/integration-test.mjs
 * Requires: Server running on localhost:3001
 */

const BASE = 'http://localhost:3001/api';

let passed = 0;
let failed = 0;
const failures = [];

// ── Helpers ──────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

function assert(condition, label, detail) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    const msg = `  ❌ ${label}${detail ? ' — ' + detail : ''}`;
    console.log(msg);
    failures.push(msg);
  }
}

// Track created resources for cleanup
const cleanup = { gameIds: [], playerIds: [] };

// ── Tests ────────────────────────────────────────────────────────────

async function testPlayerCRUD() {
  console.log('\n── Player CRUD ──');

  // List
  const list = await api('GET', '/players');
  assert(list.ok && Array.isArray(list.data), 'GET /players returns array');
  const originalCount = list.data.length;

  // Create
  const created = await api('POST', '/players', {
    FirstName: 'Test', LastName: 'Player', Nickname: 'TP',
  });
  assert(created.status === 201 && created.data.PlayerID, 'POST /players creates player',
    `ID=${created.data?.PlayerID}`);
  const pid = created.data.PlayerID;
  cleanup.playerIds.push(pid);

  // Get by ID
  const single = await api('GET', `/players/${pid}`);
  assert(single.ok && single.data.FirstName === 'Test', `GET /players/${pid} returns created player`);

  // Update
  const updated = await api('PUT', `/players/${pid}`, { Nickname: 'Updated' });
  assert(updated.ok && updated.data.Nickname === 'Updated', 'PUT /players/:id updates nickname');

  // Verify list count
  const list2 = await api('GET', '/players');
  assert(list2.data.length === originalCount + 1, 'Player count increased by 1');

  return pid;
}

async function testSoloAdHocX01(playerId) {
  console.log('\n── Solo Ad-Hoc X01 Game ──');

  // Create solo game (1 player, no team B)
  const res = await api('POST', '/games/ad-hoc', {
    GameType: 'X01',
    X01Target: 301,
    DoubleInRequired: false,
    TeamAPlayers: [playerId],
    TeamBPlayers: [],
    TeamPlay: false,
  });
  assert(res.status === 201 && res.data.GameID, 'Solo X01 game created',
    `GameID=${res.data?.GameID}, Status=${res.data?.Status}`);

  if (!res.ok) {
    console.log('    Response:', JSON.stringify(res.data).substring(0, 200));
    return null;
  }

  const gameId = res.data.GameID;
  const matchId = res.data.MatchID;
  cleanup.gameIds.push(gameId);

  // Verify game details
  const game = await api('GET', `/games/${gameId}`);
  assert(game.ok && game.data.GameType === 'X01' && game.data.X01Target === 301,
    'Game details correct (X01, 301)');

  // Get game players
  const players = await api('GET', `/games/${gameId}/players`);
  assert(players.ok && players.data.length >= 1, `Game has ${players.data?.length} player(s) assigned`);

  // Get match details
  const match = await api('GET', `/matches/${matchId}`);
  assert(match.ok && match.data.Status === 'InProgress', 'Match is InProgress');

  // Add turns to simulate a short game
  const tsId = players.data[0].TeamSeasonID;

  const turn1 = await api('POST', `/games/${gameId}/turns`, {
    PlayerID: playerId, TeamSeasonID: tsId,
    TurnNumber: 1, RoundNumber: 1,
    DartsThrown: 3, Score: 100, RemainingScore: 201,
  });
  assert(turn1.status === 201, 'Turn 1 added (100 scored, 201 remaining)');

  const turn2 = await api('POST', `/games/${gameId}/turns`, {
    PlayerID: playerId, TeamSeasonID: tsId,
    TurnNumber: 2, RoundNumber: 2,
    DartsThrown: 3, Score: 140, RemainingScore: 61,
  });
  assert(turn2.status === 201, 'Turn 2 added (140 scored, 61 remaining)');

  const turn3 = await api('POST', `/games/${gameId}/turns`, {
    PlayerID: playerId, TeamSeasonID: tsId,
    TurnNumber: 3, RoundNumber: 3,
    DartsThrown: 2, Score: 61, RemainingScore: 0,
    IsGameOut: true,
  });
  assert(turn3.status === 201, 'Turn 3 added (61 out, game finished)');

  // Verify turns
  const turns = await api('GET', `/games/${gameId}/turns`);
  assert(turns.ok && turns.data.length === 3, `Game has ${turns.data?.length} turns`);

  // Undo last turn
  const undo = await api('DELETE', `/games/${gameId}/turns/last`);
  assert(undo.ok, 'Undo last turn succeeds');

  const turnsAfterUndo = await api('GET', `/games/${gameId}/turns`);
  assert(turnsAfterUndo.data.length === 2, 'Turn count = 2 after undo');

  // Re-add the final turn
  await api('POST', `/games/${gameId}/turns`, {
    PlayerID: playerId, TeamSeasonID: tsId,
    TurnNumber: 3, RoundNumber: 3,
    DartsThrown: 2, Score: 61, RemainingScore: 0,
    IsGameOut: true,
  });

  // Complete game
  const complete = await api('PUT', `/games/${gameId}/status`, {
    Status: 'Completed', WinnerTeamSeasonID: tsId,
  });
  assert(complete.ok && complete.data.Status === 'Completed', 'Game completed');

  return { gameId, matchId, tsId };
}

async function testTwoPlayerAdHocX01(player1Id, player2Id) {
  console.log('\n── 1v1 Ad-Hoc X01 (auto-split, no team play) ──');

  const res = await api('POST', '/games/ad-hoc', {
    GameType: 'X01',
    X01Target: 501,
    DoubleInRequired: false,
    TeamAPlayers: [player1Id],
    TeamBPlayers: [player2Id],
    TeamPlay: false,
  });
  assert(res.status === 201 && res.data.GameID, '1v1 X01 game created',
    `GameID=${res.data?.GameID}`);

  if (!res.ok) {
    console.log('    Response:', JSON.stringify(res.data).substring(0, 200));
    return null;
  }

  const gameId = res.data.GameID;
  cleanup.gameIds.push(gameId);

  // Verify 2 players assigned
  const players = await api('GET', `/games/${gameId}/players`);
  assert(players.ok && players.data.length === 2, `2 players assigned to game`);

  // Verify they're on different teams
  const teams = new Set(players.data.map(p => p.TeamSeasonID));
  assert(teams.size === 2, 'Players are on different teams (auto-split worked)');

  // Get team season IDs
  const p1Data = players.data.find(p => p.PlayerID === player1Id);
  const p2Data = players.data.find(p => p.PlayerID === player2Id);

  // Simulate a quick game: alternating turns
  const turns = [
    { pid: player1Id, tsId: p1Data.TeamSeasonID, score: 180, rem: 321 },
    { pid: player2Id, tsId: p2Data.TeamSeasonID, score: 140, rem: 361 },
    { pid: player1Id, tsId: p1Data.TeamSeasonID, score: 180, rem: 141 },
    { pid: player2Id, tsId: p2Data.TeamSeasonID, score: 180, rem: 181 },
    { pid: player1Id, tsId: p1Data.TeamSeasonID, score: 100, rem: 41 },
    { pid: player2Id, tsId: p2Data.TeamSeasonID, score: 140, rem: 41 },
    { pid: player1Id, tsId: p1Data.TeamSeasonID, score: 41, rem: 0, out: true },
  ];

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    await api('POST', `/games/${gameId}/turns`, {
      PlayerID: t.pid, TeamSeasonID: t.tsId,
      TurnNumber: i + 1, RoundNumber: Math.floor(i / 2) + 1,
      DartsThrown: 3, Score: t.score, RemainingScore: t.rem,
      IsGameOut: t.out || false,
    });
  }

  const turnsResult = await api('GET', `/games/${gameId}/turns`);
  assert(turnsResult.ok && turnsResult.data.length === 7, `${turnsResult.data?.length} turns recorded`);

  // Complete with player1 winning
  const complete = await api('PUT', `/games/${gameId}/status`, {
    Status: 'Completed', WinnerTeamSeasonID: p1Data.TeamSeasonID,
  });
  assert(complete.ok && complete.data.Status === 'Completed', '1v1 game completed');

  return { gameId, p1TeamSeasonId: p1Data.TeamSeasonID, p2TeamSeasonId: p2Data.TeamSeasonID };
}

async function testCricketGame(player1Id, player2Id) {
  console.log('\n── Cricket Game ──');

  const res = await api('POST', '/games/ad-hoc', {
    GameType: 'Cricket',
    TeamAPlayers: [player1Id],
    TeamBPlayers: [player2Id],
    TeamPlay: false,
  });
  assert(res.status === 201, 'Cricket game created', `GameID=${res.data?.GameID}`);

  if (!res.ok) {
    console.log('    Response:', JSON.stringify(res.data).substring(0, 200));
    return null;
  }

  const gameId = res.data.GameID;
  cleanup.gameIds.push(gameId);

  const players = await api('GET', `/games/${gameId}/players`);
  const p1 = players.data.find(p => p.PlayerID === player1Id);
  const p2 = players.data.find(p => p.PlayerID === player2Id);

  // Init cricket state for both teams
  await api('PUT', `/games/${gameId}/cricket-state`, {
    TeamSeasonID: p1.TeamSeasonID, Seg20: 0, Seg19: 0, Seg18: 0,
    Seg17: 0, Seg16: 0, Seg15: 0, SegBull: 0, Points: 0,
  });
  await api('PUT', `/games/${gameId}/cricket-state`, {
    TeamSeasonID: p2.TeamSeasonID, Seg20: 0, Seg19: 0, Seg18: 0,
    Seg17: 0, Seg16: 0, Seg15: 0, SegBull: 0, Points: 0,
  });

  // Add cricket turns (P1 closes 20s with 3 marks)
  const ct1 = await api('POST', `/games/${gameId}/cricket-turns`, {
    PlayerID: player1Id, TeamSeasonID: p1.TeamSeasonID,
    TurnNumber: 1, RoundNumber: 1, DartsThrown: 3,
    Seg20: 3, MarksScored: 3, Points: 0,
  });
  assert(ct1.status === 201, 'Cricket turn 1 added (P1 hits Triple 20)');

  // Update cricket state
  await api('PUT', `/games/${gameId}/cricket-state`, {
    TeamSeasonID: p1.TeamSeasonID, Seg20: 3,
  });

  // Verify cricket state
  const state = await api('GET', `/games/${gameId}/cricket-state`);
  assert(state.ok && state.data.length === 2, 'Cricket state has 2 entries');
  const p1State = state.data.find(s => s.TeamSeasonID === p1.TeamSeasonID);
  assert(p1State && p1State.Seg20 === 3, 'P1 has 3 marks on 20');

  // Verify cricket turns
  const cturns = await api('GET', `/games/${gameId}/cricket-turns`);
  assert(cturns.ok && cturns.data.length === 1, 'Cricket turn recorded');

  // Undo cricket turn
  const undoCricket = await api('DELETE', `/games/${gameId}/cricket-turns/last`);
  assert(undoCricket.ok, 'Undo cricket turn succeeds');

  const cturnsAfter = await api('GET', `/games/${gameId}/cricket-turns`);
  assert(cturnsAfter.data.length === 0, 'Cricket turns empty after undo');

  return gameId;
}

async function testShanghaiGame(player1Id, player2Id) {
  console.log('\n── Shanghai Game ──');

  const res = await api('POST', '/games/ad-hoc', {
    GameType: 'Shanghai',
    TeamAPlayers: [player1Id],
    TeamBPlayers: [player2Id],
    TeamPlay: false,
  });
  assert(res.status === 201, 'Shanghai game created', `GameID=${res.data?.GameID}`);

  if (!res.ok) {
    console.log('    Response:', JSON.stringify(res.data).substring(0, 200));
    return null;
  }

  const gameId = res.data.GameID;
  cleanup.gameIds.push(gameId);

  const players = await api('GET', `/games/${gameId}/players`);
  const p1 = players.data.find(p => p.PlayerID === player1Id);
  const p2 = players.data.find(p => p.PlayerID === player2Id);

  // Init cricket state (Shanghai uses CricketState for segment tracking)
  await api('PUT', `/games/${gameId}/cricket-state`, {
    TeamSeasonID: p1.TeamSeasonID, Seg20: 0, Seg19: 0, Seg18: 0,
    Seg17: 0, Seg16: 0, Seg15: 0, SegBull: 0,
    SegTriples: 0, SegDoubles: 0, SegThreeInBed: 0, Points: 0,
  });
  await api('PUT', `/games/${gameId}/cricket-state`, {
    TeamSeasonID: p2.TeamSeasonID, Seg20: 0, Seg19: 0, Seg18: 0,
    Seg17: 0, Seg16: 0, Seg15: 0, SegBull: 0,
    SegTriples: 0, SegDoubles: 0, SegThreeInBed: 0, Points: 0,
  });

  // Shanghai uses regular Turns (not CricketTurns)
  const t1 = await api('POST', `/games/${gameId}/turns`, {
    PlayerID: player1Id, TeamSeasonID: p1.TeamSeasonID,
    TurnNumber: 1, RoundNumber: 1, DartsThrown: 3,
    Score: 40, MarksScored: 3,
    Details: JSON.stringify({ segment: '20', marks: 3, taps: { '20': { single: 0, double: 1, triple: 0 } } }),
  });
  assert(t1.status === 201, 'Shanghai turn 1 added (P1 on 20)');

  // Update state
  await api('PUT', `/games/${gameId}/cricket-state`, {
    TeamSeasonID: p1.TeamSeasonID, Seg20: 3, Points: 40,
  });

  // Verify turns and state
  const turns = await api('GET', `/games/${gameId}/turns`);
  assert(turns.ok && turns.data.length === 1, 'Shanghai turn in Turns table');

  const cturns = await api('GET', `/games/${gameId}/cricket-turns`);
  assert(cturns.ok && cturns.data.length === 0, 'No cricket turns for Shanghai (correct)');

  const state = await api('GET', `/games/${gameId}/cricket-state`);
  const p1State = state.data.find(s => s.TeamSeasonID === p1.TeamSeasonID);
  assert(p1State && p1State.Seg20 === 3, 'Shanghai state tracks marks in CricketState');

  // Test Shanghai bonus
  const bonus = await api('POST', `/games/${gameId}/turns`, {
    PlayerID: player1Id, TeamSeasonID: p1.TeamSeasonID,
    TurnNumber: 2, RoundNumber: 1, DartsThrown: 0,
    Score: 200, IsShanghaiBonus: true,
    Details: JSON.stringify({ shanghai: true }),
  });
  assert(bonus.status === 201, 'Shanghai +200 bonus turn added');

  // Undo bonus
  const undo = await api('DELETE', `/games/${gameId}/turns/last`);
  assert(undo.ok, 'Undo Shanghai bonus succeeds');

  return gameId;
}

async function testRoundTheWorldGame(player1Id, player2Id) {
  console.log('\n── Round the World Game ──');

  // Test random mode
  const res = await api('POST', '/games/ad-hoc', {
    GameType: 'RoundTheWorld',
    RtwMode: 'Random',
    TeamAPlayers: [player1Id],
    TeamBPlayers: [player2Id],
    TeamPlay: false,
  });
  assert(res.status === 201, 'RTW Random game created', `GameID=${res.data?.GameID}`);

  if (!res.ok) {
    console.log('    Response:', JSON.stringify(res.data).substring(0, 200));
    return null;
  }

  const gameId = res.data.GameID;
  cleanup.gameIds.push(gameId);

  const game = await api('GET', `/games/${gameId}`);
  assert(game.data.RtwMode === 'Random', 'RTW mode is Random');
  assert(game.data.RtwSequence, 'RTW sequence generated');

  // Parse sequence
  let seq;
  try {
    seq = JSON.parse(game.data.RtwSequence);
    assert(seq.length === 21, `RTW sequence has ${seq.length} targets (1-20 + Bull)`);
  } catch {
    assert(false, 'RTW sequence is valid JSON');
  }

  // Add a turn (hit target)
  const players = await api('GET', `/games/${gameId}/players`);
  const p1 = players.data.find(p => p.PlayerID === player1Id);

  const t1 = await api('POST', `/games/${gameId}/turns`, {
    PlayerID: player1Id, TeamSeasonID: p1.TeamSeasonID,
    TurnNumber: 1, RoundNumber: 1, DartsThrown: 3,
    Score: seq[0], RtwTargetHit: true,
  });
  assert(t1.status === 201, `RTW turn: hit target ${seq[0]}`);

  return gameId;
}

async function testTeamPlayAdHoc(players) {
  console.log('\n── Team Play Ad-Hoc (2v2) ──');

  const [p1, p2, p3, p4] = players.slice(0, 4).map(p => p.PlayerID);

  const res = await api('POST', '/games/ad-hoc', {
    GameType: 'X01',
    X01Target: 501,
    DoubleInRequired: false,
    TeamAPlayers: [p1, p2],
    TeamBPlayers: [p3, p4],
    TeamPlay: true,
  });
  assert(res.status === 201, '2v2 team play game created', `GameID=${res.data?.GameID}`);

  if (!res.ok) {
    console.log('    Response:', JSON.stringify(res.data).substring(0, 200));
    return null;
  }

  const gameId = res.data.GameID;
  cleanup.gameIds.push(gameId);

  // Verify 4 players assigned
  const gp = await api('GET', `/games/${gameId}/players`);
  assert(gp.ok && gp.data.length === 4, `4 players assigned to 2v2 game`);

  // Verify 2 teams
  const teamIds = new Set(gp.data.map(p => p.TeamSeasonID));
  assert(teamIds.size === 2, 'Players split into 2 teams');

  return gameId;
}

async function testLiveMatches() {
  console.log('\n── Live Matches ──');

  const res = await api('GET', '/matches/live');
  assert(res.ok && Array.isArray(res.data), 'GET /matches/live returns array');
  console.log(`    Found ${res.data.length} live match(es)`);
}

async function testPlayerStats(playerId) {
  console.log('\n── Player Stats ──');

  const stats = await api('GET', `/stats/players/${playerId}`);
  assert(stats.ok, 'GET /stats/players/:id succeeds');
  if (stats.ok) {
    const s = stats.data;
    console.log(`    PPD: ${s.PPD ?? 'N/A'}, MPR: ${s.MPR ?? 'N/A'}, Games: ${s.GamesPlayed ?? 0}`);
    assert(s.PPD !== undefined, 'PPD stat present');
    assert(s.MPR !== undefined, 'MPR stat present');
  }

  // Game log
  const log = await api('GET', `/stats/players/${playerId}/games`);
  assert(log.ok && Array.isArray(log.data), 'Player game log returns array');
  console.log(`    Game log entries: ${log.data?.length}`);
}

async function testCoinToss() {
  console.log('\n── Coin Toss ──');

  // Create a quick ad-hoc game to get a matchId
  const playersList = await api('GET', '/players');
  const [p1, p2] = playersList.data.slice(0, 2);

  const game = await api('POST', '/games/ad-hoc', {
    GameType: 'X01', X01Target: 301,
    TeamAPlayers: [p1.PlayerID],
    TeamBPlayers: [p2.PlayerID],
    TeamPlay: false,
  });

  if (!game.ok) {
    assert(false, 'Create game for coin toss test');
    return;
  }
  cleanup.gameIds.push(game.data.GameID);

  const matchId = game.data.MatchID;

  // Execute coin toss
  const toss = await api('POST', `/matches/${matchId}/coin-toss`);
  assert(toss.ok && (toss.data.result === 'Heads' || toss.data.result === 'Tails'),
    `Coin toss result: ${toss.data?.result}`);
}

async function testDoubleInX01(player1Id, player2Id) {
  console.log('\n── X01 with Double-In ──');

  const res = await api('POST', '/games/ad-hoc', {
    GameType: 'X01',
    X01Target: 301,
    DoubleInRequired: true,
    TeamAPlayers: [player1Id],
    TeamBPlayers: [player2Id],
    TeamPlay: false,
  });
  assert(res.status === 201 && res.data.DoubleInRequired === true,
    'X01 Double-In game created');

  if (res.ok) {
    cleanup.gameIds.push(res.data.GameID);
    const game = await api('GET', `/games/${res.data.GameID}`);
    assert(game.data.DoubleInRequired === true, 'DoubleInRequired persisted');

    // Add a double-in turn
    const players = await api('GET', `/games/${res.data.GameID}/players`);
    const p1 = players.data.find(p => p.PlayerID === player1Id);
    const t = await api('POST', `/games/${res.data.GameID}/turns`, {
      PlayerID: player1Id, TeamSeasonID: p1.TeamSeasonID,
      TurnNumber: 1, RoundNumber: 1, DartsThrown: 3,
      Score: 60, RemainingScore: 241, IsDoubleIn: true,
    });
    assert(t.status === 201 && t.data.IsDoubleIn === true, 'Double-In turn recorded');
  }
}

async function testDeleteGame(playerId) {
  console.log('\n── Game Deletion ──');

  // Create a throwaway game
  const res = await api('POST', '/games/ad-hoc', {
    GameType: 'X01', X01Target: 301,
    TeamAPlayers: [playerId], TeamBPlayers: [], TeamPlay: false,
  });

  if (!res.ok) {
    assert(false, 'Create game for deletion test');
    return;
  }

  const gameId = res.data.GameID;

  // Add a turn so there's related data
  const players = await api('GET', `/games/${gameId}/players`);
  const p = players.data[0];
  await api('POST', `/games/${gameId}/turns`, {
    PlayerID: playerId, TeamSeasonID: p.TeamSeasonID,
    TurnNumber: 1, RoundNumber: 1, DartsThrown: 3, Score: 100, RemainingScore: 201,
  });

  // Delete
  const del = await api('DELETE', `/games/${gameId}`);
  assert(del.ok, 'DELETE /games/:id succeeds');

  // Verify gone
  const check = await api('GET', `/games/${gameId}`);
  assert(check.status === 404, 'Deleted game returns 404');
}

async function testValidation() {
  console.log('\n── Input Validation ──');

  // Missing GameType
  const noType = await api('POST', '/games/ad-hoc', {
    TeamAPlayers: [1], TeamBPlayers: [],
  });
  assert(noType.status === 400, 'Missing GameType returns 400');

  // Missing TeamAPlayers
  const noTeam = await api('POST', '/games/ad-hoc', {
    GameType: 'X01', TeamAPlayers: [],
  });
  assert(noTeam.status === 400, 'Empty TeamAPlayers returns 400');

  // Missing name for player
  const noName = await api('POST', '/players', { FirstName: '', LastName: '' });
  assert(noName.status === 400, 'Empty player name returns 400');

  // Team play with mismatched counts
  const mismatch = await api('POST', '/games/ad-hoc', {
    GameType: 'X01', X01Target: 301,
    TeamAPlayers: [1, 2], TeamBPlayers: [3],
    TeamPlay: true,
  });
  assert(mismatch.status === 400, 'Mismatched team sizes returns 400');
}

// ── Cleanup ──────────────────────────────────────────────────────────

async function cleanupResources() {
  console.log('\n── Cleanup ──');

  for (const gid of cleanup.gameIds) {
    try {
      await api('DELETE', `/games/${gid}`);
    } catch { /* ignore */ }
  }
  console.log(`  Cleaned up ${cleanup.gameIds.length} game(s)`);

  for (const pid of cleanup.playerIds) {
    try {
      await api('DELETE', `/players/${pid}`);
    } catch { /* ignore */ }
  }
  console.log(`  Cleaned up ${cleanup.playerIds.length} test player(s)`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Darts App — Integration Test Suite        ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║   Server: ${BASE}                      ║`);
  console.log('╚══════════════════════════════════════════════╝');

  // Check server is up
  try {
    const health = await api('GET', '/players');
    if (!health.ok) throw new Error('Server not responding');
    console.log(`\nServer is up. Found ${health.data.length} existing player(s).`);
  } catch (err) {
    console.error('\n❌ Cannot connect to server. Is it running on port 3001?');
    console.error(err.message);
    process.exit(1);
  }

  const playersList = await api('GET', '/players');
  const existingPlayers = playersList.data;

  try {
    // 1. Player CRUD
    const testPlayerId = await testPlayerCRUD();

    // Use two existing players for most game tests
    const p1 = existingPlayers[0].PlayerID;
    const p2 = existingPlayers[1].PlayerID;

    // 2. Solo ad-hoc X01
    await testSoloAdHocX01(p1);

    // 3. 1v1 ad-hoc X01
    await testTwoPlayerAdHocX01(p1, p2);

    // 4. Cricket
    await testCricketGame(p1, p2);

    // 5. Shanghai
    await testShanghaiGame(p1, p2);

    // 6. Round the World
    await testRoundTheWorldGame(p1, p2);

    // 7. Team play 2v2
    if (existingPlayers.length >= 4) {
      await testTeamPlayAdHoc(existingPlayers);
    } else {
      console.log('\n── Skipping 2v2 (need 4+ players) ──');
    }

    // 8. Live matches
    await testLiveMatches();

    // 9. Player stats
    await testPlayerStats(p1);

    // 10. Coin toss
    await testCoinToss();

    // 11. Double-In X01
    await testDoubleInX01(p1, p2);

    // 12. Game deletion
    await testDeleteGame(p1);

    // 13. Input validation
    await testValidation();

  } finally {
    // Always clean up
    await cleanupResources();
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║   Results: ${passed} passed, ${failed} failed${' '.repeat(Math.max(0, 16 - String(passed).length - String(failed).length))}║`);
  console.log('╚══════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(f));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
