import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gameService } from '../services/gameService';
import { matchService } from '../services/matchService';
import { seasonService } from '../services/seasonService';
import type { Game, Match, GamePlayer, Turn, CricketTurn, SeasonGameFormat, Season } from '../types';
import { X01Scoreboard } from '../components/games/X01Scoreboard';
import { CricketScoreboard } from '../components/games/CricketScoreboard';
import { ShanghaiScoreboard } from '../components/games/ShanghaiScoreboard';
import { RoundTheWorldScoreboard } from '../components/games/RoundTheWorldScoreboard';
import { Cork } from '../components/match/Cork';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { announceGameWinner, announceMatchWinner } from '../utils/announcer';

const MATCH_GAME_COUNT = 5;
const CORK_KEY = (id: number) => `cork-order-${id}`;

export function GamePage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [cricketTurns, setCricketTurns] = useState<CricketTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [gameFormats, setGameFormats] = useState<SeasonGameFormat[]>([]);
  const [orderedPlayers, setOrderedPlayers] = useState<GamePlayer[] | null>(null);
  const [corkDone, setCorkDone] = useState(false);
  const [showAbandon, setShowAbandon] = useState(false);
  const [isAdHoc, setIsAdHoc] = useState(false);
  const [showEndOverlay, setShowEndOverlay] = useState(true);

  const isCricketType = (type: string) => type === 'Cricket';

  const load = async () => {
    if (!gameId) return;
    try {
      setLoading(true);
      const g = await gameService.getById(Number(gameId));
      setGame(g);
      if (g) {
        const [m, p, ag] = await Promise.all([
          matchService.getById(g.MatchID),
          gameService.getPlayers(g.GameID),
          gameService.getByMatch(g.MatchID),
        ]);
        setMatch(m);
        setPlayers(p);
        setAllGames(ag);

        // Load season game formats and detect ad-hoc
        if (m) {
          try {
            const [fmts, season] = await Promise.all([
              seasonService.getGameFormats(m.SeasonID),
              seasonService.getById(m.SeasonID),
            ]);
            setGameFormats(fmts);
            setIsAdHoc(season?.SeasonName === 'Ad-Hoc Play');
          } catch { /* optional */ }
        }

        // Load turns from the appropriate table
        if (isCricketType(g.GameType)) {
          const ct = await gameService.getCricketTurns(g.GameID);
          setCricketTurns(ct);
          setTurns([]);
        } else {
          const t = await gameService.getTurns(g.GameID);
          setTurns(t);
          setCricketTurns([]);
        }

        // Restore cork order from localStorage (if any)
        const stored = localStorage.getItem(CORK_KEY(g.GameID));
        if (stored) {
          try {
            const ids: number[] = JSON.parse(stored);
            const ordered = ids.map(id => p.find(pl => pl.PlayerID === id)).filter(Boolean) as GamePlayer[];
            if (ordered.length === p.length) { setOrderedPlayers(ordered); setCorkDone(true); }
          } catch { /* ignore parse errors */ }
        }

        // Auto-start if not started and players exist
        if (g.Status === 'NotStarted') {
          await gameService.updateStatus(g.GameID, 'InProgress');
          g.Status = 'InProgress';
          setGame({ ...g });
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [gameId]);
  useEffect(() => { setShowEndOverlay(true); }, [gameId]);

  // X01 / RoundTheWorld turn handlers
  const addTurn = async (turnData: Partial<Turn>) => {
    if (!game) return;
    try {
      await gameService.addTurn(game.GameID, turnData);
      const t = await gameService.getTurns(game.GameID);
      setTurns(t);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const undoTurn = async () => {
    if (!game) return;
    try {
      await gameService.undoLastTurn(game.GameID);
      const t = await gameService.getTurns(game.GameID);
      setTurns(t);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Cricket / Shanghai turn handlers
  const addCricketTurn = async (turnData: Partial<CricketTurn>) => {
    if (!game) return;
    try {
      await gameService.addCricketTurn(game.GameID, turnData);
      const ct = await gameService.getCricketTurns(game.GameID);
      setCricketTurns(ct);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const undoCricketTurn = async () => {
    if (!game) return;
    try {
      await gameService.undoLastCricketTurn(game.GameID);
      const ct = await gameService.getCricketTurns(game.GameID);
      setCricketTurns(ct);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const endGame = async (winnerTeamSeasonId: number) => {
    if (!game || !match) return;
    await gameService.updateStatus(game.GameID, 'Completed', winnerTeamSeasonId);

    // Announce game winner
    const teamName = winnerTeamSeasonId === match.HomeTeamSeasonID ? (match.HomeTeamName || 'Home') : (match.AwayTeamName || 'Away');
    announceGameWinner(teamName);

    // Check if this completes the match (majority of games won)
    const updatedGames = await gameService.getByMatch(game.MatchID);
    const homeWins = updatedGames.filter(g => g.Status === 'Completed' && g.WinnerTeamSeasonID === match.HomeTeamSeasonID).length;
    const awayWins = updatedGames.filter(g => g.Status === 'Completed' && g.WinnerTeamSeasonID === match.AwayTeamSeasonID).length;
    const majority = Math.ceil(MATCH_GAME_COUNT / 2);
    if (homeWins >= majority || awayWins >= majority) {
      const matchWinner = homeWins >= majority ? (match.HomeTeamName || 'Home') : (match.AwayTeamName || 'Away');
      setTimeout(() => announceMatchWinner(matchWinner), 3000);
    }

    load();
  };

  /** Create next game from season format and navigate to it */
  const goToNextGame = async () => {
    if (!game || !match) return;
    const nextNum = allGames.length + 1;
    if (nextNum > MATCH_GAME_COUNT) { navigate(`/match/${game.MatchID}`); return; }
    const fmt = gameFormats.find(f => f.GameNumber === nextNum);
    if (!fmt) { navigate(`/match/${game.MatchID}`); return; }
    try {
      const newGame = await gameService.create({
        MatchID: match.MatchID,
        GameType: fmt.GameType,
        X01Target: fmt.GameType === 'X01' ? (fmt.X01Target || 501) : undefined,
        DoubleInRequired: fmt.DoubleInRequired,
        RtwMode: fmt.GameType === 'RoundTheWorld' ? '1to20' : undefined,
      });
      navigate(`/game/${newGame.GameID}`);
    } catch (err: any) { setError(err.message); }
  };

  /** Cork completion — persist order in localStorage */
  const handleCorkComplete = (ordered: GamePlayer[]) => {
    if (!game) return;
    setOrderedPlayers(ordered);
    setCorkDone(true);
    localStorage.setItem(CORK_KEY(game.GameID), JSON.stringify(ordered.map(p => p.PlayerID)));
  };

  /** Abandon game — delete it and navigate home */
  const abandonGame = async () => {
    if (!game) return;
    try {
      await gameService.deleteGame(game.GameID);
      navigate(isAdHoc ? '/play' : '/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  /** Rematch — create a new ad-hoc game with same settings, loser starts */
  const handleRematch = async () => {
    if (!game || !match) return;
    try {
      const homePids = players.filter(p => p.TeamSeasonID === match.HomeTeamSeasonID)
        .sort((a, b) => a.PlayerOrder - b.PlayerOrder).map(p => p.PlayerID);
      const awayPids = players.filter(p => p.TeamSeasonID === match.AwayTeamSeasonID)
        .sort((a, b) => a.PlayerOrder - b.PlayerOrder).map(p => p.PlayerID);

      // Loser starts: if winner is home, away goes first (TeamA)
      const winnerIsHome = game.WinnerTeamSeasonID === match.HomeTeamSeasonID;
      const teamAPlayers = winnerIsHome ? awayPids : homePids;
      const teamBPlayers = winnerIsHome ? homePids : awayPids;

      const newGame = await gameService.createAdHoc({
        GameType: game.GameType,
        X01Target: game.X01Target || undefined,
        DoubleInRequired: game.DoubleInRequired,
        RtwMode: game.RtwMode || undefined,
        TeamAPlayers: teamAPlayers,
        TeamBPlayers: teamBPlayers,
        TeamPlay: homePids.length > 1 || awayPids.length > 1,
      });
      navigate(`/game/${newGame.GameID}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // For even games (2, 4), auto-order: losing team first, reversed player order
  useEffect(() => {
    if (!game || !match) return;
    const _isEvenGame = game.GameNumber % 2 === 0;
    const _hasTurns = turns.length > 0 || cricketTurns.length > 0;
    if (!_isEvenGame || corkDone || _hasTurns || game.Status === 'Completed' || players.length < 2) return;
    if (allGames.length < game.GameNumber) return;

    // Get previous game's cork order
    const prevGame = allGames.find(g => g.GameNumber === game.GameNumber - 1);
    if (!prevGame) return;
    const prevCorkKey = CORK_KEY(prevGame.GameID);
    const prevStored = localStorage.getItem(prevCorkKey);
    
    if (prevStored) {
      try {
        const prevIds: number[] = JSON.parse(prevStored);
        const prevFirstPlayer = players.find(p => p.PlayerID === prevIds[0]);
        if (!prevFirstPlayer) return;
        
        const corkWinnerTeamId = prevFirstPlayer.TeamSeasonID;
        const losingTeamId = corkWinnerTeamId === match.HomeTeamSeasonID 
          ? match.AwayTeamSeasonID : match.HomeTeamSeasonID;
        
        const losingPlayers = players
          .filter(p => p.TeamSeasonID === losingTeamId)
          .sort((a, b) => b.PlayerOrder - a.PlayerOrder);
        const winningPlayers = players
          .filter(p => p.TeamSeasonID === corkWinnerTeamId)
          .sort((a, b) => b.PlayerOrder - a.PlayerOrder);
        
        const evenOrder: GamePlayer[] = [];
        const max = Math.max(losingPlayers.length, winningPlayers.length);
        for (let i = 0; i < max; i++) {
          if (losingPlayers[i]) evenOrder.push(losingPlayers[i]);
          if (winningPlayers[i]) evenOrder.push(winningPlayers[i]);
        }
        
        setOrderedPlayers(evenOrder);
        setCorkDone(true);
        localStorage.setItem(CORK_KEY(game.GameID), JSON.stringify(evenOrder.map(p => p.PlayerID)));
      } catch { /* ignore */ }
    }
  }, [game, match, corkDone, turns.length, cricketTurns.length, players, allGames]);

  if (loading) return <p>Loading game...</p>;
  if (!game || !match) return <p>Game not found</p>;

  // Determine if cork is needed (odd games: 1, 3, 5) and hasn't been done yet
  const isOddGame = game.GameNumber % 2 === 1;
  const hasTurns = turns.length > 0 || cricketTurns.length > 0;
  const needsCork = isOddGame && !corkDone && !hasTurns && game.Status !== 'Completed' && players.length > 1;

  // Use ordered players if cork was done, otherwise default
  const effectivePlayers = orderedPlayers || players;
  const baseProps = { game, match, players: effectivePlayers, onEndGame: endGame };

  // Compute per-player stats for end overlay
  const computePlayerStat = (playerId: number) => {
    if (isCricketType(game.GameType)) {
      const pt = cricketTurns.filter(t => t.PlayerID === playerId);
      const totalMarks = pt.reduce((s, t) => s + (t.MarksScored || 0), 0);
      const mpr = pt.length > 0 ? totalMarks / pt.length : 0;
      return { label: 'MPR', value: mpr.toFixed(2) };
    }
    const pt = turns.filter(t => t.PlayerID === playerId);
    if (game.GameType === 'Shanghai') {
      const totalMarks = pt.reduce((s, t) => s + (t.MarksScored || 0), 0);
      const mpr = pt.length > 0 ? totalMarks / pt.length : 0;
      return { label: 'MPR', value: mpr.toFixed(2) };
    }
    const totalDarts = pt.reduce((s, t) => s + (t.DartsThrown || 3), 0);
    const totalScore = pt.reduce((s, t) => s + t.Score, 0);
    const ppd = totalDarts > 0 ? totalScore / totalDarts : 0;
    if (game.GameType === 'X01') {
      return { label: 'Avg', value: (ppd * 3).toFixed(1) };
    }
    return { label: 'Score', value: String(totalScore) };
  };

  // Compute team-level stat for end overlay
  const computeTeamStat = (teamPlayerIds: number[]) => {
    if (isCricketType(game.GameType)) {
      const pt = cricketTurns.filter(t => teamPlayerIds.includes(t.PlayerID));
      const totalMarks = pt.reduce((s, t) => s + (t.MarksScored || 0), 0);
      const mpr = pt.length > 0 ? totalMarks / pt.length : 0;
      return { label: 'Team MPR', value: mpr.toFixed(2) };
    }
    const pt = turns.filter(t => teamPlayerIds.includes(t.PlayerID));
    if (game.GameType === 'Shanghai') {
      const totalMarks = pt.reduce((s, t) => s + (t.MarksScored || 0), 0);
      const mpr = pt.length > 0 ? totalMarks / pt.length : 0;
      return { label: 'Team MPR', value: mpr.toFixed(2) };
    }
    const totalDarts = pt.reduce((s, t) => s + (t.DartsThrown || 3), 0);
    const totalScore = pt.reduce((s, t) => s + t.Score, 0);
    const ppd = totalDarts > 0 ? totalScore / totalDarts : 0;
    if (game.GameType === 'X01') {
      return { label: 'Team Avg', value: (ppd * 3).toFixed(1) };
    }
    return { label: 'Team Score', value: String(totalScore) };
  };

  const winnerTeamId = game.WinnerTeamSeasonID;
  const winnerTeamName = winnerTeamId === match.HomeTeamSeasonID ? match.HomeTeamName : match.AwayTeamName;
  const winnerColor = winnerTeamId === match.HomeTeamSeasonID ? 'var(--color-primary)' : 'var(--color-secondary)';
  const homeTeamPlayers = effectivePlayers.filter(p => p.TeamSeasonID === match.HomeTeamSeasonID);
  const awayTeamPlayers = effectivePlayers.filter(p => p.TeamSeasonID === match.AwayTeamSeasonID);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Abandon confirmation */}
      <Modal
        isOpen={showAbandon}
        onClose={() => setShowAbandon(false)}
        title="Abandon Game?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAbandon(false)}>Cancel</Button>
            <Button variant="primary" onClick={abandonGame} style={{ backgroundColor: 'var(--color-danger)' }}>
              Yes, Abandon
            </Button>
          </>
        }
      >
        <p>This will delete the game and all its data. Are you sure?</p>
      </Modal>

      {/* ===== Game Complete Overlay ===== */}
      {game.Status === 'Completed' && showEndOverlay && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 'var(--spacing-md)',
        }}>
          <div style={{
            maxWidth: 500, width: '100%',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
          }}>
            {/* Winner header */}
            <div style={{
              padding: 'var(--spacing-lg)',
              backgroundColor: winnerColor,
              color: '#fff',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '1rem', opacity: 0.8 }}>🏆 Winner</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{winnerTeamName}</div>
            </div>

            {/* Stats */}
            <div style={{ padding: 'var(--spacing-md)' }}>
              {/* Home team stats */}
              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: 'var(--spacing-xs)', fontSize: '0.9rem' }}>
                  {match.HomeTeamName}
                </div>
                {homeTeamPlayers.map(p => {
                  const s = computePlayerStat(p.PlayerID);
                  return (
                    <div key={p.PlayerID} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
                      <span>{p.FirstName} {p.LastName}</span>
                      <span style={{ fontWeight: 700 }}>
                        {s.label}: {s.value}
                      </span>
                    </div>
                  );
                })}
                {homeTeamPlayers.length > 1 && (() => {
                  const ts = computeTeamStat(homeTeamPlayers.map(p => p.PlayerID));
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.9rem', fontWeight: 700, borderTop: '2px solid var(--color-border)', marginTop: 2 }}>
                      <span>Team</span>
                      <span>{ts.label}: {ts.value}</span>
                    </div>
                  );
                })()}
              </div>

              {/* Away team stats */}
              <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ fontWeight: 700, color: 'var(--color-secondary)', marginBottom: 'var(--spacing-xs)', fontSize: '0.9rem' }}>
                  {match.AwayTeamName}
                </div>
                {awayTeamPlayers.map(p => {
                  const s = computePlayerStat(p.PlayerID);
                  return (
                    <div key={p.PlayerID} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
                      <span>{p.FirstName} {p.LastName}</span>
                      <span style={{ fontWeight: 700 }}>
                        {s.label}: {s.value}
                      </span>
                    </div>
                  );
                })}
                {awayTeamPlayers.length > 1 && (() => {
                  const ts = computeTeamStat(awayTeamPlayers.map(p => p.PlayerID));
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.9rem', fontWeight: 700, borderTop: '2px solid var(--color-border)', marginTop: 2 }}>
                      <span>Team</span>
                      <span>{ts.label}: {ts.value}</span>
                    </div>
                  );
                })()}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {isAdHoc ? (
                  <>
                    <Button onClick={handleRematch} fullWidth>🔄 Rematch</Button>
                    <Button variant="ghost" onClick={() => navigate('/play')} fullWidth>New Game</Button>
                  </>
                ) : allGames.length < MATCH_GAME_COUNT ? (() => {
                  const nextNum = allGames.length + 1;
                  const fmt = gameFormats.find(f => f.GameNumber === nextNum);
                  if (fmt) {
                    const lbl = fmt.GameType === 'X01'
                      ? `${fmt.X01Target || 501}${fmt.DoubleInRequired ? ' DI' : ''}`
                      : fmt.GameType;
                    return <Button onClick={goToNextGame} fullWidth>▶ Next: Game {nextNum} — {lbl}</Button>;
                  }
                  return <Button onClick={() => navigate(`/match/${game.MatchID}`)} fullWidth>Back to Match</Button>;
                })() : (
                  <Button onClick={() => navigate(`/match/${game.MatchID}`)} fullWidth>Back to Match</Button>
                )}
                <Button variant="ghost" onClick={() => setShowEndOverlay(false)} fullWidth size="sm">
                  View Scoreboard
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-md)' }}>{error}</p>}

      {/* Cork UI for odd-numbered games */}
      {needsCork && (
        <Cork
          gameNumber={game.GameNumber}
          match={match}
          players={players}
          onCorkComplete={handleCorkComplete}
        />
      )}

      {/* Small banner when overlay is dismissed */}
      {game.Status === 'Completed' && !showEndOverlay && (
        <div style={{
          textAlign: 'center', padding: 'var(--spacing-sm)',
          backgroundColor: 'var(--color-success)', color: '#fff',
          borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)',
          fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
        }} onClick={() => setShowEndOverlay(true)}>
          🏆 Game Complete — Tap to view results
        </div>
      )}

      {game.GameType === 'X01' && (
        <X01Scoreboard {...baseProps} turns={turns} onAddTurn={addTurn} onUndoTurn={undoTurn} />
      )}
      {game.GameType === 'Cricket' && (
        <CricketScoreboard {...baseProps} cricketTurns={cricketTurns} onAddCricketTurn={addCricketTurn} onUndoCricketTurn={undoCricketTurn} />
      )}
      {game.GameType === 'Shanghai' && (
        <ShanghaiScoreboard {...baseProps} turns={turns} onAddTurn={addTurn} onUndoTurn={undoTurn} />
      )}
      {game.GameType === 'RoundTheWorld' && (
        <RoundTheWorldScoreboard {...baseProps} turns={turns} onAddTurn={addTurn} onUndoTurn={undoTurn} />
      )}

      {players.length === 0 && game.Status !== 'Completed' && (
        <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--color-text-light)' }}>
          <p>Loading players...</p>
        </div>
      )}

      {/* Back / Abandon bar at bottom */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 'var(--spacing-lg)', paddingTop: 'var(--spacing-md)',
        borderTop: '1px solid var(--color-border)',
      }}>
        <Button variant="ghost" size="sm" onClick={() => navigate(isAdHoc ? '/play' : `/match/${game.MatchID}`)}>
          ← {isAdHoc ? 'Back' : 'Back to Match'}
        </Button>
        {game.Status !== 'Completed' && isAdHoc && (
          <button
            onClick={() => setShowAbandon(true)}
            title="Abandon Game"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '2px solid var(--color-danger)', backgroundColor: 'transparent',
              color: 'var(--color-danger)', fontWeight: 700, fontSize: '1.2rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
