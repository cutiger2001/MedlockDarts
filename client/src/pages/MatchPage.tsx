import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { matchService } from '../services/matchService';
import { gameService } from '../services/gameService';
import { seasonService } from '../services/seasonService';
import type { Match, Game, GameType, SeasonGameFormat } from '../types';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Modal } from '../components/common/Modal';
import { Select } from '../components/common/Select';
import { Input } from '../components/common/Input';
import { CoinToss } from '../components/match/CoinToss';

const MATCH_GAME_COUNT = 5;

export function MatchPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState<Match | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGameModal, setNewGameModal] = useState(false);
  const [gameForm, setGameForm] = useState({
    GameType: '' as GameType | '',
    X01Target: '501',
    DoubleInRequired: false,
    RtwMode: '1to20',
  });
  const [error, setError] = useState('');
  const [gameFormats, setGameFormats] = useState<SeasonGameFormat[]>([]);

  const load = useCallback(async () => {
    if (!matchId) return;
    try {
      setLoading(true);
      const [m, g] = await Promise.all([
        matchService.getById(Number(matchId)),
        gameService.getByMatch(Number(matchId)),
      ]);
      setMatch(m);
      setGames(g);
      // Load season game formats
      if (m) {
        try {
          const formats = await seasonService.getGameFormats(m.SeasonID);
          setGameFormats(formats);
        } catch { /* formats optional */ }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  const startMatch = async () => {
    if (!match) return;
    await matchService.updateStatus(match.MatchID, 'InProgress');
    load();
  };

  const createGame = async () => {
    if (!match || !gameForm.GameType) return;
    try {
      const game = await gameService.create({
        MatchID: match.MatchID,
        GameType: gameForm.GameType as GameType,
        X01Target: gameForm.GameType === 'X01' ? Number(gameForm.X01Target) : undefined,
        DoubleInRequired: gameForm.DoubleInRequired,
        RtwMode: gameForm.GameType === 'RoundTheWorld' ? gameForm.RtwMode : undefined,
      });
      setNewGameModal(false);
      navigate(`/game/${game.GameID}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  /** Auto-create the next game from the season format config */
  const createNextGame = async () => {
    if (!match) return;
    const nextGameNum = games.length + 1;
    const format = gameFormats.find(f => f.GameNumber === nextGameNum);
    if (!format) {
      // No format configured — fall back to manual modal
      setNewGameModal(true);
      return;
    }
    try {
      const game = await gameService.create({
        MatchID: match.MatchID,
        GameType: format.GameType,
        X01Target: format.GameType === 'X01' ? (format.X01Target || 501) : undefined,
        DoubleInRequired: format.DoubleInRequired,
        RtwMode: format.GameType === 'RoundTheWorld' ? '1to20' : undefined,
      });
      navigate(`/game/${game.GameID}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <p>Loading match...</p>;
  if (!match) return <p>Match not found</p>;

  const gameTypeLabel = (g: Game) => {
    if (g.GameType === 'X01') return `${g.X01Target}${g.DoubleInRequired ? ' DI' : ''}`;
    if (g.GameType === 'RoundTheWorld') return `RTW (${g.RtwMode})`;
    return g.GameType;
  };

  // Calculate live match score (game wins per team)
  const homeGamesWon = games.filter(g => g.Status === 'Completed' && g.WinnerTeamSeasonID === match.HomeTeamSeasonID).length;
  const awayGamesWon = games.filter(g => g.Status === 'Completed' && g.WinnerTeamSeasonID === match.AwayTeamSeasonID).length;
  const canAddGame = match.Status === 'InProgress' && games.length < MATCH_GAME_COUNT;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} style={{ marginBottom: 'var(--spacing-md)' }}>
        ← Back
      </Button>

      <Card style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)' }}>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                {match.HomeTeamName}
              </h2>
            </div>
            <div style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              backgroundColor: 'var(--color-background)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '1.5rem',
              minWidth: 80,
              textAlign: 'center',
            }}>
              {match.Status === 'Completed'
                ? `${match.HomeScore} – ${match.AwayScore}`
                : games.length > 0
                  ? `${homeGamesWon} – ${awayGamesWon}`
                  : 'VS'}
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-secondary)' }}>
                {match.AwayTeamName}
              </h2>
            </div>
          </div>

          <div style={{
            padding: '4px 12px', display: 'inline-block', borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem', fontWeight: 700,
            backgroundColor: match.Status === 'Completed' ? 'var(--color-success)' :
              match.Status === 'InProgress' ? 'var(--color-warning)' : 'var(--color-border)',
            color: match.Status === 'Scheduled' ? 'var(--color-text)' : '#fff',
          }}>
            {match.Status}
          </div>

          {match.IsPlayoff && (
            <div style={{ marginTop: 'var(--spacing-sm)', fontWeight: 600, color: 'var(--color-secondary)' }}>
              🏆 Playoff — {match.PlayoffRound}
            </div>
          )}
        </div>
      </Card>

      {/* Coin Toss */}
      {match.Status !== 'Completed' && (
        <CoinToss match={match} onUpdate={load} />
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap', alignItems: 'center' }}>
        {match.Status === 'Scheduled' && (
          <Button onClick={startMatch}>▶️ Start Match</Button>
        )}
        {canAddGame && (() => {
          const nextNum = games.length + 1;
          const fmt = gameFormats.find(f => f.GameNumber === nextNum);
          if (fmt) {
            const label = fmt.GameType === 'X01'
              ? `${fmt.X01Target || 501}${fmt.DoubleInRequired ? ' DI' : ''}`
              : fmt.GameType;
            return (
              <Button onClick={createNextGame}>
                ▶ Game {nextNum}: {label} ({games.length}/{MATCH_GAME_COUNT})
              </Button>
            );
          }
          return (
            <Button onClick={() => setNewGameModal(true)}>
              + New Game ({games.length}/{MATCH_GAME_COUNT})
            </Button>
          );
        })()}
        {match.Status === 'InProgress' && games.length >= MATCH_GAME_COUNT && (
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', alignSelf: 'center' }}>
            All {MATCH_GAME_COUNT} games created. Complete all games to finalize the match.
          </div>
        )}
      </div>

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-md)' }}>{error}</p>}

      {/* Games list */}
      <Card title={`Games (${games.length}/${MATCH_GAME_COUNT})`}>
        {games.length === 0 ? (
          <p style={{ color: 'var(--color-text-light)' }}>No games yet. Start the match and add games.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
            {games.map(g => {
              const winnerIsHome = g.WinnerTeamSeasonID === match.HomeTeamSeasonID;
              const winnerIsAway = g.WinnerTeamSeasonID === match.AwayTeamSeasonID;
              return (
                <div
                  key={g.GameID}
                  onClick={() => navigate(`/game/${g.GameID}`)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: 'var(--spacing-md)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    minHeight: 'var(--tap-target)',
                    backgroundColor: g.Status === 'Completed' ? 'var(--color-surface-hover)' : 'transparent',
                    borderLeft: g.Status === 'Completed'
                      ? `4px solid ${winnerIsHome ? 'var(--color-primary)' : 'var(--color-secondary)'}`
                      : undefined,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>Game {g.GameNumber}: {gameTypeLabel(g)}</span>
                    {g.Status === 'Completed' && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginTop: 2 }}>
                        Won by {winnerIsHome ? match.HomeTeamName : match.AwayTeamName}
                      </div>
                    )}
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem', fontWeight: 700,
                    backgroundColor: g.Status === 'Completed' ? 'var(--color-success)' :
                      g.Status === 'InProgress' ? 'var(--color-warning)' : 'var(--color-border)',
                    color: g.Status === 'NotStarted' ? 'var(--color-text)' : '#fff',
                  }}>
                    {g.Status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* New Game Modal */}
      <Modal isOpen={newGameModal} onClose={() => setNewGameModal(false)} title="New Game"
        footer={<><Button variant="ghost" onClick={() => setNewGameModal(false)}>Cancel</Button><Button onClick={createGame}>Create & Play</Button></>}>
        <Select
          label="Game Type"
          options={[
            { value: 'X01', label: 'X01 (301, 501, etc.)' },
            { value: 'Cricket', label: 'Cricket' },
            { value: 'Shanghai', label: 'Shanghai' },
            { value: 'RoundTheWorld', label: 'Round the World' },
          ]}
          value={gameForm.GameType}
          onChange={e => setGameForm(f => ({ ...f, GameType: e.target.value as GameType }))}
        />

        {gameForm.GameType === 'X01' && (
          <>
            <Select
              label="Target Score"
              options={[
                { value: '301', label: '301' },
                { value: '501', label: '501' },
                { value: '701', label: '701' },
                { value: '1001', label: '1001' },
              ]}
              value={gameForm.X01Target}
              onChange={e => setGameForm(f => ({ ...f, X01Target: e.target.value }))}
            />
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', minHeight: 'var(--tap-target)' }}>
                <input
                  type="checkbox"
                  checked={gameForm.DoubleInRequired}
                  onChange={e => setGameForm(f => ({ ...f, DoubleInRequired: e.target.checked }))}
                  style={{ width: 20, height: 20 }}
                />
                <span style={{ fontWeight: 600 }}>Double In Required</span>
              </label>
            </div>
          </>
        )}

        {gameForm.GameType === 'RoundTheWorld' && (
          <Select
            label="Mode"
            options={[
              { value: '1to20', label: '1 → 20' },
              { value: '20to1', label: '20 → 1' },
              { value: 'Random', label: 'Random Order' },
            ]}
            value={gameForm.RtwMode}
            onChange={e => setGameForm(f => ({ ...f, RtwMode: e.target.value }))}
          />
        )}
      </Modal>
    </div>
  );
}
