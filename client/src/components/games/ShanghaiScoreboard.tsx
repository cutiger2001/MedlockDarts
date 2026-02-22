import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Game, Match, GamePlayer, Turn, CricketState } from '../../types';
import { gameService } from '../../services/gameService';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { PlayerAvatar } from '../common/PlayerAvatar';

interface ScoreboardProps {
  game: Game;
  match: Match;
  players: GamePlayer[];
  turns: Turn[];
  onAddTurn: (turn: Partial<Turn>) => Promise<void>;
  onUndoTurn: () => Promise<void>;
  onEndGame: (winnerTeamSeasonId: number) => Promise<void>;
}

// Shanghai = Cricket + Triples, Doubles, Three in the Bed
const SHANGHAI_SEGMENTS = ['20', '19', '18', '17', '16', '15', 'Bull', 'T', 'D', '3B'] as const;
const SEGMENT_KEYS: Record<string, keyof CricketState> = {
  '20': 'Seg20', '19': 'Seg19', '18': 'Seg18', '17': 'Seg17',
  '16': 'Seg16', '15': 'Seg15', 'Bull': 'SegBull',
  'T': 'SegTriples', 'D': 'SegDoubles', '3B': 'SegThreeInBed',
};
const EXTRA_SEGMENTS = new Set(['T', 'D', '3B']);
const MAX_TAPS_PER_TURN = 9;

function renderMarks(count: number): React.ReactNode {
  if (count === 0) return <span style={{ opacity: 0.3 }}>·</span>;
  if (count === 1) return <span style={{ fontWeight: 700 }}>/</span>;
  if (count === 2) return <span style={{ fontWeight: 700 }}>X</span>;
  if (count >= 3) return <span style={{ fontWeight: 700 }}>⊗</span>;
  return null;
}

