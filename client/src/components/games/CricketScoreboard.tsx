import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Game, Match, GamePlayer, CricketTurn, CricketState } from '../../types';
import { gameService } from '../../services/gameService';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { PlayerAvatar } from '../common/PlayerAvatar';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CricketScoreboardProps {
  game: Game;
  match: Match;
  players: GamePlayer[];
  cricketTurns: CricketTurn[];
  onAddCricketTurn: (turn: Partial<CricketTurn>) => Promise<void>;
  onUndoCricketTurn: () => Promise<void>;
  onEndGame: (winnerTeamSeasonId: number) => Promise<void>;
}

type AllStarLevel = 'allstar' | 'double' | 'triple' | null;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CRICKET_SEGMENTS = ['20', '19', '18', '17', '16', '15', 'Bull'] as const;
const SEGMENT_KEYS: Record<string, keyof CricketState> = {
  '20': 'Seg20', '19': 'Seg19', '18': 'Seg18', '17': 'Seg17',
  '16': 'Seg16', '15': 'Seg15', 'Bull': 'SegBull',
};
const MAX_TAPS_PER_TURN = 9;

/* ------------------------------------------------------------------ */
/*  Mark Display Helper                                                */
/* ------------------------------------------------------------------ */

function renderMarks(count: number): React.ReactNode {
  if (count === 0) return <span style={{ opacity: 0.3 }}>·</span>;
  if (count === 1) return <span style={{ fontWeight: 700 }}>/</span>;
  if (count === 2) return <span style={{ fontWeight: 700 }}>X</span>;
  if (count >= 3) return <span style={{ fontWeight: 700 }}>⊗</span>;
  return null;
}

/* ------------------------------------------------------------------ */
/*  All-Star Detection                                                 */
/* ------------------------------------------------------------------ */

function getCricketAllStarLevel(totalMarks: number, bullMarks: number): AllStarLevel {
  if (bullMarks >= 3) return 'allstar'; // 3 marks all bulls
  if (totalMarks >= 9) return 'triple';
  if (totalMarks >= 7) return 'double';
  if (totalMarks >= 5) return 'allstar';
  return null;
}

const ALL_STAR_LABELS: Record<string, string> = {
  allstar: '⭐ ALL STAR! ⭐',
  double: '⭐⭐ DOUBLE ALL STAR! ⭐⭐',
  triple: '⭐⭐⭐ TRIPLE ALL STAR! ⭐⭐⭐',
};

