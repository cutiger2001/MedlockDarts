import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Game, Match, GamePlayer, CricketTurn, CricketState } from '../../types';
import { gameService } from '../../services/gameService';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { PlayerAvatar } from '../common/PlayerAvatar';
import {
  announceNowThrowing, announceMarks, announceAllStar,
  announceCricketGameOut,
} from '../../utils/announcer';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CricketScoreboardProps {
  game: Game;
  match: Match;
  players: GamePlayer[];
  cricketTurns: CricketTurn[];
  isCorkPending?: boolean;
  onAddCricketTurn: (turn: Partial<CricketTurn>) => Promise<void>;
  onUndoCricketTurn: () => Promise<void>;
  onEndGame: (winnerTeamSeasonId: number) => Promise<void>;
  onMovePlayer: (playerId: number, direction: -1 | 1) => void | Promise<void>;
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
const MAX_MARKS_PER_SEGMENT: Record<string, number> = {
  Bull: 6,
  '20': 9,
  '19': 9,
  '18': 9,
  '17': 9,
  '16': 9,
  '15': 9,
};
const MAX_SEGMENTS_PER_TURN = 3;  // only 3 darts, so at most 3 different segments

function getSegmentDartCapacity(segment: string): number {
  return segment === 'Bull' ? 2 : 3;
}

function isPossibleCricketMarkState(marks: Record<string, number>): boolean {
  const activeSegments = Object.entries(marks).filter(([, value]) => value > 0);
  if (activeSegments.length > MAX_SEGMENTS_PER_TURN) return false;

  let minimumDartsNeeded = 0;
  for (const [segment, value] of activeSegments) {
    const cap = getSegmentDartCapacity(segment);
    if (value > (MAX_MARKS_PER_SEGMENT[segment] || 9)) return false;
    minimumDartsNeeded += Math.ceil(value / cap);
  }

  return minimumDartsNeeded <= 3;
}

/* ------------------------------------------------------------------ */
/*  Mark Display Helper                                                */
/* ------------------------------------------------------------------ */

function renderMarks(count: number): React.ReactNode {
  // width/height must be in style (not as SVG attributes) so Safari/WebKit respects the values
  // Increased size by ~20% total (45→50→55px) and keep SVG centered inside a fixed container
  const svgStyle: React.CSSProperties = { display: 'block', margin: '0 auto', width: '55px', height: '55px' };
  const svgProps = { viewBox: '0 0 40 40', style: svgStyle };
  const stroke = { stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round' as const, fill: 'none' };

  if (count === 0) return <span style={{ opacity: 0.2 }}>·</span>;
  if (count === 1) return (
    <svg {...svgProps}>
      <line {...stroke} x1="11" y1="34" x2="29" y2="6" />
    </svg>
  );
  if (count === 2) return (
    <svg {...svgProps}>
      <line {...stroke} x1="10" y1="6" x2="30" y2="34" />
      <line {...stroke} x1="30" y1="6" x2="10" y2="34" />
    </svg>
  );
  if (count >= 3) return (
    <svg {...svgProps}>
      <circle {...stroke} cx="20" cy="20" r="16" />
      <line {...stroke} x1="13" y1="13" x2="27" y2="27" />
      <line {...stroke} x1="27" y1="13" x2="13" y2="27" />
    </svg>
  );
  return null;
}

/* ------------------------------------------------------------------ */
/*  All-Star Detection                                                 */
/* ------------------------------------------------------------------ */

function getCricketAllStarLevel(turnMarks: Record<string, number>): AllStarLevel {
  const totalMarks = Object.values(turnMarks).reduce((sum, value) => sum + value, 0);
  const bullMarks = turnMarks.Bull || 0;
  const activeSegments = Object.entries(turnMarks).filter(([, value]) => value > 0);
  if (activeSegments.length === 1 && activeSegments[0][0] === 'Bull') {
    if (bullMarks === 6) return 'triple';
    if (bullMarks >= 3) return 'allstar';
    return null;
  }
  if (totalMarks >= 9) return 'triple';
  if (totalMarks >= 7) return 'double';
  if (totalMarks >= 5) return 'allstar';
  return null;
}

function getAllStarCount(level: AllStarLevel): number {
  if (level === 'triple') return 3;
  if (level === 'double') return 2;
  if (level === 'allstar') return 1;
  return 0;
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

export function CricketScoreboard({ game, match, players, cricketTurns, isCorkPending = false, onAddCricketTurn, onUndoCricketTurn, onEndGame, onMovePlayer }: CricketScoreboardProps) {
  const [cricketState, setCricketState] = useState<CricketState[]>([]);
  // Tap-based: marks per segment for current turn
  const [turnMarks, setTurnMarks] = useState<Record<string, number>>({});
  const [allStarAnim, setAllStarAnim] = useState<{ level: AllStarLevel; playerName: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showPlayOrder, setShowPlayOrder] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [malortAnim, setMalortAnim] = useState<{ playerName: string } | null>(null);

  const handleMalort = () => {
    const name = currentPlayer ? `${currentPlayer.FirstName} ${currentPlayer.LastName}` : 'Current Player';
    setMalortAnim({ playerName: name });
    setTimeout(() => setMalortAnim(null), 3500);
  };

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

  const disabled = game.Status === 'Completed' || isCorkPending;
  const canAdjustOrder = !disabled && cricketTurns.length === 0;

  /* --- Audio: announce "Now Throwing" on player change --- */
  const prevCricketTurnCount = useRef(cricketTurns.length);
  const hasAnnouncedFirstCricket = useRef(false);
  useEffect(() => {
    if (disabled || !currentPlayer) return;
    const name = `${currentPlayer.FirstName} ${currentPlayer.LastName}`;
    if (!hasAnnouncedFirstCricket.current && cricketTurns.length === 0) {
      const t = setTimeout(() => announceNowThrowing(name), 600);
      hasAnnouncedFirstCricket.current = true;
      return () => clearTimeout(t);
    }
    if (cricketTurns.length > prevCricketTurnCount.current) {
      const t = setTimeout(() => announceNowThrowing(name), 2200);
      prevCricketTurnCount.current = cricketTurns.length;
      return () => clearTimeout(t);
    }
    prevCricketTurnCount.current = cricketTurns.length;
  }, [cricketTurns.length, currentPlayer, disabled]);

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

  /* --- Number of distinct segments tapped this turn --- */
  const segmentsUsed = useMemo(() => {
    return Object.keys(turnMarks).filter(k => (turnMarks[k] || 0) > 0).length;
  }, [turnMarks]);

  /* --- Max taps allowed for a segment (limited by 3-dart rules) --- */
  const getMaxTapsForSeg = useCallback((seg: string): number => {
    if (!currentPlayer) return 0;
    const teamState = cricketState.find(s => s.TeamSeasonID === currentPlayer.TeamSeasonID);
    const opponentState = cricketState.find(s => s.TeamSeasonID !== currentPlayer.TeamSeasonID);
    const key = SEGMENT_KEYS[seg];
    if (!key) return 0;
    const myMarks = teamState ? (teamState[key] as number) : 0;
    const oppMarks = opponentState ? (opponentState[key] as number) : 0;
    const currentTaps = turnMarks[seg] || 0;

    const segmentLimit = MAX_MARKS_PER_SEGMENT[seg] || 9;
    let allowed = 0;
    while (currentTaps + allowed < segmentLimit && totalTaps + allowed < MAX_TAPS_PER_TURN) {
      const candidateValue = currentTaps + allowed + 1;
      if (oppMarks >= 3 && candidateValue > Math.max(0, 3 - myMarks)) break;
      const candidateMarks = { ...turnMarks, [seg]: candidateValue };
      if (!isPossibleCricketMarkState(candidateMarks)) break;
      allowed += 1;
    }
    return allowed;
  }, [currentPlayer, cricketState, turnMarks, totalTaps, segmentsUsed]);

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

  /* --- Add N marks to a segment (D=2, T=3) --- */
  const handleTapN = useCallback((seg: string, n: number) => {
    const maxAllowed = getMaxTapsForSeg(seg);
    const actual = Math.min(n, maxAllowed);
    if (actual <= 0) return;
    setTurnMarks(prev => ({ ...prev, [seg]: (prev[seg] || 0) + actual }));
  }, [getMaxTapsForSeg]);

  /* --- Clear all marks for a segment --- */
  const handleClearSeg = useCallback((seg: string) => {
    setTurnMarks(prev => {
      const next = { ...prev };
      delete next[seg];
      return next;
    });
  }, [])

  /* --- Team colors for current player --- */
  const currentPlayerColor = currentPlayer?.ThemeColor || null;
  const currentTeamColor = currentPlayerColor
    || (currentPlayer?.TeamSeasonID === homeTeamId ? 'var(--color-primary)' : 'var(--color-secondary)');

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
    const level = getCricketAllStarLevel(turnMarks);
    if (level) {
      setAllStarAnim({ level, playerName: `${currentPlayer.FirstName} ${currentPlayer.LastName}` });
      setTimeout(() => setAllStarAnim(null), 2500);
    }

    // Audio announcements
    const playerFullName = `${currentPlayer.FirstName} ${currentPlayer.LastName}`;
    if (level) {
      announceAllStar(level, playerFullName);
    } else {
      announceMarks(totalMarks);
    }

    // Update cricket state on server
    const stateUpdate: Partial<CricketState> = {};
    for (const seg of CRICKET_SEGMENTS) {
      const added = turnMarks[seg] || 0;
      if (added === 0) continue;
      const key = SEGMENT_KEYS[seg];
      if (!key) continue;
      const baseMarks = teamState ? (teamState[key] as number) : 0;
      (stateUpdate as any)[key] = Math.min(baseMarks + added, MAX_MARKS_PER_SEGMENT[seg] || 9);
    }
    if (totalPoints > 0) {
      stateUpdate.Points = (teamState?.Points || 0) + totalPoints;
    }

    if (Object.keys(stateUpdate).length > 0) {
      await gameService.updateCricketState(game.GameID, currentPlayer.TeamSeasonID, stateUpdate);
    }

    // Check win condition
    const updatedTeamState = { ...teamState } as any;
    for (const seg of CRICKET_SEGMENTS) {
      const added = turnMarks[seg] || 0;
      if (added === 0) continue;
      const key = SEGMENT_KEYS[seg];
      if (key) updatedTeamState[key] = Math.min((teamState?.[key] as number || 0) + added, MAX_MARKS_PER_SEGMENT[seg] || 9);
    }
    updatedTeamState.Points = (teamState?.Points || 0) + totalPoints;

    const allClosed = CRICKET_SEGMENTS.every(seg => {
      const key = SEGMENT_KEYS[seg];
      return key && (updatedTeamState[key] as number) >= 3;
    });
    const teamPoints = updatedTeamState.Points || 0;
    const oppPoints = opponentState?.Points || 0;
    const isClose = allClosed && teamPoints >= oppPoints;

    await onAddCricketTurn({
      PlayerID: currentPlayer.PlayerID,
      TeamSeasonID: currentPlayer.TeamSeasonID,
      TurnNumber: cricketTurns.length + 1,
      RoundNumber: currentRound,
      DartsThrown: 3,
      Points: totalPoints,
      MarksScored: totalMarks,
      IsCricketClose: isClose,
      ...segColumns,
      Details: JSON.stringify({ taps: turnMarks, allStarLevel: level, allStarCount: getAllStarCount(level), close: isClose }),
    } as Partial<CricketTurn>);

    setTurnMarks({});

    if (isClose) {
      const teamName = currentPlayer.TeamSeasonID === homeTeamId ? (match.HomeTeamName || 'Home') : (match.AwayTeamName || 'Away');
      announceCricketGameOut(teamName);
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

  const isHomeActive = !disabled && currentPlayer?.TeamSeasonID === homeTeamId;
  const isAwayActive = !disabled && currentPlayer?.TeamSeasonID === awayTeamId;

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

      {/* ===== Score Header + Now Throwing (unified rounded container) ===== */}
      <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 'var(--spacing-xs)' }}>
        {/* Scores side-by-side */}
        <div style={{ display: 'flex' }}>
        <div style={{
          flex: 1, padding: '8px 4px', textAlign: 'center',
          backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
          height: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.85, fontWeight: 600, marginBottom: 2 }}>{match.HomeTeamName}</div>
          <div style={{ fontSize: '7rem', fontWeight: 900, lineHeight: 1 }}>
            {(homeState?.Points || 0) + (currentPlayer?.TeamSeasonID === homeTeamId ? turnPreview.totalPoints : 0)}
          </div>
        </div>
        <div style={{
          flex: 1, padding: '8px 4px', textAlign: 'center',
          backgroundColor: 'var(--color-secondary)', color: 'var(--color-text-on-secondary)',
          height: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.85, fontWeight: 600, marginBottom: 2 }}>{match.AwayTeamName}</div>
          <div style={{ fontSize: '7rem', fontWeight: 900, lineHeight: 1 }}>
            {(awayState?.Points || 0) + (currentPlayer?.TeamSeasonID === awayTeamId ? turnPreview.totalPoints : 0)}
          </div>
        </div>
        </div>

        {/* ===== Now Throwing (below scores, inside same rounded container) ===== */}
        {currentPlayer && !disabled && (() => {
          const fullName = `${currentPlayer.FirstName} ${currentPlayer.LastName}`;
          const nameLen = fullName.length;
          const nameFontSize = nameLen <= 10 ? '2.6rem' : nameLen <= 14 ? '2.2rem' : nameLen <= 18 ? '1.9rem' : '1.6rem';
          const mprFontSize = nameLen <= 10 ? '1.3rem' : nameLen <= 14 ? '1.1rem' : '1rem';
          return (
            <div style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              borderTop: `3px solid ${currentTeamColor}`,
              backgroundColor: currentPlayer.TeamSeasonID === homeTeamId ? 'var(--color-primary)' : 'var(--color-secondary)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
                <PlayerAvatar imageData={currentPlayer.ImageData} name={fullName} size={42} themeColor={currentPlayer.ThemeColor} style={{ flexShrink: 0, marginRight: 16 }} />
                <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'nowrap', overflow: 'hidden' }}>
                  <span style={{ fontSize: nameFontSize, fontWeight: 900, color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {fullName}
                  </span>
                  <span style={{ fontSize: mprFontSize, fontWeight: 600, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', marginLeft: 14 }}>
                    {getPlayerMPR(currentPlayer.PlayerID).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ===== Cricket Board (Home marks | − D # T ✕ | Away marks) ===== */}
      <Card style={{ marginBottom: 'var(--spacing-md)', padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {CRICKET_SEGMENTS.map(seg => {
              const hm = getMarks(homeState, seg);
              const am = getMarks(awayState, seg);
              const bothClosed = isBothClosed(seg);
              const tapCount = turnMarks[seg] || 0;
              const maxTaps = !disabled ? getMaxTapsForSeg(seg) : 0;
              const canTap = !disabled && !bothClosed && maxTaps > 0;
              const isCurrentTeamHome = currentPlayer?.TeamSeasonID === homeTeamId;
              const liveHomeMarks = isCurrentTeamHome ? Math.min(hm + tapCount, 9) : hm;
              const liveAwayMarks = !isCurrentTeamHome ? Math.min(am + tapCount, 9) : am;

              const hotBtnStyle: React.CSSProperties = {
                minWidth: 57, minHeight: 57, fontWeight: 800, fontSize: '1.38rem',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                userSelect: 'none', WebkitUserSelect: 'none' as any,
              };
              const adjBtnStyle: React.CSSProperties = {
                width: 44, height: 57, borderRadius: 'var(--radius-sm)',
                border: 'none', fontWeight: 900, fontSize: '1.43rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              };

              return (
                <tr key={seg} style={{
                  borderBottom: '1px solid var(--color-border)',
                  opacity: bothClosed ? 0.3 : 1,
                  backgroundColor: bothClosed ? 'var(--color-surface-hover)' : undefined,
                  minHeight: 100,
                }}>
                  {/* Home marks */}
                  <td style={{ padding: '6px 4px', textAlign: 'center', verticalAlign: 'middle', width: '25%' }}>
                    <div style={{ width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                      {renderMarks(isCurrentTeamHome ? liveHomeMarks : hm)}
                    </div>
                  </td>

                  {/* Center: − | D | # | T | ✕ */}
                  <td style={{ padding: '6px 4px', textAlign: 'center', verticalAlign: 'middle', width: '50%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                      {/* − button (only when tapped) */}
                      <button onClick={() => tapCount > 0 && handleUntap(seg)} style={{
                        ...adjBtnStyle,
                        backgroundColor: tapCount > 0 ? 'var(--color-danger)' : 'transparent',
                        color: tapCount > 0 ? '#fff' : 'transparent',
                        border: tapCount > 0 ? 'none' : '1px solid transparent',
                        cursor: tapCount > 0 ? 'pointer' : 'default',
                      }}>−</button>

                      {/* D = 2 marks */}
                      <button onClick={() => canTap && handleTapN(seg, 2)} style={{
                        ...hotBtnStyle,
                        backgroundColor: canTap ? 'var(--color-surface)' : 'transparent',
                        color: canTap ? 'var(--color-primary)' : 'var(--color-text-light)',
                        cursor: canTap ? 'pointer' : 'default',
                        opacity: canTap ? 1 : 0.35,
                        border: canTap ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                      }}>D</button>

                      {/* Single tap — number */}
                      <button onClick={() => canTap && handleTap(seg)} style={{
                        ...hotBtnStyle,
                        minWidth: 75, height: 57, overflow: 'hidden', fontSize: 'clamp(1.54rem, 5vw, 2.42rem)',
                        border: `2px solid ${canTap ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        backgroundColor: tapCount > 0 ? 'var(--color-primary)' : 'var(--color-surface)',
                        color: tapCount > 0 ? '#fff' : (canTap ? 'var(--color-primary)' : 'var(--color-text-light)'),
                        cursor: canTap ? 'pointer' : 'default',
                        flexDirection: 'column', gap: 0,
                      }}>
                        <span>{seg}</span>
                        {tapCount > 0 && <span style={{ fontSize: '0.5em', lineHeight: 1.2, opacity: 0.9 }}>+{tapCount}</span>}
                      </button>

                      {/* T = 3 marks */}
                      <button onClick={() => canTap && seg !== 'Bull' && handleTapN(seg, 3)} style={{
                        ...hotBtnStyle,
                        backgroundColor: (canTap && seg !== 'Bull') ? 'var(--color-surface)' : 'transparent',
                        color: (canTap && seg !== 'Bull') ? 'var(--color-secondary)' : 'var(--color-text-light)',
                        cursor: (canTap && seg !== 'Bull') ? 'pointer' : 'default',
                        opacity: (canTap && seg !== 'Bull') ? 1 : 0.35,
                        border: (canTap && seg !== 'Bull') ? '1px solid var(--color-secondary)' : '1px solid var(--color-border)',
                      }}>T</button>

                      {/* ✕ button (only when tapped) */}
                      <button onClick={() => tapCount > 0 && handleClearSeg(seg)} style={{
                        ...adjBtnStyle,
                        backgroundColor: tapCount > 0 ? 'var(--color-danger)' : 'transparent',
                        color: tapCount > 0 ? '#fff' : 'transparent',
                        border: tapCount > 0 ? 'none' : '1px solid transparent',
                        cursor: tapCount > 0 ? 'pointer' : 'default',
                        fontSize: '1.1rem',
                      }}>✕</button>
                    </div>
                  </td>

                  {/* Away marks */}
                  <td style={{ padding: '6px 4px', textAlign: 'center', verticalAlign: 'middle', width: '25%' }}>
                    <div style={{ width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                      {renderMarks(!isCurrentTeamHome ? liveAwayMarks : am)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ===== Complete Turn / Undo Buttons — sticky so always visible ===== */}
      {!disabled && (
        <div style={{
          position: 'sticky', bottom: 0, zIndex: 10,
          backgroundColor: 'var(--color-background)',
          paddingTop: 'var(--spacing-xs)', paddingBottom: 'var(--spacing-xs)',
          display: 'flex', gap: 'var(--spacing-sm)',
        }}>
          {(Object.values(turnMarks).some(v => v > 0) || cricketTurns.length > 0) && (
            <Button variant="ghost" onClick={handleUndo} style={{ flex: '0 0 auto' }}>
              ↩️ {Object.values(turnMarks).some(v => v > 0) ? 'Clear' : 'Undo Turn'}
            </Button>
          )}
          <Button
            onClick={handleMalort}
            style={{ flex: '0 0 auto', minHeight: 64, fontWeight: 900,
              background: '#1a0000', color: '#FF3333', border: '2px solid #FF3333',
              textShadow: '0 0 6px #FF0000', boxShadow: '0 0 8px rgba(255,0,0,0.4)' }}
          >
            🥃 Malört
          </Button>
          <Button
            onClick={completeTurn}
            style={{ flex: 1, minHeight: 64, fontSize: '1.1rem', fontWeight: 700, backgroundColor: 'var(--color-success)', color: '#fff' }}
          >
            Complete Turn {totalTaps > 0 ? `(${turnPreview.totalMarks} marks)` : '(No Score)'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setShowOrderModal(true)}
            disabled={!canAdjustOrder}
            title={canAdjustOrder ? 'Adjust play order' : 'Play order can only be adjusted before any score is entered'}
            style={{ flex: '0 0 auto' }}
          >
            Adjust Play Order
          </Button>
        </div>
      )}

      {/* ===== Turn History (collapsed by default to save screen space) ===== */}
      {cricketTurns.length > 0 && (
        <div style={{ marginTop: 'var(--spacing-xs)' }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{
              width: '100%', padding: '6px', background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-light)', fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            {showHistory ? '▲ Hide Turn History' : `▼ Turn History (${cricketTurns.length} turns)`}
          </button>
          {showHistory && (
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
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>
                        {t.MarksScored || 0}
                        {t.IsCricketClose && <span style={{ marginLeft: 6, color: 'var(--color-success)', fontSize: '0.75rem' }}>CL</span>}
                      </td>
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
        </div>
      )}

      <div style={{ marginTop: 'var(--spacing-xs)' }}>
        <button
          onClick={() => setShowPlayOrder(v => !v)}
          style={{
            width: '100%', padding: '6px', background: 'var(--color-surface)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-light)', fontSize: '0.8rem', cursor: 'pointer',
          }}
        >
          {showPlayOrder ? '▲ Hide Play Order' : `▼ Play Order (${players.length} players)`}
        </button>
        {showPlayOrder && (
          <Card title="Play Order" style={{ marginTop: 'var(--spacing-sm)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {players.map((player, index) => (
                <div
                  key={player.PlayerID}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <span style={{ fontSize: '0.9rem' }}>{index + 1}. {player.FirstName} {player.LastName}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                    {player.TeamSeasonID === homeTeamId ? match.HomeTeamName : match.AwayTeamName}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Modal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        title="Adjust Play Order"
        footer={(
          <Button onClick={() => setShowOrderModal(false)}>Done</Button>
        )}
      >
        {!canAdjustOrder ? (
          <p style={{ color: 'var(--color-text-light)' }}>
            Play order can only be adjusted before any score is entered.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {players.map((player, index) => (
              <div
                key={player.PlayerID}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--spacing-sm)',
                  padding: '8px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{index + 1}. {player.FirstName} {player.LastName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                    {player.TeamSeasonID === homeTeamId ? match.HomeTeamName : match.AwayTeamName}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button size="sm" variant="ghost" onClick={() => onMovePlayer(player.PlayerID, -1)} disabled={index === 0}>↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => onMovePlayer(player.PlayerID, 1)} disabled={index === players.length - 1}>↓</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

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
