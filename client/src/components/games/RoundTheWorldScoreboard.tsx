import React, { useState, useMemo } from 'react';
import type { Game, Match, GamePlayer, Turn } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

interface ScoreboardProps {
  game: Game;
  match: Match;
  players: GamePlayer[];
  turns: Turn[];
  onAddTurn: (turn: Partial<Turn>) => Promise<void>;
  onUndoTurn: () => Promise<void>;
  onEndGame: (winnerTeamSeasonId: number) => Promise<void>;
}

export function RoundTheWorldScoreboard({ game, match, players, turns, onAddTurn, onUndoTurn, onEndGame }: ScoreboardProps) {
  const homeTeamId = match.HomeTeamSeasonID;
  const awayTeamId = match.AwayTeamSeasonID;
  const homePlayers = players.filter(p => p.TeamSeasonID === homeTeamId);
  const awayPlayers = players.filter(p => p.TeamSeasonID === awayTeamId);

  // Build sequence
  const sequence = useMemo(() => {
    if (game.RtwSequence) {
      return JSON.parse(game.RtwSequence) as number[];
    }
    if (game.RtwMode === '20to1') {
      return [...Array.from({ length: 20 }, (_, i) => 20 - i), 25];
    }
    // Default: 1 to 20
    return [...Array.from({ length: 20 }, (_, i) => i + 1), 25];
  }, [game]);

  // Turn order (custom if pre-ordered by cork)
  const naturalOrder: GamePlayer[] = [];
  const maxPerTeam = Math.max(homePlayers.length, awayPlayers.length);
  for (let i = 0; i < maxPerTeam; i++) {
    if (homePlayers[i]) naturalOrder.push(homePlayers[i]);
    if (awayPlayers[i]) naturalOrder.push(awayPlayers[i]);
  }
  const isCustomOrder = players.length > 0 && naturalOrder.length > 0 &&
    players[0].PlayerID !== naturalOrder[0].PlayerID;
  const turnOrder = isCustomOrder ? [...players] : naturalOrder;

  const currentPlayerIndex = turnOrder.length > 0 ? (turns.length % turnOrder.length) : 0;
  const currentPlayer = turnOrder[currentPlayerIndex];
  const currentRound = turnOrder.length > 0 ? Math.floor(turns.length / turnOrder.length) + 1 : 1;

  // Track progress per player (which index in sequence they're at)
  const playerProgress = useMemo(() => {
    const progress: Record<number, { index: number; scores: number[] }> = {};
    for (const p of players) {
      progress[p.PlayerID] = { index: 0, scores: [] };
    }
    for (const t of turns) {
      const pp = progress[t.PlayerID];
      if (pp) {
        pp.scores.push(t.Score);
        if (t.RtwTargetHit) {
          pp.index++;
        }
      }
    }
    return progress;
  }, [turns, players]);

  // Player total scores
  const playerTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    for (const p of players) {
      totals[p.PlayerID] = turns
        .filter(t => t.PlayerID === p.PlayerID)
        .reduce((sum, t) => sum + t.Score, 0);
    }
    return totals;
  }, [turns, players]);

  const getPlayerTarget = (playerId: number): number | null => {
    const pp = playerProgress[playerId];
    if (!pp || pp.index >= sequence.length) return null;
    return sequence[pp.index];
  };

  const submitScore = async (hit: boolean, score: number = 0) => {
    if (!currentPlayer) return;
    const target = getPlayerTarget(currentPlayer.PlayerID);
    if (target === null) return;

    const actualScore = hit ? (score || target) : 0;

    await onAddTurn({
      PlayerID: currentPlayer.PlayerID,
      TeamSeasonID: currentPlayer.TeamSeasonID,
      TurnNumber: turns.length + 1,
      RoundNumber: currentRound,
      Score: actualScore,
      RtwTargetHit: hit,
      Details: JSON.stringify({ target, hit, score: actualScore }),
    });

    // Check if player completed the sequence
    if (hit) {
      const pp = playerProgress[currentPlayer.PlayerID];
      if (pp && pp.index + 1 >= sequence.length) {
        await onEndGame(currentPlayer.TeamSeasonID);
      }
    }
  };

  const disabled = game.Status === 'Completed';

  return (
    <div>
      {/* Header with mode indicator */}
      <Card style={{ marginBottom: 'var(--spacing-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-primary)' }}>
          Round the World — {game.RtwMode === 'Random' ? 'Random' : game.RtwMode === '20to1' ? '20 → 1' : '1 → 20'}
        </div>
      </Card>

      {/* Player progress boards */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)',
      }}>
        {/* Home team */}
        <Card style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-sm)', fontWeight: 600 }}>
            {match.HomeTeamName}
          </div>
          {homePlayers.map(p => {
            const target = getPlayerTarget(p.PlayerID);
            const progress = playerProgress[p.PlayerID];
            const active = currentPlayer?.PlayerID === p.PlayerID;
            return (
              <div key={p.PlayerID} style={{
                padding: 'var(--spacing-sm)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: active ? 'rgba(255,255,255,0.2)' : 'transparent',
                marginBottom: 'var(--spacing-xs)',
              }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{p.FirstName} {p.LastName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    Score: {playerTotals[p.PlayerID] || 0}
                  </span>
                  {target !== null ? (
                    <span style={{
                      padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                      backgroundColor: active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                      fontWeight: 700, fontSize: '1.2rem',
                    }}>
                      🎯 {target === 25 ? 'Bull' : target}
                    </span>
                  ) : (
                    <span style={{ fontWeight: 700 }}>✅ Done!</span>
                  )}
                </div>
                <div style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: 4 }}>
                  {progress?.index || 0}/{sequence.length} completed
                </div>
              </div>
            );
          })}
        </Card>

        {/* Away team */}
        <Card style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-text-on-secondary)' }}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-sm)', fontWeight: 600 }}>
            {match.AwayTeamName}
          </div>
          {awayPlayers.map(p => {
            const target = getPlayerTarget(p.PlayerID);
            const progress = playerProgress[p.PlayerID];
            const active = currentPlayer?.PlayerID === p.PlayerID;
            return (
              <div key={p.PlayerID} style={{
                padding: 'var(--spacing-sm)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: active ? 'rgba(255,255,255,0.2)' : 'transparent',
                marginBottom: 'var(--spacing-xs)',
              }}>
                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{p.FirstName} {p.LastName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    Score: {playerTotals[p.PlayerID] || 0}
                  </span>
                  {target !== null ? (
                    <span style={{
                      padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                      backgroundColor: active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                      fontWeight: 700, fontSize: '1.2rem',
                    }}>
                      🎯 {target === 25 ? 'Bull' : target}
                    </span>
                  ) : (
                    <span style={{ fontWeight: 700 }}>✅ Done!</span>
                  )}
                </div>
                <div style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: 4 }}>
                  {progress?.index || 0}/{sequence.length} completed
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Current player and target */}
      {currentPlayer && !disabled && (
        <Card style={{ marginBottom: 'var(--spacing-md)', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Now Throwing</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: 'var(--spacing-sm)' }}>
            {currentPlayer.FirstName} {currentPlayer.LastName}
          </div>
          {getPlayerTarget(currentPlayer.PlayerID) !== null && (
            <div style={{
              display: 'inline-block', padding: '12px 24px',
              backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
              borderRadius: 'var(--radius-lg)', fontSize: '2rem', fontWeight: 700,
            }}>
              🎯 Target: {getPlayerTarget(currentPlayer.PlayerID) === 25 ? 'Bull' : getPlayerTarget(currentPlayer.PlayerID)}
            </div>
          )}
        </Card>
      )}

      {/* Hit / Miss buttons */}
      {currentPlayer && !disabled && getPlayerTarget(currentPlayer.PlayerID) !== null && (
        <div style={{
          display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'center',
          marginBottom: 'var(--spacing-lg)',
        }}>
          <Button
            size="lg"
            variant="ghost"
            onClick={() => submitScore(false)}
            style={{ flex: 1, maxWidth: 200, fontSize: '1.2rem' }}
          >
            ✗ Miss
          </Button>
          <Button
            size="lg"
            onClick={() => submitScore(true)}
            style={{ flex: 1, maxWidth: 200, fontSize: '1.2rem' }}
          >
            ✓ Hit
          </Button>
        </div>
      )}

      {/* Undo */}
      {turns.length > 0 && !disabled && (
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)' }}>
          <Button variant="ghost" size="sm" onClick={onUndoTurn}>↩️ Undo Last Turn</Button>
        </div>
      )}

      {/* Sequence reference (collapsible) */}
      <Card title="Sequence">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
          {sequence.map((num, i) => (
            <span key={i} style={{
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-background)',
              fontSize: '0.85rem', fontWeight: 600,
            }}>
              {num === 25 ? 'Bull' : num}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