export function ShanghaiScoreboard({ game, match, players, turns, onAddTurn, onUndoTurn, onEndGame }: ScoreboardProps) {
  const [cricketState, setCricketState] = useState<CricketState[]>([]);
  const [turnMarks, setTurnMarks] = useState<Record<string, number>>({});
  const [extraScores, setExtraScores] = useState<Record<string, number>>({});
  const [showExtraPrompt, setShowExtraPrompt] = useState<string | null>(null);
  const [extraInput, setExtraInput] = useState('');
  const [shanghaiAnim, setShanghaiAnim] = useState(false);

  const homeTeamId = match.HomeTeamSeasonID;
  const awayTeamId = match.AwayTeamSeasonID;
  const homePlayers = players.filter(p => p.TeamSeasonID === homeTeamId);
  const awayPlayers = players.filter(p => p.TeamSeasonID === awayTeamId);

  useEffect(() => {
    gameService.getCricketState(game.GameID).then(setCricketState);
  }, [game.GameID, turns.length]);

  const homeState = cricketState.find(s => s.TeamSeasonID === homeTeamId);
  const awayState = cricketState.find(s => s.TeamSeasonID === awayTeamId);

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

  const currentPlayerIndex = turnOrder.length > 0 ? (turns.length % turnOrder.length) : 0;
  const currentPlayer = turnOrder[currentPlayerIndex];
  const currentRound = turnOrder.length > 0 ? Math.floor(turns.length / turnOrder.length) + 1 : 1;

  const getMarks = (state: CricketState | undefined, segment: string): number => {
    if (!state) return 0;
    const key = SEGMENT_KEYS[segment];
    return key ? (state[key] as number) : 0;
  };

  const totalTaps = useMemo(() => {
    return Object.values(turnMarks).reduce((s, v) => s + v, 0);
  }, [turnMarks]);

  const currentTeamColor = currentPlayer?.TeamSeasonID === homeTeamId
    ? 'var(--color-primary)' : 'var(--color-secondary)';

  /* --- Scoring preview --- */
  const turnPreview = useMemo(() => {
    if (!currentPlayer) return { totalMarks: 0, totalPoints: 0 };
    const teamState = cricketState.find(s => s.TeamSeasonID === currentPlayer.TeamSeasonID);
    const opponentState = cricketState.find(s => s.TeamSeasonID !== currentPlayer.TeamSeasonID);

    let totalMarks = 0;
    let totalPoints = 0;

    for (const seg of SHANGHAI_SEGMENTS) {
      const added = turnMarks[seg] || 0;
      if (added === 0) continue;
      const key = SEGMENT_KEYS[seg];
      if (!key) continue;
      totalMarks += added;

      const baseMarks = teamState ? (teamState[key] as number) : 0;
      const marksToClose = Math.max(0, 3 - baseMarks);
      const opponentClosed = opponentState ? (opponentState[key] as number) >= 3 : false;

      if (!opponentClosed && added > marksToClose) {
        if (EXTRA_SEGMENTS.has(seg)) {
          // T/D/3B: use manually entered score
          totalPoints += extraScores[seg] || 0;
        } else {
          const overflow = added - marksToClose;
          const segValue = seg === 'Bull' ? 25 : Number(seg);
          totalPoints += overflow * segValue;
        }
      }
    }
    return { totalMarks, totalPoints };
  }, [turnMarks, extraScores, currentPlayer, cricketState]);

  /* --- Can tap segment? --- */
  const getMaxTapsForSeg = useCallback((seg: string): number => {
    if (!currentPlayer) return 0;
    const teamState = cricketState.find(s => s.TeamSeasonID === currentPlayer.TeamSeasonID);
    const opponentState = cricketState.find(s => s.TeamSeasonID !== currentPlayer.TeamSeasonID);
    const key = SEGMENT_KEYS[seg];
    if (!key) return 0;
    const myMarks = teamState ? (teamState[key] as number) : 0;
    const oppMarks = opponentState ? (opponentState[key] as number) : 0;
    const currentTaps = turnMarks[seg] || 0;
    if (oppMarks >= 3 && myMarks >= 3) return 0; // both closed
    if (oppMarks >= 3) return Math.max(0, 3 - myMarks - currentTaps);
    return MAX_TAPS_PER_TURN - totalTaps;
  }, [currentPlayer, cricketState, turnMarks, totalTaps]);

  const isBothClosed = useCallback((seg: string): boolean => {
    const key = SEGMENT_KEYS[seg];
    if (!key) return false;
    const hm = homeState ? (homeState[key] as number) : 0;
    const am = awayState ? (awayState[key] as number) : 0;
    return hm >= 3 && am >= 3;
  }, [homeState, awayState]);

  const handleTap = useCallback((seg: string) => {
    if (totalTaps >= MAX_TAPS_PER_TURN) return;
    if (getMaxTapsForSeg(seg) <= 0) return;
    const newTaps = (turnMarks[seg] || 0) + 1;
    setTurnMarks(prev => ({ ...prev, [seg]: newTaps }));

    // If T/D/3B and this creates overflow scoring, prompt for score
    if (EXTRA_SEGMENTS.has(seg) && currentPlayer) {
      const teamState = cricketState.find(s => s.TeamSeasonID === currentPlayer.TeamSeasonID);
      const opponentState = cricketState.find(s => s.TeamSeasonID !== currentPlayer.TeamSeasonID);
      const key = SEGMENT_KEYS[seg];
      if (key) {
        const baseMarks = teamState ? (teamState[key] as number) : 0;
        const oppClosed = opponentState ? (opponentState[key] as number) >= 3 : false;
        if (!oppClosed && baseMarks + newTaps > 3) {
          setShowExtraPrompt(seg);
          setExtraInput(String(extraScores[seg] || ''));
        }
      }
    }
  }, [totalTaps, getMaxTapsForSeg, turnMarks, currentPlayer, cricketState, extraScores]);

  const handleUntap = useCallback((seg: string) => {
    setTurnMarks(prev => {
      const current = prev[seg] || 0;
      if (current <= 0) return prev;
      const next = { ...prev };
      if (current === 1) { delete next[seg]; }
      else next[seg] = current - 1;
      return next;
    });
    if (EXTRA_SEGMENTS.has(seg)) {
      setExtraScores(prev => { const n = { ...prev }; delete n[seg]; return n; });
    }
  }, []);

  const confirmExtraScore = () => {
    if (!showExtraPrompt) return;
    setExtraScores(prev => ({ ...prev, [showExtraPrompt]: Number(extraInput) || 0 }));
    setShowExtraPrompt(null);
    setExtraInput('');
  };

  /* --- Complete turn --- */
  const completeTurn = async () => {
    if (!currentPlayer) return;
    const teamState = cricketState.find(s => s.TeamSeasonID === currentPlayer.TeamSeasonID);
    const opponentState = cricketState.find(s => s.TeamSeasonID !== currentPlayer.TeamSeasonID);

    let totalMarks = 0;
    let totalPoints = 0;

    // Update cricket state
    const stateUpdate: Partial<CricketState> = {};
    for (const seg of SHANGHAI_SEGMENTS) {
      const added = turnMarks[seg] || 0;
      if (added === 0) continue;
      const key = SEGMENT_KEYS[seg];
      if (!key) continue;
      totalMarks += added;
      const baseMarks = teamState ? (teamState[key] as number) : 0;
      const newMarks = Math.min(baseMarks + added, 9);
      (stateUpdate as any)[key] = newMarks;

      const marksToClose = Math.max(0, 3 - baseMarks);
      const oppClosed = opponentState ? (opponentState[key] as number) >= 3 : false;
      if (!oppClosed && added > marksToClose) {
        if (EXTRA_SEGMENTS.has(seg)) {
          totalPoints += extraScores[seg] || 0;
        } else {
          const overflow = added - marksToClose;
          const segValue = seg === 'Bull' ? 25 : Number(seg);
          totalPoints += overflow * segValue;
        }
      }
    }

    if (totalPoints > 0) {
      stateUpdate.Points = (teamState?.Points || 0) + totalPoints;
    }

    if (Object.keys(stateUpdate).length > 0) {
      await gameService.updateCricketState(game.GameID, currentPlayer.TeamSeasonID, stateUpdate);
    }

    await onAddTurn({
      PlayerID: currentPlayer.PlayerID,
      TeamSeasonID: currentPlayer.TeamSeasonID,
      TurnNumber: turns.length + 1,
      RoundNumber: currentRound,
      Score: totalPoints,
      MarksScored: totalMarks,
      Details: JSON.stringify({ taps: turnMarks, extraScores }),
    });

    setTurnMarks({});
    setExtraScores({});

    // Check win condition
    const updatedTeamState = { ...teamState } as any;
    for (const seg of SHANGHAI_SEGMENTS) {
      const added = turnMarks[seg] || 0;
      if (added === 0) continue;
      const key = SEGMENT_KEYS[seg];
      if (key) updatedTeamState[key] = Math.min((teamState?.[key] as number || 0) + added, 9);
    }
    updatedTeamState.Points = (teamState?.Points || 0) + totalPoints;
    const allClosed = SHANGHAI_SEGMENTS.every(seg => {
      const key = SEGMENT_KEYS[seg];
      return key && (updatedTeamState[key] as number) >= 3;
    });
    if (allClosed && updatedTeamState.Points >= (opponentState?.Points || 0)) {
      await onEndGame(currentPlayer.TeamSeasonID);
    }
  };

  const handleUndo = async () => {
    if (Object.values(turnMarks).some(v => v > 0)) {
      setTurnMarks({});
      setExtraScores({});
    } else if (turns.length > 0) {
      await onUndoTurn();
    }
  };

  const submitShanghaiBonus = async () => {
    if (!currentPlayer) return;
    setShanghaiAnim(true);
    setTimeout(() => setShanghaiAnim(false), 2500);
    const teamState = cricketState.find(s => s.TeamSeasonID === currentPlayer.TeamSeasonID);
    const newPoints = (teamState?.Points || 0) + 200;
    await gameService.updateCricketState(game.GameID, currentPlayer.TeamSeasonID, { Points: newPoints });
    await onAddTurn({
      PlayerID: currentPlayer.PlayerID,
      TeamSeasonID: currentPlayer.TeamSeasonID,
      TurnNumber: turns.length + 1,
      RoundNumber: currentRound,
      Score: 200,
      IsShanghaiBonus: true,
      Details: JSON.stringify({ shanghai: true }),
    });
  };

  const disabled = game.Status === 'Completed';

  return (
    <div>
      {/* ===== Shanghai Bonus Animation Overlay ===== */}
      {shanghaiAnim && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 9999,
          animation: 'shanghaiOverlay 2.5s ease-in-out',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '4rem',
              animation: 'shanghaiBounce 0.6s ease-in-out infinite alternate',
            }}>
              🀄
            </div>
            <div style={{
              fontSize: '2.5rem', fontWeight: 900,
              color: '#FFD700',
              textShadow: '0 0 30px rgba(255,215,0,0.9), 0 0 60px rgba(255,100,0,0.5)',
              animation: 'shanghaiPulse 0.5s ease-in-out infinite alternate',
              marginTop: 'var(--spacing-sm)',
            }}>
              SHANGHAI!
            </div>
            <div style={{
              fontSize: '1.5rem', fontWeight: 700, color: '#fff',
              marginTop: 'var(--spacing-sm)',
            }}>
              +200 Points
            </div>
          </div>
        </div>
      )}

      {/* Shanghai board (3-column tappable) */}
      <Card style={{ marginBottom: 'var(--spacing-lg)', padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}>
              <th style={{ padding: '10px', textAlign: 'center', width: '35%' }}>
                {match.HomeTeamName}
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {(homeState?.Points || 0) + (currentPlayer?.TeamSeasonID === homeTeamId ? turnPreview.totalPoints : 0)}
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
              </th>
            </tr>
          </thead>
          <tbody>
            {SHANGHAI_SEGMENTS.map(seg => {
              const hm = getMarks(homeState, seg);
              const am = getMarks(awayState, seg);
              const bothClosed = isBothClosed(seg);
              const tapCount = turnMarks[seg] || 0;
              const isExtra = EXTRA_SEGMENTS.has(seg);
              const canTap = !disabled && !bothClosed && totalTaps < MAX_TAPS_PER_TURN && getMaxTapsForSeg(seg) > 0;
              const isCurrentTeamHome = currentPlayer?.TeamSeasonID === homeTeamId;
              const liveHomeMarks = isCurrentTeamHome ? Math.min(hm + tapCount, 9) : hm;
              const liveAwayMarks = !isCurrentTeamHome ? Math.min(am + tapCount, 9) : am;

              return (
                <tr key={seg} style={{
                  borderBottom: '1px solid var(--color-border)',
                  opacity: bothClosed ? 0.3 : 1,
                  backgroundColor: bothClosed ? 'var(--color-surface-hover)' : isExtra ? 'rgba(0,0,0,0.02)' : undefined,
                }}>
                  <td style={{ padding: '10px', textAlign: 'center', fontSize: '1.3rem' }}>
                    {renderMarks(isCurrentTeamHome ? liveHomeMarks : hm)}
                    {isCurrentTeamHome && tapCount > 0 && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', marginLeft: 4 }}>+{tapCount}</span>
                    )}
                  </td>
                  <td
                    onClick={() => canTap && handleTap(seg)}
                    style={{
                      padding: '12px 10px', textAlign: 'center', fontWeight: 700, fontSize: '1.1rem',
                      color: bothClosed ? 'var(--color-text-light)' : isExtra ? 'var(--color-secondary)' : 'var(--color-primary)',
                      cursor: canTap ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                  >
                    <div>{seg === 'T' ? 'Triples' : seg === 'D' ? 'Doubles' : seg === '3B' ? '3-in-Bed' : seg}</div>
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
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)' }}>+{tapCount}</span>
                        {isExtra && extraScores[seg] > 0 && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-warning)' }}>({extraScores[seg]}pts)</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', fontSize: '1.3rem' }}>
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

      {/* T/D/3B score prompt */}
      {showExtraPrompt && (
        <Card style={{ marginBottom: 'var(--spacing-md)', textAlign: 'center', border: '2px solid var(--color-warning)' }}>
          <div style={{ fontWeight: 700, marginBottom: 'var(--spacing-sm)' }}>
            Score for {showExtraPrompt === 'T' ? 'Triples' : showExtraPrompt === 'D' ? 'Doubles' : '3-in-Bed'}?
          </div>
          <input
            type="number"
            value={extraInput}
            onChange={e => setExtraInput(e.target.value)}
            placeholder="Enter points scored"
            style={{ fontSize: '1.2rem', textAlign: 'center', width: 120, padding: '8px', marginBottom: 'var(--spacing-sm)' }}
          />
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'center' }}>
            <Button variant="ghost" onClick={() => { setShowExtraPrompt(null); setExtraInput(''); }}>Skip</Button>
            <Button onClick={confirmExtraScore}>Confirm</Button>
          </div>
        </Card>
      )}

      {/* Complete / Undo / Shanghai */}
      {!disabled && (
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)', flexWrap: 'wrap' }}>
          {(Object.values(turnMarks).some(v => v > 0) || turns.length > 0) && (
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

      {/* Now Throwing */}
      {currentPlayer && !disabled && (
        <Card style={{
          marginBottom: 'var(--spacing-md)', textAlign: 'center',
          borderLeft: `4px solid ${currentTeamColor}`,
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Now Throwing — Round {currentRound}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)', marginTop: 4 }}>
            <PlayerAvatar imageData={currentPlayer.ImageData} name={`${currentPlayer.FirstName} ${currentPlayer.LastName}`} size={40} />
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: currentTeamColor }}>
              {currentPlayer.FirstName} {currentPlayer.LastName}
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

      {!disabled && (
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-md)' }}>
          <Button variant="secondary" size="lg" onClick={submitShanghaiBonus}>
            🀄 SHANGHAI (+200)
          </Button>
        </div>
      )}

      {/* Turn History */}
      {turns.length > 0 && (
        <Card title="Turn History">
          <div style={{ overflowX: 'auto', maxHeight: 200 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Rd</th>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Player</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Marks</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {[...turns].reverse().map(t => {
                  const p = players.find(pl => pl.PlayerID === t.PlayerID);
                  return (
                    <tr key={t.TurnID} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px' }}>{t.RoundNumber}</td>
                      <td style={{ padding: '6px' }}>{p ? `${p.FirstName} ${p.LastName[0]}.` : '?'}</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>{t.MarksScored || 0}</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>
                        {t.IsShanghaiBonus ? '🀄 +200' : t.Score > 0 ? `+${t.Score}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* Shanghai animation keyframes — injected once */
const styleId = 'shanghai-anim-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes shanghaiOverlay {
      0% { opacity: 0; }
      15% { opacity: 1; }
      80% { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes shanghaiPulse {
      from { transform: scale(1); }
      to { transform: scale(1.15); }
    }
    @keyframes shanghaiBounce {
      from { transform: translateY(0); }
      to { transform: translateY(-12px); }
    }
  `;
  document.head.appendChild(style);
}
