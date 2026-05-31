import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Game, Match, GamePlayer, Turn } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { PlayerAvatar } from '../common/PlayerAvatar';
import { useSettings } from '../../contexts/SettingsContext';
import { getCheckout } from '../../data/checkoutChart';
import {
  announceNowThrowing, announceRequires, announceX01Score, announceAllStar,
  announceBust, announceGameOut,
} from '../../utils/announcer';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { parseVoiceScore } from '../../utils/voiceScoreParser';

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

const SINGLE_DART_SCORES = (() => {
  const scores = new Set<number>([0, 25, 50]);
  for (const segment of SEGMENTS) {
    scores.add(segment);
    scores.add(segment * 2);
    scores.add(segment * 3);
  }
  return [...scores];
})();

const DOUBLE_DART_SCORES = (() => {
  const scores = new Set<number>([50]);
  for (const segment of SEGMENTS) {
    scores.add(segment * 2);
  }
  return [...scores];
})();

function buildPossibleScoresWithAtLeastOneDouble(): Set<number> {
  const possible = new Set<number>();
  for (const first of SINGLE_DART_SCORES) {
    for (const second of SINGLE_DART_SCORES) {
      for (const third of DOUBLE_DART_SCORES) {
        possible.add(first + second + third);
      }
    }
  }
  return possible;
}

function buildPossibleCheckoutScores(): Set<number> {
  const possible = new Set<number>();
  for (const first of SINGLE_DART_SCORES) {
    for (const second of SINGLE_DART_SCORES) {
      for (const third of DOUBLE_DART_SCORES) {
        possible.add(first + second + third);
        possible.add(first + third);
        possible.add(third);
      }
    }
  }
  return possible;
}

