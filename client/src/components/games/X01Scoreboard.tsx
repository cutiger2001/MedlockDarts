import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Game, Match, GamePlayer, Turn } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { PlayerAvatar } from '../common/PlayerAvatar';
import { useSettings } from '../../contexts/SettingsContext';
import { getCheckout } from '../../data/checkoutChart';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Dart {
  segment: number | 'BULL' | 'MISS';
  multiplier: 0 | 1 | 2 | 3;  // 0 = miss
  score: number;
}

interface ScoreboardProps {
  game: Game;
  match: Match;
  players: GamePlayer[];
  turns: Turn[];
  onAddTurn: (turn: Partial<Turn>) => Promise<void>;
  onUndoTurn: () => Promise<void>;
  onEndGame: (winnerTeamSeasonId: number) => Promise<void>;
}

type AllStarLevel = 'allstar' | 'double' | 'triple' | null;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SEGMENTS = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
const MAX_DARTS_PER_TURN = 3;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function calcDartScore(dart: Dart): number {
  if (dart.segment === 'MISS') return 0;
  if (dart.segment === 'BULL') return dart.multiplier === 2 ? 50 : 25;
  return (dart.segment as number) * dart.multiplier;
}

function isDouble(dart: Dart): boolean {
  return dart.multiplier === 2;
}

function getEffectiveTurnScore(darts: Dart[], needDoubleIn: boolean, alreadyDoubledIn: boolean): number {
  if (!needDoubleIn || alreadyDoubledIn) {
    return darts.reduce((s, d) => s + d.score, 0);
  }
  const firstDoubleIdx = darts.findIndex(d => isDouble(d));
  if (firstDoubleIdx === -1) return 0;
  return darts.slice(firstDoubleIdx).reduce((s, d) => s + d.score, 0);
}

/* ------------------------------------------------------------------ */
/*  All-Star Thresholds                                                */
/* ------------------------------------------------------------------ */

