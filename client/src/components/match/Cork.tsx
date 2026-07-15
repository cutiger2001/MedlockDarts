import React, { useState } from 'react';
import type { GamePlayer, Match } from '../../types';
import { Button } from '../common/Button';
import { Card } from '../common/Card';

interface CorkProps {
  gameNumber: number;
  match: Match;
  players: GamePlayer[];
  mode?: 'initial' | 'g3' | 'g5';
  baseOrder?: GamePlayer[];
  onCorkComplete: (orderedPlayers: GamePlayer[]) => void;
}

/**
 * Cork UI — determines throw order for odd-numbered games (1, 3, 5).
 * Step 1: "Who won the cork?" — tap a player → their team throws first
 * Step 2+: pick next throwers one-by-one, alternating teams.
 */
export function Cork({ gameNumber, match, players, mode = 'initial', baseOrder, onCorkComplete }: CorkProps) {
  const [step, setStep] = useState<'cork' | 'next'>('cork');
  const [orderedPicks, setOrderedPicks] = useState<GamePlayer[]>([]);

  const homePlayers = players.filter(p => p.TeamSeasonID === match.HomeTeamSeasonID);
  const awayPlayers = players.filter(p => p.TeamSeasonID === match.AwayTeamSeasonID);
  const canUsePatternMode = !!baseOrder && baseOrder.length === 4 && (mode === 'g3' || mode === 'g5');

  const handleCorkWinner = (player: GamePlayer) => {
    if (canUsePatternMode && baseOrder) {
      if (mode === 'g3') {
        const order = player.PlayerID === baseOrder[3].PlayerID
          ? [baseOrder[3], baseOrder[2], baseOrder[1], baseOrder[0]]
          : [baseOrder[2], baseOrder[3], baseOrder[0], baseOrder[1]];
        onCorkComplete(order);
        return;
      }

      const order = player.PlayerID === baseOrder[1].PlayerID
        ? [baseOrder[1], baseOrder[0], baseOrder[2], baseOrder[3]]
        : [baseOrder[0], baseOrder[1], baseOrder[2], baseOrder[3]];
      onCorkComplete(order);
      return;
    }

    const nextOrder = [player];
    setOrderedPicks(nextOrder);
    if (nextOrder.length >= players.length) {
      onCorkComplete(nextOrder);
    } else {
      setStep('next');
    }
  };

  const handleNextThrower = (player: GamePlayer) => {
    if (eligiblePlayers.length > 0 && !eligiblePlayers.some(p => p.PlayerID === player.PlayerID)) {
      return;
    }
    const nextOrder = [...orderedPicks, player];
    setOrderedPicks(nextOrder);
    if (nextOrder.length >= players.length) {
      onCorkComplete(nextOrder);
    }
  };

  const remainingPlayers = players.filter(p => !orderedPicks.some(op => op.PlayerID === p.PlayerID));
  const winnerTeamSeasonID = orderedPicks[0]?.TeamSeasonID;
  const otherTeamSeasonID = winnerTeamSeasonID === match.HomeTeamSeasonID
    ? match.AwayTeamSeasonID
    : match.HomeTeamSeasonID;
  const expectedTeamSeasonID = orderedPicks.length % 2 === 1 ? otherTeamSeasonID : winnerTeamSeasonID;
  const teamRestrictedCandidates = remainingPlayers.filter(p => p.TeamSeasonID === expectedTeamSeasonID);
  const eligiblePlayers = teamRestrictedCandidates.length > 0 ? teamRestrictedCandidates : remainingPlayers;
  const expectedTeamName = expectedTeamSeasonID === match.HomeTeamSeasonID
    ? match.HomeTeamName
    : match.AwayTeamName;
  const nextPickNumber = orderedPicks.length + 1;
  const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
  const currentOrdinal = ordinals[nextPickNumber - 1] || `#${nextPickNumber}`;
  const patternPlayers = canUsePatternMode && baseOrder
    ? (mode === 'g3' ? [baseOrder[2], baseOrder[3]] : [baseOrder[0], baseOrder[1]])
    : [];

  const playerButton = (p: GamePlayer, onClick: () => void) => (
    <button
      key={p.PlayerID}
      onClick={onClick}
      style={{
        padding: 'var(--spacing-md) var(--spacing-lg)',
        minHeight: 'var(--tap-target)',
        minWidth: 140,
        border: '2px solid var(--color-primary)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-text)',
        fontWeight: 700,
        fontSize: '1rem',
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      <div>{p.FirstName} {p.LastName}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginTop: 4 }}>
        {p.TeamSeasonID === match.HomeTeamSeasonID ? match.HomeTeamName : match.AwayTeamName}
      </div>
    </button>
  );

  return (
    <Card style={{ marginBottom: 'var(--spacing-lg)', textAlign: 'center' }}>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 'var(--spacing-sm)' }}>
        🎯 Cork — Game {gameNumber}
      </div>

      {step === 'cork' && (
        <>
          <p style={{ color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
            {canUsePatternMode
              ? 'Who won the cork and starts this game?'
              : 'Who won the cork? Their team throws first.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', justifyContent: 'center' }}>
            {(canUsePatternMode ? patternPlayers : players).map(p => playerButton(p, () => handleCorkWinner(p)))}
          </div>
        </>
      )}

      {!canUsePatternMode && step === 'next' && (
        <>
          <p style={{ color: 'var(--color-text-light)', marginBottom: 'var(--spacing-sm)' }}>
            <strong>{orderedPicks[0]?.FirstName} {orderedPicks[0]?.LastName}</strong> won the cork.
          </p>
          <p style={{ color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
            Who throws {currentOrdinal}?
          </p>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', marginBottom: 'var(--spacing-sm)' }}>
            Pick from: <strong>{expectedTeamName}</strong>
          </p>
          {orderedPicks.length > 0 && (
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', marginBottom: 'var(--spacing-md)' }}>
              Order so far: {orderedPicks.map(p => `${p.FirstName} ${p.LastName}`).join(' → ')}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', justifyContent: 'center' }}>
            {eligiblePlayers.map(p => playerButton(p, () => handleNextThrower(p)))}
          </div>
          <div style={{ marginTop: 'var(--spacing-md)' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (orderedPicks.length <= 1) {
                  setOrderedPicks([]);
                  setStep('cork');
                  return;
                }
                setOrderedPicks(prev => prev.slice(0, -1));
              }}
            >
              {orderedPicks.length <= 1 ? '← Redo Cork' : '↩ Undo Last Pick'}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
