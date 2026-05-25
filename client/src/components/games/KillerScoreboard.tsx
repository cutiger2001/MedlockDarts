import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Game, Match, GamePlayer, Turn } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import {
  announceNowThrowing,
  announceKiller,
  announceEliminated,
  announceKillerWinner,
} from '../../utils/announcer';

interface KillerScoreboardProps {
  game: Game;
  match: Match;
  players: GamePlayer[];
  turns: Turn[];
  onAddTurn: (turn: Partial<Turn>) => Promise<void>;
  onUndoTurn: () => Promise<void>;
  onEndGame: (winnerTeamSeasonId: number) => Promise<void>;
}



interface KillerPlayerState {
  playerId: number;
  targetNumber: number;
  lives: number;
  isEliminated: boolean;
}

// A pending hit: one mark on a player's number
interface PendingHit {
  action: 'add' | 'remove';
  targetPlayerId: number; // whose number was hit (self for 'add')
}

const MAX_DARTS = 3;
const MAX_HITS = 9; // 3 darts × triple

/** Check if a set of hits can be achieved with at most 3 darts (each dart scores 1–3) */
function isValidTurn(hits: PendingHit[]): boolean {
  if (hits.length === 0) return true;
  if (hits.length > MAX_HITS) return false;
  const perTarget = new Map<number, number>();
  for (const h of hits) {
    perTarget.set(h.targetPlayerId, (perTarget.get(h.targetPlayerId) || 0) + 1);
  }
  if (perTarget.size > MAX_DARTS) return false;
  let minDarts = 0;
  for (const count of perTarget.values()) {
    minDarts += Math.ceil(count / 3);
  }
  return minDarts <= MAX_DARTS;
}