const ALL_STAR_COLORS: Record<string, string> = {
  allstar: '#FFD700',
  double: '#FF6B35',
  triple: '#FF1744',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CricketScoreboard({ game, match, players, cricketTurns, onAddCricketTurn, onUndoCricketTurn, onEndGame }: CricketScoreboardProps) {
  const [cricketState, setCricketState] = useState<CricketState[]>([]);
  // Tap-based: marks per segment for current turn
  const [turnMarks, setTurnMarks] = useState<Record<string, number>>({});
  const [allStarAnim, setAllStarAnim] = useState<{ level: AllStarLevel; playerName: string } | null>(null);

  const homeTeamId = match.HomeTeamSeasonID;
  const awayTeamId = match.AwayTeamSeasonID;
  const homePlayers = players.filter(p => p.TeamSeasonID === homeTeamId);
  const awayPlayers = players.filter(p => p.TeamSeasonID === awayTeamId);

  useEffect(() => {
    gameService.getCricketState(game.GameID).then(setCricketState);
  }, [game.GameID, cricketTurns.length]);

  const homeState = cricketState.find(s => s.TeamSeasonID === homeTeamId);
  const awayState = cricketState.find(s => s.TeamSeasonID === awayTeamId);

  /* --- Turn order (custom if pre-ordered by cork) --- */
  const turnOrder = useMemo(() => {
    const naturalOrder: GamePlayer[] = [];
    const max = Math.max(homePlayers.length, awayPlayers.length);
    for (let i = 0; i < max; i++) {
      if (homePlayers[i]) naturalOrder.push(homePlayers[i]);
      if (awayPlayers[i]) naturalOrder.push(awayPlayers[i]);
    }
    const isCustom = players.length > 0 && naturalOrder.length > 0 &&
      players[0].PlayerID !== naturalOrder[0].PlayerID;
    return isCustom ? [...players] : naturalOrder;
  }, [players, homePlayers, awayPlayers]);

  const currentPlayerIndex = turnOrder.length > 0 ? (cricketTurns.length % turnOrder.length) : 0;
  const currentPlayer = turnOrder[currentPlayerIndex];
  const currentRound = turnOrder.length > 0 ? Math.floor(cricketTurns.length / turnOrder.length) + 1 : 1;

  const getMarks = (state: CricketState | undefined, segment: string): number => {
    if (!state) return 0;
    const key = SEGMENT_KEYS[segment];
    return key ? (state[key] as number) : 0;
  };

  /* --- Total taps this turn --- */
  const totalTaps = useMemo(() => {
    return Object.values(turnMarks).reduce((s, v) => s + v, 0);
  }, [turnMarks]);

  /* --- Live preview: compute points from current taps --- */
  const turnPreview = useMemo(() => {
    if (!currentPlayer) return { totalMarks: 0, totalPoints: 0, bullMarks: 0 };
    const teamState = cricketState.find(s => s.TeamSeasonID === currentPlayer.TeamSeasonID);
    const opponentState = cricketState.find(s => s.TeamSeasonID !== currentPlayer.TeamSeasonID);

    let totalMarks = 0;
    let totalPoints = 0;
    let bullMarks = 0;

    for (const seg of CRICKET_SEGMENTS) {
      const added = turnMarks[seg] || 0;
      if (added === 0) continue;

      const key = SEGMENT_KEYS[seg];
      if (!key) continue;

      totalMarks += added;
      if (seg === 'Bull') bullMarks = added;

      const baseMarks = teamState ? (teamState[key] as number) : 0;
      const marksToClose = Math.max(0, 3 - baseMarks);
      const opponentClosed = opponentState ? (opponentState[key] as number) >= 3 : false;

      if (!opponentClosed && added > marksToClose) {
        const overflow = added - marksToClose;
        const segValue = seg === 'Bull' ? 25 : Number(seg);
        totalPoints += overflow * segValue;
      }
    }
    return { totalMarks, totalPoints, bullMarks };
  }, [turnMarks, currentPlayer, cricketState]);

  /* --- Max taps allowed for a segment (limited when opponent closed) --- */
  const getMaxTapsForSeg = useCallback((seg: string): number => {
    if (!currentPlayer) return 0;
    const teamState = cricketState.find(s => s.TeamSeasonID === currentPlayer.TeamSeasonID);
    const opponentState = cricketState.find(s => s.TeamSeasonID !== currentPlayer.TeamSeasonID);
    const key = SEGMENT_KEYS[seg];
    if (!key) return 0;
    const myMarks = teamState ? (teamState[key] as number) : 0;
    const oppMarks = opponentState ? (opponentState[key] as number) : 0;
    const currentTaps = turnMarks[seg] || 0;
    if (oppMarks >= 3) {
      return Math.max(0, 3 - myMarks - currentTaps);
    }
    return MAX_TAPS_PER_TURN - totalTaps;
  }, [currentPlayer, cricketState, turnMarks, totalTaps]);

  /* --- Tap a segment --- */
  const handleTap = useCallback((seg: string) => {
    if (totalTaps >= MAX_TAPS_PER_TURN) return;
    if (getMaxTapsForSeg(seg) <= 0) return;
    setTurnMarks(prev => ({ ...prev, [seg]: (prev[seg] || 0) + 1 }));
  }, [totalTaps, getMaxTapsForSeg]);

  /* --- Remove a tap from a segment --- */
  const handleUntap = useCallback((seg: string) => {
    setTurnMarks(prev => {
      const current = prev[seg] || 0;
      if (current <= 0) return prev;
      const next = { ...prev };
      if (current === 1) delete next[seg];
      else next[seg] = current - 1;
      return next;
    });
  }, []);

  /* --- Team colors for current player --- */
  const currentTeamColor = currentPlayer?.TeamSeasonID === homeTeamId
    ? 'var(--color-primary)' : 'var(--color-secondary)';

  /* --- Is segment both-closed (disabled)? --- */
  const isBothClosed = useCallback((seg: string): boolean => {
    const key = SEGMENT_KEYS[seg];
    if (!key) return false;
    const hm = homeState ? (homeState[key] as number) : 0;
    const am = awayState ? (awayState[key] as number) : 0;
    return hm >= 3 && am >= 3;
  }, [homeState, awayState]);

  /* --- Complete turn: update state + save --- */
  const completeTurn = async () => {
    if (!currentPlayer) return;

    const teamState = cricketState.find(s => s.TeamSeasonID === currentPlayer.TeamSeasonID);
    const opponentState = cricketState.find(s => s.TeamSeasonID !== currentPlayer.TeamSeasonID);

    // Build per-segment columns for CricketTurn
    const segColumns: Record<string, number> = {};
    let totalMarks = 0;
    let totalPoints = 0;
    let bullMarks = 0;

    for (const seg of CRICKET_SEGMENTS) {
      const added = turnMarks[seg] || 0;
      if (added === 0) continue;

      const key = SEGMENT_KEYS[seg];
      if (!key) continue;

      // Map to CricketTurn column name
      if (seg === 'Bull') {
        segColumns['SegBull'] = added;
        bullMarks = added;
      } else {
        segColumns[`Seg${seg}`] = added;
      }

      totalMarks += added;

      // Calculate points
      const baseMarks = teamState ? (teamState[key] as number) : 0;
      const marksToClose = Math.max(0, 3 - baseMarks);
      const opponentClosed = opponentState ? (opponentState[key] as number) >= 3 : false;

      if (!opponentClosed && added > marksToClose) {
        const overflow = added - marksToClose;
        const segValue = seg === 'Bull' ? 25 : Number(seg);
        totalPoints += overflow * segValue;
      }
    }

    // All-Star check
    const level = getCricketAllStarLevel(totalMarks, bullMarks);
    if (level) {
      setAllStarAnim({ level, playerName: `${currentPlayer.FirstName} ${currentPlayer.LastName}` });
      setTimeout(() => setAllStarAnim(null), 2500);
    }

    // Update cricket state on server
    const stateUpdate: Partial<CricketState> = {};
    for (const seg of CRICKET_SEGMENTS) {
      const added = turnMarks[seg] || 0;
      if (added === 0) continue;
      const key = SEGMENT_KEYS[seg];
      if (!key) continue;
      const baseMarks = teamState ? (teamState[key] as number) : 0;
      (stateUpdate as any)[key] = Math.min(baseMarks + added, 9);
    }
    if (totalPoints > 0) {
      stateUpdate.Points = (teamState?.Points || 0) + totalPoints;
    }

    if (Object.keys(stateUpdate).length > 0) {
      await gameService.updateCricketState(game.GameID, currentPlayer.TeamSeasonID, stateUpdate);
    }

    // Record cricket turn
    await onAddCricketTurn({
      PlayerID: currentPlayer.PlayerID,
      TeamSeasonID: currentPlayer.TeamSeasonID,
      TurnNumber: cricketTurns.length + 1,
      RoundNumber: currentRound,
      DartsThrown: 3,
      Points: totalPoints,
      MarksScored: totalMarks,
      ...segColumns,
      Details: JSON.stringify({ taps: turnMarks, allStarLevel: level }),
    } as Partial<CricketTurn>);

    setTurnMarks({});

    // Check win condition
    const updatedTeamState = { ...teamState } as any;
    for (const seg of CRICKET_SEGMENTS) {
      const added = turnMarks[seg] || 0;
      if (added === 0) continue;
      const key = SEGMENT_KEYS[seg];
      if (key) updatedTeamState[key] = Math.min((teamState?.[key] as number || 0) + added, 9);
    }
    updatedTeamState.Points = (teamState?.Points || 0) + totalPoints;

    const allClosed = CRICKET_SEGMENTS.every(seg => {
      const key = SEGMENT_KEYS[seg];
      return key && (updatedTeamState[key] as number) >= 3;
    });
    const teamPoints = updatedTeamState.Points || 0;
    const oppPoints = opponentState?.Points || 0;

    if (allClosed && teamPoints >= oppPoints) {
      await onEndGame(currentPlayer.TeamSeasonID);
    }
  };

  /* --- Undo --- */
  const handleUndo = async () => {
    if (Object.values(turnMarks).some(v => v > 0)) {
      setTurnMarks({});
    } else if (cricketTurns.length > 0) {
      await onUndoCricketTurn();
    }
  };

  /* --- MPR per player --- */
  const getPlayerMPR = (playerId: number): number => {
    const playerTurns = cricketTurns.filter(t => t.PlayerID === playerId);
    if (playerTurns.length === 0) return 0;
    const totalMarks = playerTurns.reduce((s, t) => s + (t.MarksScored || 0), 0);
    return totalMarks / playerTurns.length;
  };

  /* --- Team MPR (average of all team turns) --- */
  const getTeamMPR = (teamSeasonId: number): number => {
    const teamTurns = cricketTurns.filter(t => t.TeamSeasonID === teamSeasonId);
    if (teamTurns.length === 0) return 0;
    const totalMarks = teamTurns.reduce((s, t) => s + (t.MarksScored || 0), 0);
    return totalMarks / teamTurns.length;
  };

  const disabled = game.Status === 'Completed';

  return (
    <div>
      {/* ===== All-Star Animation Overlay ===== */}
      {allStarAnim && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999,
          animation: 'fadeInOut 2.5s ease-in-out',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '2.5rem', fontWeight: 900,
              color: ALL_STAR_COLORS[allStarAnim.level!] || '#FFD700',
              textShadow: '0 0 20px rgba(255,215,0,0.8)',
              animation: 'pulse 0.5s ease-in-out infinite alternate',
            }}>
              {ALL_STAR_LABELS[allStarAnim.level!]}
            </div>
            <div style={{ color: '#fff', fontSize: '1.3rem', marginTop: 'var(--spacing-md)' }}>
              {allStarAnim.playerName}
            </div>
          </div>
        </div>
      )}

      {/* ===== Cricket Board (3-column: Home | Segment | Away) ===== */}
      <Card style={{ marginBottom: 'var(--spacing-lg)', padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}>
              <th style={{ padding: '10px', textAlign: 'center', width: '35%' }}>
                {match.HomeTeamName}
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {(homeState?.Points || 0) + (currentPlayer?.TeamSeasonID === homeTeamId ? turnPreview.totalPoints : 0)}
                </div>
                <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                  MPR: {getTeamMPR(homeTeamId).toFixed(2)}
                </div>
              </th>
              <th style={{ padding: '10px', textAlign: 'center', width: '30%' }}>
                <div style={{ fontSize: '0.8rem' }}>Segment</div>
                <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>Tap to mark</div>
              </th>
              <th style={{ padding: '10px', textAlign: 'center', width: '35%', backgroundColor: 'var(--color-secondary)', color: 'var(--color-text-on-secondary)' }}>
                {match.AwayTeamName}
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {(awayState?.Points || 0) + (currentPlayer?.TeamSeasonID === awayTeamId ? turnPreview.totalPoints : 0)}
                </div>
                <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                  MPR: {getTeamMPR(awayTeamId).toFixed(2)}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {CRICKET_SEGMENTS.map(seg => {
              const hm = getMarks(homeState, seg);
              const am = getMarks(awayState, seg);
              const bothClosed = isBothClosed(seg);
              const tapCount = turnMarks[seg] || 0;
              const canTap = !disabled && !bothClosed && totalTaps < MAX_TAPS_PER_TURN && getMaxTapsForSeg(seg) > 0;

              // Live preview: show what the marks WILL be after completing turn
              const isCurrentTeamHome = currentPlayer?.TeamSeasonID === homeTeamId;
              const liveHomeMarks = isCurrentTeamHome ? Math.min(hm + tapCount, 9) : hm;
              const liveAwayMarks = !isCurrentTeamHome ? Math.min(am + tapCount, 9) : am;

              return (
                <tr key={seg} style={{
                  borderBottom: '1px solid var(--color-border)',
                  opacity: bothClosed ? 0.3 : 1,
                  backgroundColor: bothClosed ? 'var(--color-surface-hover)' : undefined,
                }}>
                  {/* Home marks */}
                  <td style={{ padding: '10px', textAlign: 'center', fontSize: '1.5rem' }}>
                    {renderMarks(isCurrentTeamHome ? liveHomeMarks : hm)}
                    {isCurrentTeamHome && tapCount > 0 && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', marginLeft: 4 }}>+{tapCount}</span>
                    )}
                  </td>

                  {/* Segment (tappable) */}
                  <td
                    onClick={() => canTap && handleTap(seg)}
                    style={{
                      padding: '12px 10px', textAlign: 'center', fontWeight: 700, fontSize: '1.3rem',
                      color: bothClosed ? 'var(--color-text-light)' : 'var(--color-primary)',
                      cursor: canTap ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                  >
                    <div>{seg}</div>
                    {tapCount > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUntap(seg); }}
                          style={{
                            width: 28, height: 28, border: '1px solid var(--color-danger)',
                            borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-danger)',
                            color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          −
                        </button>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)', minWidth: 24, textAlign: 'center' }}>+{tapCount}</span>
                      </div>
                    )}
                  </td>

                  {/* Away marks */}
                  <td style={{ padding: '10px', textAlign: 'center', fontSize: '1.5rem' }}>
                    {renderMarks(!isCurrentTeamHome ? liveAwayMarks : am)}
                    {!isCurrentTeamHome && tapCount > 0 && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', marginLeft: 4 }}>+{tapCount}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ===== Complete Turn / Undo Buttons (ABOVE now throwing) ===== */}
      {!disabled && (
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
          {(Object.values(turnMarks).some(v => v > 0) || cricketTurns.length > 0) && (
            <Button variant="ghost" onClick={handleUndo} style={{ flex: '0 0 auto' }}>
              ↩️ {Object.values(turnMarks).some(v => v > 0) ? 'Clear' : 'Undo Turn'}
            </Button>
          )}
          <Button
            onClick={completeTurn}
            style={{ flex: 1, minHeight: 56, fontSize: '1.1rem', fontWeight: 700 }}
          >
            Complete Turn {totalTaps > 0 ? `(${turnPreview.totalMarks} marks)` : '(No Score)'}
          </Button>
        </div>
      )}

      {/* ===== Now Throwing (below buttons) ===== */}
      {currentPlayer && !disabled && (
        <Card style={{
          marginBottom: 'var(--spacing-md)', textAlign: 'center',
          borderLeft: `4px solid ${currentTeamColor}`,
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Now Throwing — Round {currentRound}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)', marginTop: 4 }}>
            <PlayerAvatar imageData={currentPlayer.ImageData} name={`${currentPlayer.FirstName} ${currentPlayer.LastName}`} size={40} />
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: currentTeamColor }}>
              {currentPlayer.FirstName} {currentPlayer.LastName} — {getPlayerMPR(currentPlayer.PlayerID).toFixed(1)}
            </div>
          </div>
          <div style={{ marginTop: 'var(--spacing-xs)', fontSize: '1rem', fontWeight: 600 }}>
            Marks: {totalTaps}/{MAX_TAPS_PER_TURN}
            {turnPreview.totalPoints > 0 && (
              <span style={{ marginLeft: 'var(--spacing-md)', color: 'var(--color-success)' }}>
                +{turnPreview.totalPoints} pts
              </span>
            )}
          </div>
        </Card>
      )}

      {/* ===== Turn History ===== */}
      {cricketTurns.length > 0 && (
        <Card title="Turn History">
          <div style={{ overflowX: 'auto', maxHeight: 250 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Rd</th>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Player</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Marks</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Pts</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>MPR</th>
                </tr>
              </thead>
              <tbody>
                {[...cricketTurns].reverse().map(t => {
                  const p = players.find(pl => pl.PlayerID === t.PlayerID);
                  // Running MPR
                  const playerTurnsUpTo = cricketTurns.filter(pt => pt.PlayerID === t.PlayerID && pt.TurnNumber <= t.TurnNumber);
                  const runMarks = playerTurnsUpTo.reduce((s, pt) => s + (pt.MarksScored || 0), 0);
                  const runningMPR = playerTurnsUpTo.length > 0 ? (runMarks / playerTurnsUpTo.length).toFixed(2) : '-';
                  return (
                    <tr key={t.CricketTurnID} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px' }}>{t.RoundNumber}</td>
                      <td style={{ padding: '6px' }}>{p ? `${p.FirstName} ${p.LastName[0]}.` : '?'}</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>{t.MarksScored || 0}</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>
                        {t.Points > 0 ? `+${t.Points}` : '—'}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>{runningMPR}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* All-Star animation keyframes */}
      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes pulse {
          from { transform: scale(1); }
          to { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
