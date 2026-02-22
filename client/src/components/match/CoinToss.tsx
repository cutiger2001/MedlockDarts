import React, { useState } from 'react';
import { matchService } from '../../services/matchService';
import type { Match } from '../../types';
import { Button } from '../common/Button';
import { Card } from '../common/Card';

interface CoinTossProps {
  match: Match;
  onUpdate: () => void;
}

export function CoinToss({ match, onUpdate }: CoinTossProps) {
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<string | null>(match.CoinTossResult);
  const [tossWinner, setTossWinner] = useState<number | null>(match.CoinTossWinnerTSID);

  const flip = async () => {
    setFlipping(true);
    setTossWinner(null);
    // Animate for 1 second
    setTimeout(async () => {
      try {
        const { result: tossResult } = await matchService.coinToss(match.MatchID);
        setResult(tossResult);
        onUpdate();
      } catch {
        // ignore
      }
      setFlipping(false);
    }, 1000);
  };

  const selectTossWinner = async (teamSeasonId: number) => {
    try {
      await matchService.setCoinTossWinner(match.MatchID, teamSeasonId);
      setTossWinner(teamSeasonId);
      onUpdate();
    } catch {
      // ignore
    }
  };

  return (
    <Card style={{ marginBottom: 'var(--spacing-lg)', textAlign: 'center' }}>
      <h3 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--color-primary)' }}>🪙 Coin Toss</h3>

      <div style={{
        width: 100, height: 100, margin: '0 auto var(--spacing-md)',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2.5rem',
        backgroundColor: result ? 'var(--color-secondary)' : 'var(--color-border)',
        color: result ? 'var(--color-text-on-secondary)' : 'var(--color-text)',
        fontWeight: 700,
        animation: flipping ? 'spin 0.3s linear infinite' : undefined,
        transition: 'background-color 0.3s',
      }}>
        {flipping ? '🪙' : result ? (result === 'Heads' ? '👑' : '🦅') : '?'}
      </div>

      {result && !flipping && (
        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--spacing-md)', color: 'var(--color-primary)' }}>
          {result}!
        </div>
      )}

      <Button onClick={flip} disabled={flipping}>
        {result ? 'Flip Again' : 'Flip Coin'}
      </Button>

      {/* Toss winner selection */}
      {result && !flipping && (
        <div style={{ marginTop: 'var(--spacing-lg)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-sm)' }}>
            Who won the toss?
          </div>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'center' }}>
            <Button
              variant={tossWinner === match.HomeTeamSeasonID ? 'primary' : 'ghost'}
              onClick={() => selectTossWinner(match.HomeTeamSeasonID)}
            >
              {match.HomeTeamName || 'Home'}
            </Button>
            <Button
              variant={tossWinner === match.AwayTeamSeasonID ? 'secondary' : 'ghost'}
              onClick={() => selectTossWinner(match.AwayTeamSeasonID)}
            >
              {match.AwayTeamName || 'Away'}
            </Button>
          </div>
          {tossWinner && (
            <div style={{
              marginTop: 'var(--spacing-sm)',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: 'var(--color-success)',
            }}>
              ✓ {tossWinner === match.HomeTeamSeasonID ? (match.HomeTeamName || 'Home') : (match.AwayTeamName || 'Away')} won the toss
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }
      `}</style>
    </Card>
  );
}