export function KillerScoreboard({
  game, match, players, turns, onAddTurn, onUndoTurn, onEndGame,
}: KillerScoreboardProps) {
  const maxLives = game.KillerLives || 5;
  const disabled = game.Status === 'Completed';
  const [pendingHits, setPendingHits] = useState<PendingHit[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // ── Parse game options + reconstruct committed states ──
  const { firstRoundImmunity, committedStates, playersWhoHaveThrown } = useMemo(() => {
    // First pass: find firstRoundImmunity option
    let firstRoundImmunity = false;
    for (const t of turns) {
      try {
        const d = t.Details ? JSON.parse(t.Details) : null;
        if (!d) continue;
        if (d.action === 'game_options') { firstRoundImmunity = !!d.firstRoundImmunity; break; }
        if (Array.isArray(d.actions)) {
          const go = d.actions.find((a: { action: string }) => a.action === 'game_options');
          if (go) { firstRoundImmunity = !!(go as Record<string, unknown>).firstRoundImmunity; break; }
        }
      } catch { /* skip */ }
    }

    // Second pass: replay turns, tracking who has thrown
    const stateMap = new Map<number, KillerPlayerState>();
    for (const p of players) {
      stateMap.set(p.PlayerID, { playerId: p.PlayerID, targetNumber: 0, lives: 0, isEliminated: false });
    }
    const thrown = new Set<number>();

    const applyAction = (action: string, turnPlayerId: number, details: Record<string, unknown>) => {
      if (action === 'setup') {
        const ps = stateMap.get(turnPlayerId);
        if (ps) ps.targetNumber = details.targetNumber as number;
      } else if (action === 'add') {
        const ps = stateMap.get(turnPlayerId);
        if (ps) ps.lives = Math.min(maxLives, ps.lives + 1);
      } else if (action === 'remove') {
        const targetPs = stateMap.get(details.targetPlayerId as number);
        if (targetPs) {
          if (targetPs.lives <= 0) {
            const immune = firstRoundImmunity && !thrown.has(targetPs.playerId);
            if (!immune) targetPs.isEliminated = true;
          } else {
            targetPs.lives -= 1;
          }
        }
      }
      // 'miss' and 'game_options' need no state change
    };

    for (const t of turns) {
      try {
        const details = t.Details ? JSON.parse(t.Details) : null;
        if (!details) continue;
        if (Array.isArray(details.actions)) {
          // Mark as thrown if this is a real gameplay turn
          const isGameplay = details.actions.some(
            (a: { action: string }) => !['setup', 'game_options'].includes(a.action)
          );
          if (isGameplay) thrown.add(t.PlayerID);
          for (const a of details.actions) applyAction(a.action, t.PlayerID, a);
        } else if (details.action) {
          if (!['setup', 'game_options'].includes(details.action)) thrown.add(t.PlayerID);
          applyAction(details.action, t.PlayerID, details);
        }
      } catch { /* ignore malformed */ }
    }

    return {
      firstRoundImmunity,
      committedStates: players.map(p => stateMap.get(p.PlayerID)!).filter(Boolean),
      playersWhoHaveThrown: thrown,
    };
  }, [turns, players, maxLives]);

  const allTargetsAssigned = committedStates.length > 0 && committedStates.every(ps => ps.targetNumber > 0);

  const gameplayTurns = useMemo(() => turns.filter(t => {
    try {
      const d = JSON.parse(t.Details || '{}');
      if (d.action === 'setup' || d.action === 'game_options') return false;
      if (Array.isArray(d.actions) && d.actions.length === 1 &&
          ['setup', 'game_options'].includes(d.actions[0].action)) return false;
      return true;
    } catch { return true; }
  }), [turns]);

  const activeCommitted = committedStates.filter(ps => !ps.isEliminated);

  // Derive whose turn it is by looking at who threw last, then advancing
  // to the next non-eliminated player in the original order.
  // Simple modulo (length % active.length) breaks when eliminations change the list size.
  const currentPlayer = useMemo((): KillerPlayerState | null => {
    if (activeCommitted.length === 0) return null;
    if (gameplayTurns.length === 0) return activeCommitted[0] || null;

    const lastTurn = gameplayTurns[gameplayTurns.length - 1];
    const originalOrder = players.map(p => p.PlayerID);
    const lastIdx = originalOrder.indexOf(lastTurn.PlayerID);

    for (let i = 1; i <= originalOrder.length; i++) {
      const nextId = originalOrder[(lastIdx + i) % originalOrder.length];
      const nextState = committedStates.find(ps => ps.playerId === nextId);
      if (nextState && !nextState.isEliminated) return nextState;
    }
    return null;
  }, [gameplayTurns, committedStates, activeCommitted, players]);

  const isKillerState = (ps: KillerPlayerState | null) =>
    ps !== null && ps.lives >= maxLives && ps.targetNumber > 0;

  // ── Preview states: committed + pending hits applied ──
  const previewStates = useMemo((): KillerPlayerState[] => {
    const preview = committedStates.map(ps => ({ ...ps }));
    const map = new Map(preview.map(ps => [ps.playerId, ps]));

    for (const hit of pendingHits) {
      if (hit.action === 'add' && currentPlayer) {
        const ps = map.get(currentPlayer.playerId);
        if (ps) ps.lives = Math.min(maxLives, ps.lives + 1);
      } else if (hit.action === 'remove') {
        const ps = map.get(hit.targetPlayerId);
        if (ps) {
          if (ps.lives <= 0) {
            const immune = firstRoundImmunity && !playersWhoHaveThrown.has(ps.playerId);
            if (!immune) ps.isEliminated = true;
          } else {
            ps.lives -= 1;
          }
        }
      }
    }

    return preview;
  }, [committedStates, pendingHits, currentPlayer, maxLives, firstRoundImmunity, playersWhoHaveThrown]);

  const currentPlayerPreview = currentPlayer
    ? previewStates.find(ps => ps.playerId === currentPlayer.playerId) || null
    : null;

  const winner = useMemo(() => {
    const alive = committedStates.filter(ps => !ps.isEliminated);
    if (alive.length === 1 && isKillerState(alive[0])) return alive[0];
    return null;
  }, [committedStates]);

  // Total hits from all pending
  const totalPendingHits = pendingHits.length;

  // Check if adding one more hit on a target would still be valid
  const canAddHit = useCallback((targetPlayerId: number, action: 'add' | 'remove'): boolean => {
    if (pendingHits.length >= MAX_HITS) return false;
    const hypothetical = [...pendingHits, { action, targetPlayerId }];
    return isValidTurn(hypothetical);
  }, [pendingHits]);

  // ── Row tap: directly add a hit ──
  const handleRowTap = useCallback((ps: KillerPlayerState) => {
    if (disabled || !currentPlayer || !allTargetsAssigned || submitting) return;

    const previewPs = previewStates.find(p => p.playerId === ps.playerId);
    if (!previewPs || previewPs.isEliminated) return;

    const isSelf = ps.playerId === currentPlayer.playerId;

    if (isSelf) {
      if (previewPs.lives >= maxLives) return;
      if (!canAddHit(ps.playerId, 'add')) return;
      setPendingHits(prev => [...prev, { action: 'add', targetPlayerId: ps.playerId }]);
    } else {
      if (!isKillerState(currentPlayerPreview)) return;
      if (!canAddHit(ps.playerId, 'remove')) return;
      setPendingHits(prev => [...prev, { action: 'remove', targetPlayerId: ps.playerId }]);
    }
  }, [disabled, currentPlayer, allTargetsAssigned, submitting, previewStates, currentPlayerPreview, maxLives, canAddHit]);

  // ── Undo last pending hit ──
  const undoLastHit = useCallback(() => {
    setPendingHits(prev => prev.slice(0, -1));
  }, []);

  // ── End turn: save hits as actions ──
  const endTurn = useCallback(async () => {
    if (!currentPlayer || submitting) return;
    setSubmitting(true);

    try {
      let actions: Array<Record<string, unknown>>;
      if (pendingHits.length > 0) {
        actions = pendingHits.map(h => {
          if (h.action === 'add') return { action: 'add' };
          return { action: 'remove', targetPlayerId: h.targetPlayerId };
        });
      } else {
        actions = [{ action: 'miss' }];
      }

      const score = actions.reduce((sum, a) =>
        sum + (a.action === 'add' ? 1 : a.action === 'remove' ? -1 : 0), 0);

      await onAddTurn({
        PlayerID: currentPlayer.playerId,
        TeamSeasonID: players.find(p => p.PlayerID === currentPlayer.playerId)?.TeamSeasonID || 0,
        TurnNumber: turns.length + 1,
        RoundNumber: Math.floor(gameplayTurns.length / activeCommitted.length) + 1,
        Score: pendingHits.length > 0 ? score : 0,
        Details: JSON.stringify({ actions }),
      });

      // Announcements
      const previewAfter = previewStates;
      const eliminatedIds = new Set<number>();
      for (const hit of pendingHits) {
        if (hit.action === 'remove') {
          const tp = previewAfter.find(p => p.playerId === hit.targetPlayerId);
          if (tp?.isEliminated && !eliminatedIds.has(hit.targetPlayerId)) {
            eliminatedIds.add(hit.targetPlayerId);
            const pl = players.find(p => p.PlayerID === hit.targetPlayerId);
            if (pl) announceEliminated(`${pl.FirstName} ${pl.LastName}`);
          }
        }
      }
      if (currentPlayerPreview && isKillerState(currentPlayerPreview) && !isKillerState(currentPlayer)) {
        const pl = players.find(p => p.PlayerID === currentPlayer.playerId);
        if (pl) setTimeout(() => announceKiller(`${pl.FirstName} ${pl.LastName}`), 300);
      }
      const aliveAfter = previewAfter.filter(p => !p.isEliminated);
      if (aliveAfter.length === 1 && isKillerState(aliveAfter[0])) {
        const wp = players.find(p => p.PlayerID === aliveAfter[0].playerId);
        if (wp) {
          setTimeout(() => announceKillerWinner(`${wp.FirstName} ${wp.LastName}`), 1500);
          await onEndGame(wp.TeamSeasonID);
        }
      }
    } finally {
      setPendingHits([]);
      setSubmitting(false);
    }
  }, [currentPlayer, pendingHits, submitting, players, turns, gameplayTurns, activeCommitted,
      onAddTurn, onEndGame, previewStates, currentPlayerPreview]);

  // Audio: announce current thrower
  const prevTurnCount = useRef(turns.length);
  const hasAnnouncedFirst = useRef(false);
  useEffect(() => {
    if (disabled || !currentPlayer || !allTargetsAssigned) return;
    const p = players.find(pl => pl.PlayerID === currentPlayer.playerId);
    if (!p) return;
    const name = `${p.FirstName} ${p.LastName}`;

    if (!hasAnnouncedFirst.current && gameplayTurns.length === 0) {
      const t = setTimeout(() => announceNowThrowing(name), 600);
      hasAnnouncedFirst.current = true;
      return () => clearTimeout(t);
    }
    if (turns.length > prevTurnCount.current) {
      const t = setTimeout(() => announceNowThrowing(name), 2200);
      prevTurnCount.current = turns.length;
      return () => clearTimeout(t);
    }
    prevTurnCount.current = turns.length;
  }, [turns.length, currentPlayer, disabled, allTargetsAssigned]);

  // ── Helpers ──
  const getPlayerColor = (playerId: number): string => {
    const p = players.find(pl => pl.PlayerID === playerId);
    return p?.ThemeColor || 'var(--color-primary)';
  };

  const renderLives = (ps: KillerPlayerState, committedPs: KillerPlayerState) => {
    const circles = [];
    for (let i = 0; i < maxLives; i++) {
      const filled = i < ps.lives;
      const isPending = filled && i >= committedPs.lives;
      const wasLost = !filled && i < committedPs.lives;
      circles.push(
        <span
          key={i}
          style={{
            display: 'inline-block', width: 24, height: 24, borderRadius: '50%',
            border: `2px solid ${ps.isEliminated ? '#666' : getPlayerColor(ps.playerId)}`,
            backgroundColor: filled
              ? (ps.isEliminated ? '#666' : getPlayerColor(ps.playerId))
              : 'transparent',
            margin: '0 2px',
            transition: 'all 0.3s ease',
            animation: isPending ? 'pulse 0.6s ease-in-out' : undefined,
            position: 'relative' as const,
            ...(wasLost ? { boxShadow: 'inset 0 0 0 2px rgba(220,38,38,0.5)' } : {}),
          }}
        />
      );
    }
    return circles;
  };

  // Per-player pending hit totals
  const pendingHitCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!currentPlayer) return counts;
    for (const h of pendingHits) {
      counts.set(h.targetPlayerId, (counts.get(h.targetPlayerId) || 0) + 1);
    }
    return counts;
  }, [pendingHits, currentPlayer]);

  const getRowAction = (ps: KillerPlayerState): 'add' | 'remove' | 'eliminate' | null => {
    if (disabled || !currentPlayer || !allTargetsAssigned || submitting) return null;
    const previewPs = previewStates.find(p => p.playerId === ps.playerId);
    if (!previewPs || previewPs.isEliminated) return null;
    const isSelf = ps.playerId === currentPlayer.playerId;
    if (isSelf) {
      if (previewPs.lives >= maxLives) return null;
      if (!canAddHit(ps.playerId, 'add')) return null;
      return 'add';
    }
    if (!isKillerState(currentPlayerPreview)) return null;
    if (!canAddHit(ps.playerId, 'remove')) return null;
    if (previewPs.lives <= 0) {
      const immune = firstRoundImmunity && !playersWhoHaveThrown.has(ps.playerId);
      return immune ? 'remove' : 'eliminate';
    }
    return 'remove';
  };

  return (
    <div style={{ width: '100%', margin: '0 auto' }}>
      {/* Header */}
      <Card style={{ marginBottom: 'var(--spacing-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-primary)' }}>
          Killer — {maxLives} Lives{firstRoundImmunity ? ' · 🛡️ First Round Immunity' : ''}
        </div>
      </Card>

      {/* Now Throwing banner */}
      {allTargetsAssigned && currentPlayer && !disabled && !winner && (() => {
        const cp = players.find(p => p.PlayerID === currentPlayer.playerId);
        const killerNow = isKillerState(currentPlayerPreview);
        return (
          <Card style={{
            marginBottom: 'var(--spacing-md)',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            backgroundColor: getPlayerColor(currentPlayer.playerId),
            color: '#fff',
            textAlign: 'center',
          }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
              {cp?.FirstName} {cp?.LastName}
              <span style={{ fontWeight: 400, fontSize: '0.9rem', marginLeft: 8, opacity: 0.8 }}>
                — Now Throwing (Target: {currentPlayer.targetNumber})
              </span>
            </div>
            {killerNow ? (
              <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: 2 }}>
                ☠️ KILLER — Tap another player's row to attack!
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: 2 }}>
                Tap your row to add lives ({currentPlayerPreview?.lives ?? 0}/{maxLives})
              </div>
            )}
            {pendingHits.length > 0 && (
              <div style={{
                fontSize: '0.9rem', fontWeight: 700, marginTop: 4,
                backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)',
                padding: '2px 10px', display: 'inline-block',
              }}>
                🎯 {totalPendingHits} hit{totalPendingHits !== 1 ? 's' : ''}
              </div>
            )}
          </Card>
        );
      })()}

      {/* Player table */}
      <Card style={{ marginBottom: 'var(--spacing-md)', padding: 0, overflow: 'hidden' }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: allTargetsAssigned ? '1fr 70px 1fr 40px' : '1fr 80px',
          padding: 'var(--spacing-sm) var(--spacing-md)',
          backgroundColor: 'var(--color-surface-hover)',
          borderBottom: '2px solid var(--color-border)',
          fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1,
        }}>
          <span>Player</span>
          <span style={{ textAlign: 'center' }}>Target</span>
          {allTargetsAssigned && <span style={{ textAlign: 'center' }}>Lives</span>}
          {allTargetsAssigned && <span />}
        </div>

        {/* Player rows */}
        {previewStates.map((ps) => {
          const committed = committedStates.find(c => c.playerId === ps.playerId)!;
          const player = players.find(p => p.PlayerID === ps.playerId);
          if (!player) return null;
          const isCurrentThrower = currentPlayer?.playerId === ps.playerId && !disabled;
          const killerStatus = isKillerState(ps);
          const rowAction = getRowAction(ps);
          const tappable = rowAction !== null;
          const hitCount = pendingHitCounts.get(ps.playerId) || 0;
          const isImmune = firstRoundImmunity && !ps.isEliminated && !playersWhoHaveThrown.has(ps.playerId) && allTargetsAssigned;

          return (
            <div
              key={ps.playerId}
              onClick={() => tappable && handleRowTap(committed)}
              style={{
                display: 'grid',
                gridTemplateColumns: allTargetsAssigned ? '1fr 70px 1fr 40px' : '1fr 80px',
                padding: 'var(--spacing-md)',
                borderBottom: '1px solid var(--color-border)',
                backgroundColor: ps.isEliminated
                    ? 'rgba(128,128,128,0.15)'
                    : isCurrentThrower
                      ? 'rgba(255,165,0,0.12)'
                      : 'transparent',
                opacity: ps.isEliminated ? 0.45 : 1,
                transition: 'all 0.3s ease',
                alignItems: 'center',
                minHeight: 64,
                cursor: tappable ? 'pointer' : 'default',
                userSelect: 'none',
                borderLeft: tappable
                    ? `4px solid ${rowAction === 'add' ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #dc2626)'}`
                    : '4px solid transparent',
              }}
            >
              {/* Player name + hit badge */}
              <div style={{
                fontWeight: isCurrentThrower ? 700 : 600, fontSize: '1.1rem',
                color: ps.isEliminated ? '#888' : 'var(--color-text)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {isCurrentThrower && !disabled && (
                  <span style={{ color: 'orange' }}>▶</span>
                )}
                <span>{player.FirstName} {player.LastName}</span>
                {ps.isEliminated && (
                  <span style={{
                    fontSize: '0.75rem', color: '#888',
                    fontWeight: 700, textTransform: 'uppercase',
                  }}>
                    ELIMINATED
                  </span>
                )}
                {isImmune && (
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 700,
                    color: 'var(--color-info, #3b82f6)',
                    border: '1px solid var(--color-info, #3b82f6)',
                    borderRadius: 'var(--radius-sm)', padding: '1px 5px',
                  }}>
                    🛡️ IMMUNE
                  </span>
                )}
                {hitCount > 0 && !ps.isEliminated && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 24, height: 24, borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700,
                    padding: '0 5px', color: '#fff',
                    backgroundColor: committed.playerId === currentPlayer?.playerId
                      ? 'var(--color-success, #22c55e)'
                      : 'var(--color-danger, #dc2626)',
                  }}>
                    +{hitCount}
                  </span>
                )}
              </div>

              {/* Target number */}
              <div style={{
                textAlign: 'center', fontWeight: 700, fontSize: '1.4rem',
                color: ps.isEliminated ? '#888' : 'var(--color-text)',
              }}>
                {ps.targetNumber || '—'}
              </div>

              {/* Lives (preview) */}
              {allTargetsAssigned && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 2, flexWrap: 'nowrap',
                }}>
                  {renderLives(ps, committed)}
                </div>
              )}

              {/* Killer skull */}
              {allTargetsAssigned && (
                <div style={{
                  width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {killerStatus && !ps.isEliminated && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 36, height: 36, borderRadius: '50%',
                      backgroundColor: '#dc2626', fontSize: '1.3rem',
                    }}>☠️</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Turn action bar */}
      {allTargetsAssigned && currentPlayer && !disabled && !winner && (
        <div style={{
          display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'center',
          marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap',
        }}>
          {pendingHits.length > 0 && (
            <Button
              size="lg"
              onClick={undoLastHit}
              disabled={submitting}
              style={{
                flex: '0 1 160px', fontSize: '1rem',
                backgroundColor: '#92400e', color: '#fff',
                border: '2px solid #b45309',
              }}
            >
              ↩ Undo Hit
            </Button>
          )}
          <Button
            size="lg"
            onClick={endTurn}
            disabled={submitting}
            style={{
              flex: '0 1 260px', fontSize: '1.1rem', fontWeight: 700,
              backgroundColor: pendingHits.length > 0 ? '#15803d' : '#1d4ed8',
              color: '#fff',
              border: `2px solid ${pendingHits.length > 0 ? '#16a34a' : '#2563eb'}`,
            }}
          >
            {submitting
              ? 'Saving…'
              : pendingHits.length > 0
                ? `✓ End Turn (${totalPendingHits} hit${totalPendingHits !== 1 ? 's' : ''})`
                : '✗ Miss — End Turn'}
          </Button>
        </div>
      )}

      {/* Undo last saved turn */}
      {turns.length > 0 && !disabled && pendingHits.length === 0 && (
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)' }}>
          <Button variant="ghost" size="sm" onClick={onUndoTurn}>↩️ Undo Last Saved Turn</Button>
        </div>
      )}

      {/* Legend */}
      <Card title="Legend" style={{ fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
              backgroundColor: 'var(--color-primary)',
            }} />
            <span>Life</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
              border: '2px solid var(--color-primary)', backgroundColor: 'transparent',
            }} />
            <span>Empty</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: '50%',
              backgroundColor: '#dc2626', fontSize: '0.85rem',
            }}>☠️</span>
            <span>Killer ({maxLives}/{maxLives})</span>
          </div>
        </div>
        <div style={{ marginTop: 'var(--spacing-sm)', color: 'var(--color-text-light)' }}>
          Tap a player row to score a hit. Up to 9 hits per turn (3 darts × triple).
          Click "End Turn" to save, or "Miss" if no hits.
          {firstRoundImmunity && ' 🛡️ Players with IMMUNE badge cannot be eliminated until they throw.'}
        </div>
      </Card>
    </div>
  );
}
