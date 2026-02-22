import React, { useState } from 'react';
import type { GamePlayer, Match } from '../../types';
import { Button } from '../common/Button';
import { Card } from '../common/Card';

interface CorkProps {
  gameNumber: number;
  match: Match;
  players: GamePlayer[];
  onCorkComplete: (orderedPlayers: GamePlayer[]) => void;
}

/**
 * Cork UI — determines throw order for odd-numbered games (1, 3, 5).
 * Step 1: "Who won the cork?" — tap a player → their team throws first
 * Step 2: "Who throws second?" — pick from the opposing team
 * Result: CorkWinner → SelectedOpp → Partner → OppPartner
 */
export function Cork({ gameNumber, match, players, onCorkComplete }: CorkProps) {
  const [step, setStep] = useState<'cork' | 'second'>('cork');
  const [corkWinner, setCorkWinner] = useState<GamePlayer | null>(null);

  const homePlayers = players.filter(p => p.TeamSeasonID === match.HomeTeamSeasonID);
  const awayPlayers = players.filter(p => p.TeamSeasonID === match.AwayTeamSeasonID);

  const handleCorkWinner = (player: GamePlayer) => {
    setCorkWinner(player);
    // If teams only have one player each, skip step 2
    const oppTeam = player.TeamSeasonID === match.HomeTeamSeasonID ? awayPlayers : homePlayers;
    if (oppTeam.length <= 1) {
      finalize(player, oppTeam[0] || null);
    } else {
      setStep('second');
    }
  };

  const handleSecondThrower = (player: GamePlayer) => {
    if (!corkWinner) return;
    finalize(corkWinner, player);
  };

  const finalize = (winner: GamePlayer, secondThrower: GamePlayer | null) => {
    // Build throw order: Winner → Second → WinnerPartner → SecondPartner
    const winnerTeam = winner.TeamSeasonID === match.HomeTeamSeasonID ? homePlayers : awayPlayers;
    const oppTeam = winner.TeamSeasonID === match.HomeTeamSeasonID ? awayPlayers : homePlayers;
    const winnerPartner = winnerTeam.find(p => p.PlayerID !== winner.PlayerID);
    const oppPartner = secondThrower ? oppTeam.find(p => p.PlayerID !== secondThrower.PlayerID) : null;

    const order: GamePlayer[] = [winner];
    if (secondThrower) order.push(secondThrower);
    if (winnerPartner) order.push(winnerPartner);
    if (oppPartner) order.push(oppPartner);

    onCorkComplete(order);
  };

  const oppTeamPlayers = corkWinner
    ? (corkWinner.TeamSeasonID === match.HomeTeamSeasonID ? awayPlayers : homePlayers)
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
            Who won the cork? Their team throws first.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', justifyContent: 'center' }}>
            {players.map(p => playerButton(p, () => handleCorkWinner(p)))}
          </div>
        </>
      )}

      {step === 'second' && corkWinner && (
        <>
          <p style={{ color: 'var(--color-text-light)', marginBottom: 'var(--spacing-sm)' }}>
            <strong>{corkWinner.FirstName} {corkWinner.LastName}</strong> won the cork!
          </p>
          <p style={{ color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
            Who throws second from {corkWinner.TeamSeasonID === match.HomeTeamSeasonID ? match.AwayTeamName : match.HomeTeamName}?
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', justifyContent: 'center' }}>
            {oppTeamPlayers.map(p => playerButton(p, () => handleSecondThrower(p)))}
          </div>
          <div style={{ marginTop: 'var(--spacing-md)' }}>
            <Button variant="ghost" size="sm" onClick={() => { setCorkWinner(null); setStep('cork'); }}>
              ← Redo Cork
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