function getX01AllStarLevel(score: number, isDoubleIn: boolean, isGameOut: boolean): AllStarLevel {
  // ×2 multiplier if double-in or double-out turn
  const multiplier = (isDoubleIn || isGameOut) ? 2 : 1;
  const adjusted = score * multiplier;
  if (adjusted >= 171) return 'triple';
  if (adjusted >= 126) return 'double';
  if (adjusted >= 95) return 'allstar';
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

export function X01Scoreboard({ game, match, players, turns, onAddTurn, onUndoTurn, onEndGame }: ScoreboardProps) {
  const { settings } = useSettings();
  const scoringMode = settings.x01ScoringMode;

  const [currentDarts, setCurrentDarts] = useState<Dart[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<number | 'BULL' | 'MISS' | null>(null);
  const [preSelectMultiplier, setPreSelectMultiplier] = useState<2 | 3 | null>(null);
  const [bustMessage, setBustMessage] = useState('');

  // Turn mode state
  const [turnInput, setTurnInput] = useState('');
  const [turnDarts, setTurnDarts] = useState('3');
  const [turnIsDoubleIn, setTurnIsDoubleIn] = useState(false);
  const [turnIsGameOut, setTurnIsGameOut] = useState(false);
  const [dartsPromptScore, setDartsPromptScore] = useState<number | null>(null);

  // All-Star animation
  const [allStarAnim, setAllStarAnim] = useState<{ level: AllStarLevel; playerName: string } | null>(null);

  const target = game.X01Target || 501;
  const doubleInRequired = game.DoubleInRequired;

  /* --- Team grouping --- */
  const homeTeamId = match.HomeTeamSeasonID;
  const awayTeamId = match.AwayTeamSeasonID;
  const homePlayers = players.filter(p => p.TeamSeasonID === homeTeamId);
  const awayPlayers = players.filter(p => p.TeamSeasonID === awayTeamId);

  /* --- Turn order (alternating home/away, or custom if pre-ordered) --- */
  const turnOrder = useMemo(() => {
    // Check if players are already in custom order (cork)
    // Custom order is detected when the first player is NOT from the home team
    // or players don't follow the natural home/away interleave
    const naturalOrder: GamePlayer[] = [];
    const max = Math.max(homePlayers.length, awayPlayers.length);
    for (let i = 0; i < max; i++) {
      if (homePlayers[i]) naturalOrder.push(homePlayers[i]);
      if (awayPlayers[i]) naturalOrder.push(awayPlayers[i]);
    }
    // Use passed-in players array if it differs from natural order
    const isCustom = players.length > 0 && naturalOrder.length > 0 &&
      players[0].PlayerID !== naturalOrder[0].PlayerID;
    return isCustom ? [...players] : naturalOrder;
  }, [players, homePlayers, awayPlayers]);

  const currentPlayerIndex = turnOrder.length > 0 ? (turns.length % turnOrder.length) : 0;
  const currentPlayer = turnOrder[currentPlayerIndex];
  const currentRound = turnOrder.length > 0 ? Math.floor(turns.length / turnOrder.length) + 1 : 1;

  /* --- Team remaining scores (both players reduce one shared score) --- */
  const teamScores = useMemo(() => {
    const scores: Record<number, { total: number; remaining: number; hasDoubledIn: boolean }> = {};
    scores[homeTeamId] = { total: 0, remaining: target, hasDoubledIn: false };
    scores[awayTeamId] = { total: 0, remaining: target, hasDoubledIn: false };
    for (const t of turns) {
      const teamId = t.TeamSeasonID;
      if (scores[teamId]) {
        scores[teamId].total += t.Score;
        scores[teamId].remaining = target - scores[teamId].total;
        if (t.IsDoubleIn) scores[teamId].hasDoubledIn = true;
      }
    }
    return scores;
  }, [turns, homeTeamId, awayTeamId, target]);

  /* --- Per-player stats (for individual dart counts) --- */
  const playerStats = useMemo(() => {
    const stats: Record<number, { dartsThrown: number; totalScore: number }> = {};
    for (const p of players) {
      stats[p.PlayerID] = { dartsThrown: 0, totalScore: 0 };
    }
    for (const t of turns) {
      if (stats[t.PlayerID]) {
        stats[t.PlayerID].dartsThrown += t.DartsThrown;
        stats[t.PlayerID].totalScore += t.Score;
      }
    }
    return stats;
  }, [turns, players]);

  /* --- PPD per player --- */
  const getPlayerPPD = (playerId: number) => {
    const s = playerStats[playerId];
    if (!s || s.dartsThrown === 0) return 0;
    return s.totalScore / s.dartsThrown;
  };

  /* --- Average (PPD * 3) per player --- */
  const getPlayerAverage = (playerId: number) => getPlayerPPD(playerId) * 3;

  const currentTeamScore = currentPlayer ? teamScores[currentPlayer.TeamSeasonID] : null;
  const turnScoreSoFar = currentDarts.reduce((s, d) => s + d.score, 0);
  const liveRemaining = currentTeamScore ? currentTeamScore.remaining - getEffectiveTurnScore(currentDarts, doubleInRequired, currentTeamScore.hasDoubledIn) : target;

  const hasDoubledIn = useMemo(() => {
    if (!doubleInRequired) return true;
    if (currentTeamScore?.hasDoubledIn) return true;
    return currentDarts.some(d => isDouble(d));
  }, [doubleInRequired, currentTeamScore, currentDarts]);

  /* --- Finish the turn and submit --- */
  const finishTurn = async (darts: Dart[], isBust: boolean) => {
    if (!currentPlayer) return;
    const dartsThrown = darts.length;
    const hasDoubleInThisTurn = darts.some(d => isDouble(d));
    const effectiveScore = isBust ? 0 : getEffectiveTurnScore(darts, doubleInRequired, currentTeamScore?.hasDoubledIn || false);
    const remaining = (currentTeamScore?.remaining || target) - effectiveScore;
    const isGameOut = remaining === 0 && !isBust;
    const isDoubleIn = doubleInRequired && !currentTeamScore?.hasDoubledIn && hasDoubleInThisTurn && !isBust;

    // All-Star check
    if (!isBust && effectiveScore > 0) {
      const level = getX01AllStarLevel(effectiveScore, isDoubleIn, isGameOut);
      if (level) {
        setAllStarAnim({ level, playerName: `${currentPlayer.FirstName} ${currentPlayer.LastName}` });
        setTimeout(() => setAllStarAnim(null), 2500);
      }
    }

    await onAddTurn({
      PlayerID: currentPlayer.PlayerID,
      TeamSeasonID: currentPlayer.TeamSeasonID,
      TurnNumber: turns.length + 1,
      RoundNumber: currentRound,
      DartsThrown: dartsThrown,
      Score: effectiveScore,
      RemainingScore: remaining,
      IsDoubleIn: isDoubleIn,
      IsGameOut: isGameOut,
      Details: JSON.stringify({ darts, bust: isBust, allStarLevel: getX01AllStarLevel(effectiveScore, isDoubleIn, isGameOut) }),
    });

    setCurrentDarts([]);
    setSelectedSegment(null);
    setPreSelectMultiplier(null);

    if (isGameOut) {
      await onEndGame(currentPlayer.TeamSeasonID);
    }
  };

  /* --- Turn mode: submit turn total --- */
  const submitTurnScore = async (score: number, dartsOverride?: number) => {
    if (!currentPlayer) return;
    setBustMessage('');
    const remaining = (currentTeamScore?.remaining || target) - score;

    // Validate
    if (score < 0 || score > 180) {
      setBustMessage('Invalid score (0-180)');
      return;
    }
    if (remaining < 0) {
      setBustMessage(`BUST! Would go below 0 (${remaining})`);
      setTurnInput('');
      return;
    }
    if (remaining === 1) {
      setBustMessage("BUST! Can't leave 1 — need a double to finish");
      setTurnInput('');
      return;
    }

    // If remaining = 0, this is a game-out — ask how many darts were thrown
    if (remaining === 0 && dartsOverride === undefined) {
      setDartsPromptScore(score);
      return;
    }

    const dartsThrown = dartsOverride || 3;
    const isGameOut = remaining === 0;

    // Auto double-in: if team hasn't doubled in and player scores > 0, assume they doubled in
    const isDoubleIn = doubleInRequired && !currentTeamScore?.hasDoubledIn && score > 0;

    // All-Star check
    if (score > 0) {
      const level = getX01AllStarLevel(score, isDoubleIn, isGameOut);
      if (level) {
        setAllStarAnim({ level, playerName: `${currentPlayer.FirstName} ${currentPlayer.LastName}` });
        setTimeout(() => setAllStarAnim(null), 2500);
      }
    }

    await onAddTurn({
      PlayerID: currentPlayer.PlayerID,
      TeamSeasonID: currentPlayer.TeamSeasonID,
      TurnNumber: turns.length + 1,
      RoundNumber: currentRound,
      DartsThrown: dartsThrown,
      Score: score,
      RemainingScore: remaining,
      IsDoubleIn: isDoubleIn,
      IsGameOut: isGameOut,
      Details: JSON.stringify({ allStarLevel: getX01AllStarLevel(score, isDoubleIn, isGameOut) }),
    });

    setTurnInput('');
    setTurnDarts('3');
    setTurnIsDoubleIn(false);
    setTurnIsGameOut(false);
    setDartsPromptScore(null);

    if (isGameOut) {
      await onEndGame(currentPlayer.TeamSeasonID);
    }
  };

  /* --- Confirm darts on game-out prompt --- */
  const confirmDartsAndSubmit = async (darts: number) => {
    if (dartsPromptScore === null) return;
    const score = dartsPromptScore;
    setDartsPromptScore(null);
    await submitTurnScore(score, darts);
  };

  /* --- Confirm a dart throw --- */
  const confirmDart = useCallback((multiplier: 0 | 1 | 2 | 3) => {
    if (selectedSegment === null || !currentPlayer) return;
    setBustMessage('');

    const dart: Dart = {
      segment: selectedSegment,
      multiplier: selectedSegment === 'MISS' ? 0 : multiplier,
      score: 0,
    };
    dart.score = calcDartScore(dart);

    // Calculate remaining after this dart
    const allDarts = [...currentDarts, dart];
    const effectiveScore = getEffectiveTurnScore(allDarts, doubleInRequired, currentTeamScore?.hasDoubledIn || false);
    const remainingAfter = (currentTeamScore?.remaining || target) - effectiveScore;

    // Bust checks
    if (remainingAfter < 0) {
      setBustMessage(`BUST! Would go below 0 (${remainingAfter})`);
      setPreSelectMultiplier(null);
      finishTurn(allDarts, true);
      return;
    }
    if (remainingAfter === 1) {
      setBustMessage("BUST! Can't leave 1 — need a double to finish");
      setPreSelectMultiplier(null);
      finishTurn(allDarts, true);
      return;
    }
    if (remainingAfter === 0 && !isDouble(dart)) {
      setBustMessage('BUST! Must finish on a double');
      setPreSelectMultiplier(null);
      finishTurn(allDarts, true);
      return;
    }

    // Checkout — reached exactly 0 with a double
    if (remainingAfter === 0 && isDouble(dart)) {
      setPreSelectMultiplier(null);
      finishTurn(allDarts, false);
      return;
    }

    // 3 darts thrown — end turn normally
    if (allDarts.length >= MAX_DARTS_PER_TURN) {
      setPreSelectMultiplier(null);
      finishTurn(allDarts, false);
      return;
    }

    setCurrentDarts(allDarts);
    setSelectedSegment(null);
    // Keep preSelectMultiplier active for consecutive throws
  }, [selectedSegment, currentPlayer, currentDarts, currentTeamScore, doubleInRequired, target, turns.length, currentRound]);

  /* --- Handle segment tap with pre-select support --- */
  const handleSegmentTap = useCallback((seg: number | 'BULL') => {
    setBustMessage('');
    if (preSelectMultiplier !== null) {
      // Apply pre-selected multiplier immediately
      const mult = seg === 'BULL' ? 2 : preSelectMultiplier; // Bull can't be triple
      setSelectedSegment(seg);
      // Confirm immediately
      setTimeout(() => {
        const dart: Dart = {
          segment: seg,
          multiplier: mult as 0 | 1 | 2 | 3,
          score: 0,
        };
        dart.score = calcDartScore(dart);
        const allDarts = [...currentDarts, dart];
        const effectiveScore = getEffectiveTurnScore(allDarts, doubleInRequired, currentTeamScore?.hasDoubledIn || false);
        const remainingAfter = (currentTeamScore?.remaining || target) - effectiveScore;

        if (remainingAfter < 0) {
          setBustMessage(`BUST! Would go below 0 (${remainingAfter})`);
          setPreSelectMultiplier(null);
          finishTurn(allDarts, true);
          return;
        }
        if (remainingAfter === 1) {
          setBustMessage("BUST! Can't leave 1 — need a double to finish");
          setPreSelectMultiplier(null);
          finishTurn(allDarts, true);
          return;
        }
        if (remainingAfter === 0 && !isDouble(dart)) {
          setBustMessage('BUST! Must finish on a double');
          setPreSelectMultiplier(null);
          finishTurn(allDarts, true);
          return;
        }
        if (remainingAfter === 0 && isDouble(dart)) {
          setPreSelectMultiplier(null);
          finishTurn(allDarts, false);
          return;
        }
        if (allDarts.length >= MAX_DARTS_PER_TURN) {
          setPreSelectMultiplier(null);
          finishTurn(allDarts, false);
          return;
        }
        setCurrentDarts(allDarts);
        setSelectedSegment(null);
      }, 0);
    } else {
      setSelectedSegment(seg);
    }
  }, [preSelectMultiplier, currentDarts, currentTeamScore, doubleInRequired, target, turns.length, currentRound]);

  /* --- Miss shortcut --- */
  const handleMiss = useCallback(() => {
    if (!currentPlayer) return;
    setBustMessage('');
    setPreSelectMultiplier(null);
    const dart: Dart = { segment: 'MISS', multiplier: 0, score: 0 };
    const newDarts = [...currentDarts, dart];
    if (newDarts.length >= MAX_DARTS_PER_TURN) {
      finishTurn(newDarts, false);
      return;
    }
    setCurrentDarts(newDarts);
    setSelectedSegment(null);
  }, [currentPlayer, currentDarts, turns.length, currentRound, currentTeamScore, target, doubleInRequired]);

  /* --- Undo --- */
  const handleUndo = async () => {
    if (currentDarts.length > 0) {
      setCurrentDarts(prev => prev.slice(0, -1));
      setBustMessage('');
    } else if (turns.length > 0) {
      await onUndoTurn();
      setBustMessage('');
    }
  };

  /* --- Turn mode: numpad input --- */
  const handleNumpad = (n: string) => {
    if (n === 'C') {
      setTurnInput('');
      return;
    }
    if (n === 'BS') {
      setTurnInput(prev => prev.slice(0, -1));
      return;
    }
    const next = turnInput + n;
    if (Number(next) <= 180) {
      setTurnInput(next);
    }
  };

  const disabled = game.Status === 'Completed';

  /* --- Team color for current player --- */
  const currentTeamColor = currentPlayer?.TeamSeasonID === homeTeamId
    ? 'var(--color-primary)' : 'var(--color-secondary)';
  const currentTeamTextColor = currentPlayer?.TeamSeasonID === homeTeamId
    ? 'var(--color-text-on-primary)' : 'var(--color-text-on-secondary)';

  /* --- Available multipliers for selected segment --- */
  const availableMultipliers = useMemo(() => {
    if (selectedSegment === null || selectedSegment === 'MISS') return [];
    if (selectedSegment === 'BULL') return [{ label: 'Single (25)', value: 1 as const }, { label: 'Double (50)', value: 2 as const }];
    return [
      { label: 'Single', value: 1 as const },
      { label: 'Double', value: 2 as const },
      { label: 'Triple', value: 3 as const },
    ];
  }, [selectedSegment]);

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

      {/* ===== Score Header ===== */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)',
        alignItems: 'center',
      }}>
        {/* Home team */}
        <Card style={{
          textAlign: 'center', backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)', padding: 'var(--spacing-md)',
          outline: !disabled && currentPlayer?.TeamSeasonID === homeTeamId ? '3px solid #FFD700' : 'none',
          outlineOffset: 2,
        }}>
          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{match.HomeTeamName}</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, margin: 'var(--spacing-xs) 0' }}>
            {teamScores[homeTeamId]?.remaining ?? target}
          </div>
          {homePlayers.map(p => (
            <div key={p.PlayerID} style={{
              padding: '2px 0',
              fontWeight: currentPlayer?.PlayerID === p.PlayerID ? 700 : 400,
              opacity: currentPlayer?.PlayerID === p.PlayerID ? 1 : 0.7,
            }}>
              <span style={{ fontSize: '0.8rem' }}>{p.FirstName} {p.LastName}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: 4 }}>
                ({playerStats[p.PlayerID]?.dartsThrown || 0}d)
              </span>
              <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                Avg: {getPlayerAverage(p.PlayerID).toFixed(1)} | PPD: {getPlayerPPD(p.PlayerID).toFixed(2)}
              </div>
            </div>
          ))}
        </Card>

        {/* Center info */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>{target}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Round {currentRound}</div>
          {doubleInRequired && (
            <div style={{
              fontSize: '0.7rem', fontWeight: 700,
              marginTop: 4, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-secondary)', color: 'var(--color-text-on-secondary)',
            }}>
              DOUBLE IN
            </div>
          )}
          <div style={{
            fontSize: '0.7rem', fontWeight: 700,
            marginTop: 4, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
          }}>
            DOUBLE OUT
          </div>
        </div>

        {/* Away team */}
        <Card style={{
          textAlign: 'center', backgroundColor: 'var(--color-secondary)', color: 'var(--color-text-on-secondary)', padding: 'var(--spacing-md)',
          outline: !disabled && currentPlayer?.TeamSeasonID === awayTeamId ? '3px solid #FFD700' : 'none',
          outlineOffset: 2,
        }}>
          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{match.AwayTeamName}</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, margin: 'var(--spacing-xs) 0' }}>
            {teamScores[awayTeamId]?.remaining ?? target}
          </div>
          {awayPlayers.map(p => (
            <div key={p.PlayerID} style={{
              padding: '2px 0',
              fontWeight: currentPlayer?.PlayerID === p.PlayerID ? 700 : 400,
              opacity: currentPlayer?.PlayerID === p.PlayerID ? 1 : 0.7,
            }}>
              <span style={{ fontSize: '0.8rem' }}>{p.FirstName} {p.LastName}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: 4 }}>
                ({playerStats[p.PlayerID]?.dartsThrown || 0}d)
              </span>
              <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                Avg: {getPlayerAverage(p.PlayerID).toFixed(1)} | PPD: {getPlayerPPD(p.PlayerID).toFixed(2)}
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* ===== Double-Out Chart ===== */}
      {currentPlayer && !disabled && (() => {
        const remaining = teamScores[currentPlayer.TeamSeasonID]?.remaining ?? target;
        const checkout = remaining <= 170 ? getCheckout(remaining) : null;
        if (!checkout) return null;
        return (
          <Card style={{
            marginBottom: 'var(--spacing-md)', textAlign: 'center',
            border: '2px solid var(--color-success)',
            backgroundColor: 'var(--color-surface)',
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginBottom: 4 }}>
              Checkout ({remaining})
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--spacing-sm)' }}>
              {checkout.map((dart, i) => (
                <div key={i} style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: dart.startsWith('D') ? 'var(--color-success)' :
                    dart.startsWith('T') ? 'var(--color-danger)' : 'var(--color-surface-hover)',
                  color: (dart.startsWith('D') || dart.startsWith('T')) ? '#fff' : 'var(--color-text)',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                }}>
                  {dart}
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* ===== Now Throwing (dart mode only — turn mode shows below numpad) ===== */}
      {currentPlayer && !disabled && scoringMode === 'dart' && (
        <Card style={{ marginBottom: 'var(--spacing-md)', textAlign: 'center', borderLeft: `4px solid ${currentTeamColor}` }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Now Throwing</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)', marginTop: 4 }}>
            <PlayerAvatar imageData={currentPlayer.ImageData} name={`${currentPlayer.FirstName} ${currentPlayer.LastName}`} size={40} />
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: currentTeamColor }}>
              {currentPlayer.FirstName} {currentPlayer.LastName}
            </div>
          </div>
          {doubleInRequired && !hasDoubledIn && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 600, marginTop: 2 }}>
              Needs Double In
            </div>
          )}
        </Card>
      )}

      {/* ===== Current Turn Darts (dart mode only) ===== */}
      {!disabled && scoringMode === 'dart' && (
        <Card style={{ marginBottom: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
            {[0, 1, 2].map(i => {
              const dart = currentDarts[i];
              const isActive = i === currentDarts.length;
              return (
                <div key={i} style={{
                  width: 90, height: 70, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${isActive ? 'var(--color-primary)' : dart ? 'var(--color-success)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: dart ? 'var(--color-surface-hover)' : 'transparent',
                }}>
                  {dart ? (
                    <>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{dart.score}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-light)' }}>
                        {dart.segment === 'MISS' ? 'MISS' :
                          dart.segment === 'BULL' ? (dart.multiplier === 2 ? 'D-BULL' : 'BULL') :
                          `${dart.multiplier === 3 ? 'T' : dart.multiplier === 2 ? 'D' : 'S'}${dart.segment}`}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                      Dart {i + 1}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Running total for this turn */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-sm)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Turn total: </span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{turnScoreSoFar}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginLeft: 'var(--spacing-sm)' }}>
              Remaining: <strong>{liveRemaining}</strong>
            </span>
          </div>
        </Card>
      )}

      {/* ===== Bust Message ===== */}
      {bustMessage && (
        <div style={{
          padding: 'var(--spacing-sm) var(--spacing-md)',
          marginBottom: 'var(--spacing-md)',
          backgroundColor: 'var(--color-danger)',
          color: '#fff',
          borderRadius: 'var(--radius-sm)',
          fontWeight: 700,
          textAlign: 'center',
          fontSize: '1rem',
        }}>
          {bustMessage}
        </div>
      )}

      {/* ===== Dart Input (Dart-by-Dart Mode) ===== */}
      {!disabled && scoringMode === 'dart' && currentDarts.length < MAX_DARTS_PER_TURN && (
        <Card style={{ marginBottom: 'var(--spacing-md)' }}>
          {/* Double/Treble Pre-Select Buttons */}
          <div style={{
            display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'center',
            marginBottom: 'var(--spacing-md)',
          }}>
            <Button
              size="lg"
              variant={preSelectMultiplier === 2 ? 'primary' : 'ghost'}
              onClick={() => setPreSelectMultiplier(prev => prev === 2 ? null : 2)}
              style={{
                minWidth: 80, minHeight: 48, fontWeight: 700, fontSize: '1rem',
                border: preSelectMultiplier === 2 ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
            >
              DOUBLE
            </Button>
            <Button
              size="lg"
              variant={preSelectMultiplier === 3 ? 'primary' : 'ghost'}
              onClick={() => setPreSelectMultiplier(prev => prev === 3 ? null : 3)}
              style={{
                minWidth: 80, minHeight: 48, fontWeight: 700, fontSize: '1rem',
                border: preSelectMultiplier === 3 ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
            >
              TREBLE
            </Button>
          </div>

          {/* Multiplier buttons (show when segment is selected AND no pre-select) */}
          {selectedSegment !== null && selectedSegment !== 'MISS' && preSelectMultiplier === null && (
            <div style={{
              display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'center',
              marginBottom: 'var(--spacing-md)', flexWrap: 'wrap',
            }}>
              {availableMultipliers.map(m => {
                const previewScore = selectedSegment === 'BULL'
                  ? (m.value === 2 ? 50 : 25)
                  : (selectedSegment as number) * m.value;
                return (
                  <Button
                    key={m.value}
                    size="lg"
                    variant="primary"
                    onClick={() => confirmDart(m.value)}
                    style={{
                      minWidth: 100, minHeight: 56, fontSize: '1rem',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}
                  >
                    <span>{m.label}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{previewScore}</span>
                  </Button>
                );
              })}
              <Button variant="ghost" size="lg" onClick={() => setSelectedSegment(null)}
                style={{ minWidth: 80, minHeight: 56 }}>
                Cancel
              </Button>
            </div>
          )}

          {/* Segment grid */}
          <div style={{ marginBottom: 'var(--spacing-sm)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 'var(--spacing-xs)', color: 'var(--color-text-light)' }}>
              {preSelectMultiplier === 2 ? 'Tap segment for DOUBLE' : preSelectMultiplier === 3 ? 'Tap segment for TREBLE' : 'Select Segment'}
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 'var(--spacing-xs)',
            }}>
              {SEGMENTS.map(seg => (
                <Button
                  key={seg}
                  size="lg"
                  variant={selectedSegment === seg ? 'secondary' : 'ghost'}
                  onClick={() => handleSegmentTap(seg)}
                  style={{
                    fontSize: '1.1rem', fontWeight: 700, minHeight: 52,
                    border: selectedSegment === seg ? '2px solid var(--color-secondary)' : '1px solid var(--color-border)',
                  }}
                >
                  {seg}
                </Button>
              ))}
            </div>

            {/* Bull + Miss row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-xs)', marginTop: 'var(--spacing-xs)' }}>
              <Button
                size="lg"
                variant={selectedSegment === 'BULL' ? 'secondary' : 'ghost'}
                onClick={() => handleSegmentTap('BULL')}
                style={{
                  fontSize: '1.1rem', fontWeight: 700, minHeight: 52,
                  border: selectedSegment === 'BULL' ? '2px solid var(--color-secondary)' : '1px solid var(--color-border)',
                }}
              >
                BULL
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={handleMiss}
                style={{
                  fontSize: '1.1rem', fontWeight: 700, minHeight: 52,
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-danger)',
                }}
              >
                MISS
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ===== Turn Scoring Mode (Numpad) ===== */}
      {!disabled && scoringMode === 'turn' && (
        <>
          <Card style={{ marginBottom: 'var(--spacing-md)' }}>
            {/* Turn input display */}
            <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-md)' }}>
              <div style={{
                fontSize: '2.5rem', fontWeight: 700, minHeight: 60,
                padding: 'var(--spacing-sm)',
                border: `2px solid ${currentTeamColor}`,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
              }}>
                {turnInput || '0'}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: 4 }}>
                Remaining after: {(currentTeamScore?.remaining || target) - (Number(turnInput) || 0)}
              </div>
            </div>

            {/* Fast entry buttons */}
            <div style={{
              display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap',
              justifyContent: 'center', marginBottom: 'var(--spacing-md)',
            }}>
              {settings.fastEntryScores.map(s => (
                <Button
                  key={s}
                  variant="ghost"
                  onClick={() => submitTurnScore(s)}
                  style={{
                    minWidth: 60, minHeight: 48, fontWeight: 700, fontSize: '1rem',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {s}
                </Button>
              ))}
            </div>

            {/* Numpad */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 'var(--spacing-xs)', maxWidth: 300, margin: '0 auto',
            }}>
              {[7, 8, 9, 4, 5, 6, 1, 2, 3].map(n => (
                <Button
                  key={n}
                  size="lg"
                  variant="ghost"
                  onClick={() => handleNumpad(String(n))}
                  style={{ minHeight: 56, fontSize: '1.3rem', fontWeight: 700, border: '1px solid var(--color-border)' }}
                >
                  {n}
                </Button>
              ))}
              <Button
                size="lg"
                variant="ghost"
                onClick={() => handleNumpad('C')}
                style={{ minHeight: 56, fontSize: '1rem', fontWeight: 700, border: '1px solid var(--color-border)', color: 'var(--color-danger)' }}
              >
                CLR
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={() => handleNumpad('0')}
                style={{ minHeight: 56, fontSize: '1.3rem', fontWeight: 700, border: '1px solid var(--color-border)' }}
              >
                0
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={() => handleNumpad('BS')}
                style={{ minHeight: 56, fontSize: '1rem', fontWeight: 700, border: '1px solid var(--color-border)' }}
              >
                ⌫
              </Button>
            </div>

            {/* Submit button */}
            <Button
              onClick={() => submitTurnScore(Number(turnInput) || 0)}
              style={{ width: '100%', marginTop: 'var(--spacing-md)', minHeight: 56, fontSize: '1.1rem', fontWeight: 700 }}
            >
              Submit Turn ({turnInput || '0'})
            </Button>
          </Card>

          {/* ===== Now Throwing (below numpad in turn mode) ===== */}
          {currentPlayer && (
            <Card style={{
              marginBottom: 'var(--spacing-md)', textAlign: 'center',
              borderLeft: `4px solid ${currentTeamColor}`,
            }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Now Throwing</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)', marginTop: 4 }}>
                <PlayerAvatar imageData={currentPlayer.ImageData} name={`${currentPlayer.FirstName} ${currentPlayer.LastName}`} size={40} />
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: currentTeamColor }}>
                  {currentPlayer.FirstName} {currentPlayer.LastName}
                </div>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: 2 }}>
                Avg: {getPlayerAverage(currentPlayer.PlayerID).toFixed(1)} | PPD: {getPlayerPPD(currentPlayer.PlayerID).toFixed(2)}
              </div>
              {doubleInRequired && !currentTeamScore?.hasDoubledIn && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 600, marginTop: 2 }}>
                  Needs Double In
                </div>
              )}
            </Card>
          )}

          {/* ===== Darts Prompt (on game-out) ===== */}
          {dartsPromptScore !== null && (
            <Card style={{
              marginBottom: 'var(--spacing-md)', textAlign: 'center',
              border: '2px solid var(--color-success)',
              backgroundColor: 'var(--color-surface)',
            }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 'var(--spacing-sm)', color: 'var(--color-success)' }}>
                🎯 Game Out! Score: {dartsPromptScore}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
                How many darts were thrown?
              </div>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'center' }}>
                {[1, 2, 3].map(d => (
                  <Button
                    key={d}
                    size="lg"
                    variant="primary"
                    onClick={() => confirmDartsAndSubmit(d)}
                    style={{ minWidth: 80, minHeight: 56, fontSize: '1.3rem', fontWeight: 700 }}
                  >
                    {d}
                  </Button>
                ))}
              </div>
              <Button
                variant="ghost"
                onClick={() => { setDartsPromptScore(null); setTurnInput(''); }}
                style={{ marginTop: 'var(--spacing-sm)' }}
              >
                Cancel
              </Button>
            </Card>
          )}
        </>
      )}

      {/* ===== Undo ===== */}
      {(currentDarts.length > 0 || turns.length > 0) && !disabled && (
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)' }}>
          <Button variant="ghost" size="sm" onClick={handleUndo}>
            ↩️ {currentDarts.length > 0 && scoringMode === 'dart' ? 'Undo Last Dart' : 'Undo Last Turn'}
          </Button>
        </div>
      )}

      {/* ===== Turn History ===== */}
      {turns.length > 0 && (
        <Card title="Turn History">
          <div style={{ overflowX: 'auto', maxHeight: 300 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Rd</th>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Player</th>
                  <th style={{ padding: '6px', textAlign: 'center' }}>Darts</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Score</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Left</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Avg</th>
                </tr>
              </thead>
              <tbody>
                {[...turns].reverse().map(t => {
                  const p = players.find(pl => pl.PlayerID === t.PlayerID);
                  const details = t.Details ? (() => { try { return JSON.parse(t.Details); } catch { return null; } })() : null;
                  const dartLabels = details?.darts?.map((d: Dart) =>
                    d.segment === 'MISS' ? 'M' :
                    d.segment === 'BULL' ? (d.multiplier === 2 ? 'D-B' : 'B') :
                    `${d.multiplier === 3 ? 'T' : d.multiplier === 2 ? 'D' : 'S'}${d.segment}`
                  );
                  // Running average up to this turn for this player
                  const playerTurnsUpTo = turns.filter(pt => pt.PlayerID === t.PlayerID && pt.TurnNumber <= t.TurnNumber);
                  const totalDarts = playerTurnsUpTo.reduce((s, pt) => s + pt.DartsThrown, 0);
                  const totalScore = playerTurnsUpTo.reduce((s, pt) => s + pt.Score, 0);
                  const runningAvg = totalDarts > 0 ? ((totalScore / totalDarts) * 3).toFixed(1) : '-';
                  return (
                    <tr key={t.TurnID} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px' }}>{t.RoundNumber}</td>
                      <td style={{ padding: '6px' }}>{p ? `${p.FirstName} ${p.LastName[0]}.` : '?'}</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                        {dartLabels ? dartLabels.join(' ') : `${t.DartsThrown}d`}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>
                        {details?.bust ? <span style={{ color: 'var(--color-danger)' }}>BUST</span> : t.Score}
                        {t.IsDoubleIn && <span style={{ color: 'var(--color-success)', fontSize: '0.7rem' }}> IN</span>}
                        {t.IsGameOut && <span style={{ color: 'var(--color-secondary)', fontSize: '0.7rem' }}> OUT</span>}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{t.RemainingScore}</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>{runningAvg}</td>
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