const POSSIBLE_DOUBLE_START_SCORES = buildPossibleScoresWithAtLeastOneDouble();
const POSSIBLE_CHECKOUT_SCORES = buildPossibleCheckoutScores();

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
  const defaultMode = settings.x01ScoringMode;

  // Local scoring mode override (allows in-game toggle + auto-switch)
  const [modeOverride, setModeOverride] = useState<'dart' | 'turn' | null>(null);
  const scoringMode = modeOverride ?? defaultMode;

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
  // Malört penalty animation
  const [malortAnim, setMalortAnim] = useState<{ playerName: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const handleVoiceResult = useCallback((transcript: string) => {
    const score = parseVoiceScore(transcript);
    if (score === null) {
      setVoiceError(`Didn't catch "${transcript}" — try again`);
      setTimeout(() => setVoiceError(null), 3000);
      return;
    }
    setVoiceError(null);
    // Auto-switch to turn mode so the score populates the numpad display
    if (scoringMode !== 'turn') {
      setModeOverride('turn');
      setCurrentDarts([]);
    }
    setTurnInput(String(score));
  }, [scoringMode]);

  const { state: voiceState, isSupported: voiceSupported, start: voiceStart, stop: voiceStop } = useVoiceInput({
    onResult: handleVoiceResult,
    onError: (err) => {
      setVoiceError(`Mic error: ${err}`);
      setTimeout(() => setVoiceError(null), 3000);
    },
  });

  const handleMalort = () => {
    const name = currentPlayer ? `${currentPlayer.FirstName} ${currentPlayer.LastName}` : 'Current Player';
    setMalortAnim({ playerName: name });
    setTimeout(() => setMalortAnim(null), 3500);
  };

  const target = game.X01Target || 501;
  const doubleInRequired = game.DoubleInRequired;

  /* --- Team grouping --- */
  const homeTeamId = match.HomeTeamSeasonID;
  const awayTeamId = match.AwayTeamSeasonID;
  const isSoloPlay = homeTeamId === awayTeamId;
  const homePlayers = players.filter(p => p.TeamSeasonID === homeTeamId);
  const awayPlayers = isSoloPlay ? [] : players.filter(p => p.TeamSeasonID === awayTeamId);

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

  /* --- Team average (combined PPD * 3 for all players on a team) --- */
  const getTeamAverage = (teamPlayers: GamePlayer[]) => {
    let totalDarts = 0;
    let totalScore = 0;
    for (const p of teamPlayers) {
      const s = playerStats[p.PlayerID];
      if (s) { totalDarts += s.dartsThrown; totalScore += s.totalScore; }
    }
    return totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;
  };

  /* --- Short team label: combined first names (e.g. "John & Mike") --- */
  const getShortTeamLabel = (teamPlayers: GamePlayer[]) =>
    teamPlayers.map(p => p.FirstName).join(' & ');

  const currentTeamScore = currentPlayer ? teamScores[currentPlayer.TeamSeasonID] : null;
  const turnScoreSoFar = currentDarts.reduce((s, d) => s + d.score, 0);
  const liveRemaining = currentTeamScore ? currentTeamScore.remaining - getEffectiveTurnScore(currentDarts, doubleInRequired, currentTeamScore.hasDoubledIn) : target;

  // isSingleDartOut is used to show a hint badge near the mode toggle
  const isSingleDartOut = currentTeamScore
    ? currentTeamScore.remaining > 0 && currentTeamScore.remaining <= 40 && currentTeamScore.remaining % 2 === 0
    : false;

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
    const allStarLevel = (!isBust && effectiveScore > 0)
      ? getX01AllStarLevel(effectiveScore, isDoubleIn, isGameOut) : null;
    if (allStarLevel) {
      setAllStarAnim({ level: allStarLevel, playerName: `${currentPlayer.FirstName} ${currentPlayer.LastName}` });
      setTimeout(() => setAllStarAnim(null), 2500);
    }

    // Audio announcements
    const playerFullName = `${currentPlayer.FirstName} ${currentPlayer.LastName}`;
    if (isBust) {
      announceBust();
    } else if (allStarLevel) {
      announceAllStar(allStarLevel, playerFullName);
    } else if (isGameOut) {
      announceGameOut(playerFullName);
    } else {
      announceX01Score(effectiveScore);
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
      Details: JSON.stringify({ darts, bust: isBust, allStarLevel, allStarCount: allStarLevel ? 1 : 0 }),
    });

    setCurrentDarts([]);
    setSelectedSegment(null);
    setPreSelectMultiplier(null);

    if (isGameOut) {
      await onEndGame(currentPlayer.TeamSeasonID);
    }
  };

  /* --- Turn mode: submit turn total --- */
  const submitTurnScore = async (score: number, dartsOverride?: number, forceBust = false) => {
    if (!currentPlayer) return;
    setBustMessage('');
    const startingRemaining = currentTeamScore?.remaining || target;
    const remaining = startingRemaining - score;
    const requiresDoubleStart = doubleInRequired && !currentTeamScore?.hasDoubledIn && score > 0;
    const isCheckoutAttempt = score === startingRemaining;

    // Validate
    if (score < 0 || score > 180) {
      setBustMessage('Invalid score (0-180)');
      return;
    }
    if (!forceBust && isCheckoutAttempt && !POSSIBLE_CHECKOUT_SCORES.has(score)) {
      setBustMessage('Impossible checkout score for double-out');
      return;
    }
    if (!forceBust && requiresDoubleStart && !POSSIBLE_DOUBLE_START_SCORES.has(score)) {
      setBustMessage('Impossible score while double-in is required');
      return;
    }
    const isBust = forceBust || remaining < 0 || remaining === 1;

    // If remaining = 0, this is a game-out — ask how many darts were thrown
    if (!isBust && remaining === 0 && dartsOverride === undefined) {
      setDartsPromptScore(score);
      return;
    }

    const dartsThrown = dartsOverride || 3;
    const effectiveScore = isBust ? 0 : score;
    const effectiveRemaining = isBust ? startingRemaining : remaining;
    const isGameOut = !isBust && remaining === 0;

    // Auto double-in: if team hasn't doubled in and player scores > 0, assume they doubled in
    const isDoubleIn = !isBust && doubleInRequired && !currentTeamScore?.hasDoubledIn && score > 0;

    // All-Star check
    const allStarLevel = effectiveScore > 0 ? getX01AllStarLevel(effectiveScore, isDoubleIn, isGameOut) : null;
    if (allStarLevel) {
      setAllStarAnim({ level: allStarLevel, playerName: `${currentPlayer.FirstName} ${currentPlayer.LastName}` });
      setTimeout(() => setAllStarAnim(null), 2500);
    }

    // Audio announcements
    const playerFullName = `${currentPlayer.FirstName} ${currentPlayer.LastName}`;
    if (isBust) {
      announceBust();
    } else if (allStarLevel) {
      announceAllStar(allStarLevel, playerFullName);
    } else if (isGameOut) {
      announceGameOut(playerFullName);
    } else {
      announceX01Score(effectiveScore);
    }

    await onAddTurn({
      PlayerID: currentPlayer.PlayerID,
      TeamSeasonID: currentPlayer.TeamSeasonID,
      TurnNumber: turns.length + 1,
      RoundNumber: currentRound,
      DartsThrown: dartsThrown,
      Score: effectiveScore,
      RemainingScore: effectiveRemaining,
      IsDoubleIn: isDoubleIn,
      IsGameOut: isGameOut,
      Details: JSON.stringify({ allStarLevel, allStarCount: allStarLevel ? 1 : 0, bust: isBust, attemptedScore: score }),
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

  /* --- Handle segment tap with pre-select support --- */
  const handleSegmentTap = useCallback((seg: number | 'BULL') => {
    setBustMessage('');
    // Determine multiplier: use pre-select if set, otherwise default to single (1)
    const mult = preSelectMultiplier !== null
      ? (seg === 'BULL' && preSelectMultiplier === 3 ? 2 : preSelectMultiplier) // Bull can't be triple, treat as double
      : 1; // No pre-select = single

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
    // Don't clear preSelectMultiplier — keep it active for consecutive throws
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

  /* --- Audio: announce "Now Throwing" on player change --- */
  const prevTurnCount = useRef(turns.length);
  const hasAnnouncedFirst = useRef(false);
  useEffect(() => {
    if (disabled || !currentPlayer) return;
    const name = `${currentPlayer.FirstName} ${currentPlayer.LastName}`;
    const remaining = teamScores[currentPlayer.TeamSeasonID]?.remaining ?? target;
    const isCheckout = remaining <= 170 && remaining > 0;
    const announce = () => isCheckout ? announceRequires(name, remaining) : announceNowThrowing(name);
    if (!hasAnnouncedFirst.current && turns.length === 0) {
      // Announce first player on game start (slight delay for page load)
      const t = setTimeout(announce, 600);
      hasAnnouncedFirst.current = true;
      return () => clearTimeout(t);
    }
    if (turns.length > prevTurnCount.current) {
      // A turn was just submitted — announce next player after score readout
      const t = setTimeout(announce, 2200);
      prevTurnCount.current = turns.length;
      return () => clearTimeout(t);
    }
    prevTurnCount.current = turns.length;
  }, [turns.length, currentPlayer, disabled, teamScores]);

  /* --- Team color for current player --- */
  const currentPlayerColor = currentPlayer?.ThemeColor || null;
  const currentTeamColor = currentPlayerColor
    || (currentPlayer?.TeamSeasonID === homeTeamId ? 'var(--color-primary)' : 'var(--color-secondary)');
  const currentTeamTextColor = currentPlayerColor
    ? '#fff'
    : (currentPlayer?.TeamSeasonID === homeTeamId ? 'var(--color-text-on-primary)' : 'var(--color-text-on-secondary)');

  return (
    <div style={{ width: '100%', margin: '0 auto' }}>
      {/* ===== Malört Penalty Animation Overlay ===== */}
      {malortAnim && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 10000,
          animation: 'fadeInOut 3.5s ease-in-out',
        }}>
          <div style={{ textAlign: 'center', padding: '0 var(--spacing-md)' }}>
            <div style={{
              fontFamily: 'Impact, "Arial Black", sans-serif',
              fontSize: '5.5rem', fontWeight: 900, letterSpacing: '0.08em',
              color: '#FF1A1A',
              textShadow: '0 0 7px #FF1A1A, 0 0 14px #FF1A1A, 0 0 28px #FF0000, 0 0 56px #FF0000, 0 0 100px #FF0000',
              animation: 'neonFlicker 3.5s ease-in-out',
              lineHeight: 1,
            }}>MALÖRT</div>
            <div style={{
              fontSize: '2rem', fontWeight: 900, color: '#FFD700', marginTop: '0.75rem',
              textShadow: '0 0 10px rgba(255,215,0,0.8)',
              letterSpacing: '0.05em',
            }}>PENALTY SHOT!</div>
            <div style={{ color: '#fff', fontSize: '1.4rem', marginTop: '0.5rem', opacity: 0.9 }}>
              {malortAnim.playerName}
            </div>
          </div>
        </div>
      )}

      {/* ===== All-Star Animation Overlay ===== */}
      {allStarAnim && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999,
          animation: 'fadeInOut 2.5s ease-in-out',
        }}>
          <div style={{ textAlign: 'center', padding: '0 var(--spacing-md)', maxWidth: '100%' }}>
            <div style={{
              fontSize: 'clamp(1.5rem, 6vw, 2.5rem)', fontWeight: 900,
              color: ALL_STAR_COLORS[allStarAnim.level!] || '#FFD700',
              textShadow: '0 0 20px rgba(255,215,0,0.8)',
              animation: 'pulse 0.5s ease-in-out infinite alternate',
              whiteSpace: 'nowrap',
            }}>
              {ALL_STAR_LABELS[allStarAnim.level!]}
            </div>
            <div style={{ color: '#fff', fontSize: '1.3rem', marginTop: 'var(--spacing-md)', whiteSpace: 'nowrap' }}>
              {allStarAnim.playerName}
            </div>
          </div>
        </div>
      )}

      {/* ===== Score Header ===== */}
      {isSoloPlay ? (
        /* Solo play: single centered score box */
        <div style={{ marginBottom: 'var(--spacing-lg)', textAlign: 'center' }}>
          <Card style={{
            textAlign: 'center', backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
            padding: 'var(--spacing-md)', maxWidth: 300, margin: '0 auto',
          }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, margin: 'var(--spacing-xs) 0' }}>
              {teamScores[homeTeamId]?.remaining ?? target}
            </div>
            {homePlayers.map(p => (
              <div key={p.PlayerID} style={{ padding: '2px 0' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{p.FirstName} {p.LastName}</span>
                <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                  Avg: {getPlayerAverage(p.PlayerID).toFixed(1)} | PPD: {getPlayerPPD(p.PlayerID).toFixed(2)}
                  {' | '}{playerStats[p.PlayerID]?.dartsThrown || 0}d
                </div>
              </div>
            ))}
          </Card>
          <div style={{ marginTop: 'var(--spacing-xs)' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-primary)' }}>{target}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Round {currentRound}</div>
          </div>
        </div>
      ) : (
        /* Team/1v1 play: two score boxes — full 50/50 split for maximum number size */
        <div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-xs)',
          }}>
          {/* Home team */}
          <div style={{
            textAlign: 'center', backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 4px 10px',
            height: 160,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.85, fontWeight: 600, marginBottom: 4, letterSpacing: '0.02em' }}>{match.HomeTeamName}</div>
            <div style={{ fontSize: '9rem', fontWeight: 900, lineHeight: 1 }}>
              {teamScores[homeTeamId]?.remaining ?? target}
            </div>
          </div>

          {/* Away team */}
          <div style={{
            textAlign: 'center', backgroundColor: 'var(--color-secondary)', color: 'var(--color-text-on-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 4px 10px',
            height: 160,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.85, fontWeight: 600, marginBottom: 4, letterSpacing: '0.02em' }}>{match.AwayTeamName}</div>
            <div style={{ fontSize: '9rem', fontWeight: 900, lineHeight: 1 }}>
              {teamScores[awayTeamId]?.remaining ?? target}
            </div>
          </div>
        </div>

        {/* Game info strip below scores */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>{target}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Round {currentRound}</span>
          {doubleInRequired && (
            <span style={{
              fontSize: '0.7rem', fontWeight: 700,
              padding: '2px 6px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-secondary)', color: 'var(--color-text-on-secondary)',
            }}>DOUBLE IN</span>
          )}
          <span style={{
            fontSize: '0.7rem', fontWeight: 700,
            padding: '2px 6px', borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
          }}>DOUBLE OUT</span>
        </div>
      </div>
      )}

      {/* ===== Now Throwing + Checkout (directly under scores, both modes) ===== */}
      {currentPlayer && !disabled && (() => {
        const remaining = teamScores[currentPlayer.TeamSeasonID]?.remaining ?? target;
        const checkout = remaining <= 170 ? getCheckout(remaining) : null;
        const bgColor = currentPlayer.TeamSeasonID === homeTeamId ? 'var(--color-primary)' : 'var(--color-secondary)';
        return (
          <Card style={{
            marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-lg) var(--spacing-md)',
            border: `3px solid ${currentTeamColor}`, backgroundColor: bgColor,
            minHeight: 90,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            {/* Now Throwing row — name shrinks when checkout is shown */}
            {(() => {
              const fullName = `${currentPlayer.FirstName} ${currentPlayer.LastName}`;
              const nameLen = fullName.length;
              const hasCheckout = !!checkout;
              const nameFontSize = hasCheckout
                ? (nameLen <= 14 ? '1.6rem' : '1.3rem')
                : (nameLen <= 10 ? '3.2rem' : nameLen <= 14 ? '2.8rem' : nameLen <= 18 ? '2.4rem' : '2rem');
              const avgFontSize = hasCheckout ? '1.1rem' : (nameLen <= 10 ? '1.6rem' : nameLen <= 14 ? '1.4rem' : '1.2rem');
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
                  <PlayerAvatar imageData={currentPlayer.ImageData} name={fullName} size={hasCheckout ? 44 : 64} themeColor={currentPlayer.ThemeColor} style={{ flexShrink: 0, marginRight: 20 }} />
                  <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ fontSize: nameFontSize, fontWeight: 900, color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' }}>
                      {fullName}
                    </span>
                    <span style={{ fontSize: avgFontSize, fontWeight: 600, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', marginLeft: 16 }}>
                      {getPlayerAverage(currentPlayer.PlayerID).toFixed(1)}
                    </span>
                    {doubleInRequired && !hasDoubledIn && (
                      <span style={{ fontSize: '1rem', color: 'var(--color-warning)', fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 12 }}>
                        Needs Double In
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* Checkout darts */}
            {checkout && (
              <div style={{ marginTop: 'var(--spacing-sm)', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--spacing-sm)' }}>
                  {checkout.map((dart, i) => (
                    <div key={i} style={{
                      minWidth: 72,
                      padding: '10px 16px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: dart.startsWith('D') ? 'rgba(255,255,255,0.3)' :
                        dart.startsWith('T') ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '2rem',
                      textAlign: 'center',
                      border: dart.startsWith('D') ? '2px solid rgba(255,255,255,0.7)' : '1px solid rgba(255,255,255,0.3)',
                      lineHeight: 1,
                    }}>
                      {dart}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })()}

      {/* ===== Scoring Mode Toggle (moved to bottom near undo) ===== */}

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

      {/* ===== Voice Error ===== */}
      {voiceError && (
        <div style={{
          padding: 'var(--spacing-sm) var(--spacing-md)',
          marginBottom: 'var(--spacing-md)',
          backgroundColor: 'var(--color-warning)',
          color: '#000',
          borderRadius: 'var(--radius-sm)',
          fontWeight: 700,
          textAlign: 'center',
          fontSize: '1rem',
        }}>
          {voiceError}
        </div>
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
                minWidth: 80, minHeight: 64, fontWeight: 700, fontSize: '1.1rem',
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
                minWidth: 80, minHeight: 64, fontWeight: 700, fontSize: '1.1rem',
                border: preSelectMultiplier === 3 ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
            >
              TREBLE
            </Button>
          </div>

          {/* Segment grid */}
          <div style={{ marginBottom: 'var(--spacing-sm)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 'var(--spacing-xs)', color: 'var(--color-text-light)' }}>
              {preSelectMultiplier === 2 ? 'Tap segment for DOUBLE' : preSelectMultiplier === 3 ? 'Tap segment for TREBLE' : 'Tap segment for SINGLE'}
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 'var(--spacing-xs)',
            }}>
              {SEGMENTS.map(seg => (
                <Button
                  key={seg}
                  size="lg"
                  variant="ghost"
                  onClick={() => handleSegmentTap(seg)}
                  style={{
                    fontSize: '1.2rem', fontWeight: 700, minHeight: 64,
                    border: '1px solid var(--color-border)',
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
                variant="ghost"
                onClick={() => handleSegmentTap('BULL')}
                style={{
                  fontSize: '1.2rem', fontWeight: 700, minHeight: 64,
                  border: '1px solid var(--color-border)',
                }}
              >
                BULL
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={handleMiss}
                style={{
                  fontSize: '1.2rem', fontWeight: 700, minHeight: 64,
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-danger)',
                }}
              >
                MISS
              </Button>
            </div>

            {/* Submit Score button for partial turns */}
            {currentDarts.length > 0 && (
              <Button
                size="lg"
                variant="primary"
                onClick={() => finishTurn(currentDarts, false)}
                style={{
                  width: '100%',
                  marginTop: 'var(--spacing-sm)',
                  minHeight: 64,
                  fontSize: '1.2rem',
                  fontWeight: 700,
                }}
              >
                Submit Score ({currentDarts.reduce((s, d) => s + d.score, 0)})
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ===== Turn Scoring Mode (Numpad) ===== */}
      {!disabled && scoringMode === 'turn' && (
        <>
          <Card style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-sm)' }}>
            {/* 3-column layout: left hot scores | numpad | right hot scores */}
            {(() => {
              const half = Math.ceil(settings.fastEntryScores.length / 2);
              const leftScores = settings.fastEntryScores.slice(0, half);
              const rightScores = settings.fastEntryScores.slice(half);
              const sideBtn: React.CSSProperties = {
                minHeight: 72, fontWeight: 800, fontSize: '1.1rem',
                border: '1px solid var(--color-border)',
                padding: '4px 2px', width: '100%',
              };
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px', gap: 'var(--spacing-xs)' }}>
                  {/* Left column: first half of hot scores */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                    {leftScores.map(s => (
                      <Button key={s} variant="ghost" onClick={() => submitTurnScore(s)} style={sideBtn}>{s}</Button>
                    ))}
                  </div>

                  {/* Center: numpad */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--spacing-xs)' }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                      <Button key={n} size="lg" variant="ghost" onClick={() => handleNumpad(String(n))}
                        style={{ minHeight: 72, fontSize: '1.8rem', fontWeight: 700, border: '1px solid var(--color-border)' }}>
                        {n}
                      </Button>
                    ))}
                    <Button size="lg" variant="ghost" onClick={() => handleNumpad('C')}
                      style={{ minHeight: 72, fontSize: '1.1rem', fontWeight: 700, border: '1px solid var(--color-border)', color: 'var(--color-danger)' }}>
                      CLR
                    </Button>
                    <Button size="lg" variant="ghost" onClick={() => handleNumpad('0')}
                      style={{ minHeight: 72, fontSize: '1.8rem', fontWeight: 700, border: '1px solid var(--color-border)' }}>
                      0
                    </Button>
                    <Button size="lg" variant="ghost" onClick={() => handleNumpad('BS')}
                      style={{ minHeight: 72, fontSize: '1.3rem', fontWeight: 700, border: '1px solid var(--color-border)' }}>
                      ⌫
                    </Button>
                  </div>

                  {/* Right column: second half of hot scores + BUST */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                    {rightScores.map(s => (
                      <Button key={s} variant="ghost" onClick={() => submitTurnScore(s)} style={sideBtn}>{s}</Button>
                    ))}
                    <Button variant="ghost"
                      onClick={() => submitTurnScore(Number(turnInput) || 0, undefined, true)}
                      style={{ ...sideBtn, border: '1px solid var(--color-danger)', color: 'var(--color-danger)' }}>
                      BUST
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* Submit button — large, shows score prominently */}
            <button
              onClick={() => submitTurnScore(Number(turnInput) || 0)}
              style={{
                width: '100%', marginTop: 'var(--spacing-sm)',
                minHeight: 104,
                background: 'var(--color-success)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 2,
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <span style={{ fontSize: '3.5rem', fontWeight: 900, lineHeight: 1 }}>{turnInput || '0'}</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, opacity: 0.9 }}>
                Submit Turn &nbsp;·&nbsp; Left: {(currentTeamScore?.remaining || target) - (Number(turnInput) || 0)}
              </span>
            </button>
          </Card>

          {/* ===== Darts Prompt (on game-out) — overlay ===== */}
          {dartsPromptScore !== null && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 9998,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 'var(--spacing-md)',
            }}>
              <div style={{
                maxWidth: 360, width: '100%',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '3px solid var(--color-success)',
                padding: 'var(--spacing-lg)',
                textAlign: 'center',
                boxShadow: 'var(--shadow-lg)',
              }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 'var(--spacing-sm)', color: 'var(--color-success)' }}>
                  🎯 Game Out! Score: {dartsPromptScore}
                </div>
                <div style={{ fontSize: '1rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-lg)' }}>
                  How many darts were thrown?
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'center' }}>
                  {[1, 2, 3].map(d => (
                    <Button
                      key={d}
                      size="lg"
                      variant="primary"
                      onClick={() => confirmDartsAndSubmit(d)}
                      style={{ minWidth: 80, minHeight: 64, fontSize: '1.5rem', fontWeight: 700 }}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  onClick={() => { setDartsPromptScore(null); setTurnInput(''); }}
                  style={{ marginTop: 'var(--spacing-md)' }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== Scoring Mode Toggle + Undo ===== */}
      {!disabled && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--spacing-lg)', gap: 'var(--spacing-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
          {(currentDarts.length > 0 || turns.length > 0) && (
            <Button variant="ghost" size="sm" onClick={handleUndo}>
              ↩️ {currentDarts.length > 0 && scoringMode === 'dart' ? 'Undo Last Dart' : 'Undo Last Turn'}
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleMalort}
            style={{ fontWeight: 900, background: '#1a0000', color: '#FF3333', border: '2px solid #FF3333', minWidth: 90,
              textShadow: '0 0 6px #FF0000', boxShadow: '0 0 8px rgba(255,0,0,0.4)' }}
          >
            🥃 Malört
          </Button>
          {voiceSupported && (
            <Button
              size="sm"
              onClick={voiceState === 'listening' ? voiceStop : voiceStart}
              style={{
                fontWeight: 700, minWidth: 90,
                background: voiceState === 'listening' ? '#8B0000'
                  : voiceState === 'processing' ? 'var(--color-success)' : undefined,
                color: (voiceState === 'listening' || voiceState === 'processing') ? '#fff' : undefined,
                border: voiceState === 'listening' ? '2px solid #FF4444' : undefined,
                animation: voiceState === 'listening' ? 'micPulse 1.2s ease-in-out infinite' : undefined,
              }}
            >
              {voiceState === 'listening' ? '🔴 Listening…'
                : voiceState === 'processing' ? '✓ Got it'
                : voiceState === 'error' ? '⚠️ Mic Error'
                : '🎤 Voice'}
            </Button>
          )}
          <Button
            variant={scoringMode === 'turn' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => { setModeOverride('turn'); setCurrentDarts([]); }}
            style={{ fontWeight: 700, minWidth: 90 }}
          >
            Turn Total
          </Button>
          <Button
            variant={scoringMode === 'dart' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => { setModeOverride('dart'); setTurnInput(''); }}
            style={{ fontWeight: 700, minWidth: 90 }}
          >
            3 Dart
          </Button>
          {isSingleDartOut && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 700 }}>
              ⚡ Single dart out!
            </span>
          )}
        </div>
      )}

      {/* ===== Turn History (collapsed by default) ===== */}
      {turns.length > 0 && (
        <div style={{ marginTop: 'var(--spacing-xs)' }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{
              width: '100%', padding: '6px', background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-light)', fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            {showHistory ? '▲ Hide Turn History' : `▼ Turn History (${turns.length} turns)`}
          </button>
          {showHistory && (
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
        </div>
      )}

      {/* All-Star + Malört animation keyframes */}
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
        @keyframes micPulse {
          0%   { box-shadow: 0 0 0 0 rgba(255,68,68,0.8); }
          70%  { box-shadow: 0 0 0 12px rgba(255,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,68,68,0); }
        }
        @keyframes neonFlicker {
          0%   { opacity: 0; }
          8%   { opacity: 1; }
          10%  { opacity: 0.4; }
          12%  { opacity: 1; }
          14%  { opacity: 0.6; }
          16%  { opacity: 1; }
          80%  { opacity: 1; }
          88%  { opacity: 0.7; }
          90%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
