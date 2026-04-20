import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { playerService } from '../services/playerService';
import { gameService } from '../services/gameService';
import type { Player, GameType } from '../types';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Select } from '../components/common/Select';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';

const MAX_PLAYERS_PER_TEAM = 4;

interface TeamSetup {
  players: Player[];
}

export function PlayGamePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const rematch = (location.state as { killerRematch?: boolean; killerLives?: number; playerIds?: number[] } | null) ?? null;
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [teamPlay, setTeamPlay] = useState(false);
  const [teamA, setTeamA] = useState<TeamSetup>({ players: [] });
  const [teamB, setTeamB] = useState<TeamSetup>({ players: [] });
  const [gameType, setGameType] = useState<GameType | ''>('X01');
  const [x01Target, setX01Target] = useState('501');
  const [doubleInRequired, setDoubleInRequired] = useState(false);
  const [rtwMode, setRtwMode] = useState('1to20');
  const [killerLives, setKillerLives] = useState('5');
  const [killerImmunity, setKillerImmunity] = useState(true);
  const [killerTargets, setKillerTargets] = useState<Record<number, number>>({});
  const [error, setError] = useState('');

  // Add player modal
  const [addPlayerModal, setAddPlayerModal] = useState(false);
  const [newPlayerForm, setNewPlayerForm] = useState({ FirstName: '', LastName: '' });

  useEffect(() => {
    playerService.getAll().then(all => {
      setAllPlayers(all);
      // Pre-fill from Killer rematch state
      if (rematch?.killerRematch && rematch.playerIds && rematch.playerIds.length > 0) {
        setGameType('Killer');
        setKillerLives(String(rematch.killerLives ?? 5));
        const preSelected = rematch.playerIds
          .map(id => all.find(p => p.PlayerID === id))
          .filter((p): p is Player => !!p && p.IsActive);
        setTeamA({ players: preSelected });
      }
    });
  }, []);

  // Players already picked
  const pickedIds = new Set([
    ...teamA.players.map(p => p.PlayerID),
    ...teamB.players.map(p => p.PlayerID),
  ]);
  const availablePlayers = allPlayers.filter(p => !pickedIds.has(p.PlayerID) && p.IsActive)
    .sort((a, b) => a.FirstName.localeCompare(b.FirstName) || a.LastName.localeCompare(b.LastName));

  const addToTeam = (team: 'A' | 'B', player: Player) => {
    if (team === 'A') {
      if (teamA.players.length >= MAX_PLAYERS_PER_TEAM) return;
      setTeamA(prev => ({ ...prev, players: [...prev.players, player] }));
    } else {
      if (teamB.players.length >= MAX_PLAYERS_PER_TEAM) return;
      setTeamB(prev => ({ ...prev, players: [...prev.players, player] }));
    }
  };

  const removeFromTeam = (team: 'A' | 'B', playerId: number) => {
    if (team === 'A') {
      setTeamA(prev => ({ ...prev, players: prev.players.filter(p => p.PlayerID !== playerId) }));
    } else {
      setTeamB(prev => ({ ...prev, players: prev.players.filter(p => p.PlayerID !== playerId) }));
    }
  };

  const movePlayer = (team: 'A' | 'B', index: number, direction: -1 | 1) => {
    const setter = team === 'A' ? setTeamA : setTeamB;
    setter(prev => {
      const arr = [...prev.players];
      const newIdx = index + direction;
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[index], arr[newIdx]] = [arr[newIdx], arr[index]];
      return { ...prev, players: arr };
    });
  };

  const canStart = () => {
    if (!gameType) return false;
    if (gameType === 'Killer') {
      // Killer: 2+ players, all must have unique target numbers
      const allKillerPlayers = teamA.players;
      if (allKillerPlayers.length < 2) return false;
      const targets = allKillerPlayers.map(p => killerTargets[p.PlayerID]).filter(Boolean);
      if (targets.length !== allKillerPlayers.length) return false;
      if (new Set(targets).size !== targets.length) return false; // no duplicates
      return true;
    }
    if (teamPlay) {
      return teamA.players.length >= 1 && teamB.players.length >= 1
        && teamA.players.length === teamB.players.length
        && teamA.players.length <= MAX_PLAYERS_PER_TEAM;
    }
    return teamA.players.length >= 1;
  };

  const startGame = async () => {
    if (!gameType || !canStart()) return;
    setError('');

    try {
      // Determine team split
      let teamAPlayers: number[];
      let teamBPlayers: number[];
      let isTeamPlay = teamPlay;

      if (gameType === 'Killer') {
        // Killer: all players go on team A, team B gets the first pair for match infra
        // We pair players as 1v1 for the match infrastructure, but the game is FFA
        const allPids = teamA.players.map(p => p.PlayerID);
        teamAPlayers = [allPids[0]];
        teamBPlayers = [allPids[1]];
        isTeamPlay = false;
        // Extra players added as additional GamePlayers after creation

        const game = await gameService.createAdHoc({
          GameType: gameType as GameType,
          KillerLives: Number(killerLives),
          TeamAPlayers: teamAPlayers,
          TeamBPlayers: teamBPlayers,
          TeamPlay: isTeamPlay,
        });

        // Add remaining players as game players (all on team A for simplicity)
        if (allPids.length > 2) {
          const existingPlayers = await gameService.getPlayers(game.GameID);
          const existingIds = new Set(existingPlayers.map(p => p.PlayerID));
          const additionalPlayers = allPids.filter(pid => !existingIds.has(pid));
          if (additionalPlayers.length > 0) {
            const match = await (await import('../services/matchService')).matchService.getById(game.MatchID);
            const tsId = match?.HomeTeamSeasonID || existingPlayers[0]?.TeamSeasonID || 0;
            await gameService.addPlayers(game.GameID,
              additionalPlayers.map((pid, idx) => ({
                PlayerID: pid,
                TeamSeasonID: tsId,
                PlayerOrder: existingIds.size + idx + 1,
              }))
            );
          }
        }

        // Create game options turn first
        const gamePlayers = await gameService.getPlayers(game.GameID);
        const firstGp = gamePlayers[0];
        if (firstGp) {
          await gameService.addTurn(game.GameID, {
            PlayerID: firstGp.PlayerID,
            TeamSeasonID: firstGp.TeamSeasonID,
            TurnNumber: 0,
            RoundNumber: 0,
            Score: 0,
            Details: JSON.stringify({ action: 'game_options', firstRoundImmunity: killerImmunity }),
          });
        }

        // Create setup turns for target numbers
        for (const p of teamA.players) {
          const gp = gamePlayers.find(gpl => gpl.PlayerID === p.PlayerID);
          if (gp && killerTargets[p.PlayerID]) {
            await gameService.addTurn(game.GameID, {
              PlayerID: p.PlayerID,
              TeamSeasonID: gp.TeamSeasonID,
              TurnNumber: 0,
              RoundNumber: 0,
              Score: 0,
              Details: JSON.stringify({
                action: 'setup',
                targetNumber: killerTargets[p.PlayerID],
              }),
            });
          }
        }

        navigate(`/game/${game.GameID}`);
        return;
      }

      if (teamPlay) {
        // Explicit team play: use the two team panels
        teamAPlayers = teamA.players.map(p => p.PlayerID);
        teamBPlayers = teamB.players.map(p => p.PlayerID);
      } else if (teamA.players.length >= 2) {
        // 2+ players without team play: auto-split into 1v1 (first vs second)
        teamAPlayers = [teamA.players[0].PlayerID];
        teamBPlayers = [teamA.players[1].PlayerID];
      } else {
        // Single player: solo practice
        teamAPlayers = teamA.players.map(p => p.PlayerID);
        teamBPlayers = [];
      }

      const game = await gameService.createAdHoc({
        GameType: gameType as GameType,
        X01Target: gameType === 'X01' ? Number(x01Target) : undefined,
        DoubleInRequired: doubleInRequired,
        RtwMode: gameType === 'RoundTheWorld' ? rtwMode : undefined,
        TeamAPlayers: teamAPlayers,
        TeamBPlayers: teamBPlayers,
        TeamPlay: isTeamPlay,
      });
      navigate(`/game/${game.GameID}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create game');
    }
  };

  const addNewPlayer = async () => {
    if (!newPlayerForm.FirstName || !newPlayerForm.LastName) return;
    try {
      const p = await playerService.create(newPlayerForm);
      setAllPlayers(prev => [...prev, p]);
      setAddPlayerModal(false);
      setNewPlayerForm({ FirstName: '', LastName: '' });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const PlayerList = ({ team, label, teamData }: { team: 'A' | 'B'; label: string; teamData: TeamSetup }) => (
    <Card style={{ flex: '1 1 280px', minHeight: 200 }}>
      <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 'var(--spacing-sm)', color: team === 'A' ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
        {label}
      </div>
      {teamData.players.length === 0 ? (
        <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>No players added yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
          {teamData.players.map((p, i) => (
            <div key={p.PlayerID} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
              padding: 'var(--spacing-sm)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-surface-hover)',
              border: '1px solid var(--color-border)',
            }}>
              <span style={{ fontWeight: 700, fontSize: '0.85rem', width: 20, textAlign: 'center', color: 'var(--color-text-light)' }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{p.FirstName} {p.LastName}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  onClick={() => movePlayer(team, i, -1)}
                  disabled={i === 0}
                  style={{
                    background: 'none', border: '1px solid var(--color-border)', borderRadius: 4,
                    width: 28, height: 28, cursor: i === 0 ? 'default' : 'pointer',
                    opacity: i === 0 ? 0.3 : 1, fontSize: '0.8rem',
                  }}
                >
                  ▲
                </button>
                <button
                  onClick={() => movePlayer(team, i, 1)}
                  disabled={i === teamData.players.length - 1}
                  style={{
                    background: 'none', border: '1px solid var(--color-border)', borderRadius: 4,
                    width: 28, height: 28, cursor: i === teamData.players.length - 1 ? 'default' : 'pointer',
                    opacity: i === teamData.players.length - 1 ? 0.3 : 1, fontSize: '0.8rem',
                  }}
                >
                  ▼
                </button>
                <button
                  onClick={() => removeFromTeam(team, p.PlayerID)}
                  style={{
                    background: 'none', border: '1px solid var(--color-danger)', borderRadius: 4,
                    width: 28, height: 28, cursor: 'pointer', color: 'var(--color-danger)', fontSize: '0.85rem',
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {teamData.players.length < MAX_PLAYERS_PER_TEAM && (
        <div style={{ marginTop: 'var(--spacing-sm)' }}>
          <select
            value=""
            onChange={e => {
              const player = availablePlayers.find(p => p.PlayerID === Number(e.target.value));
              if (player) addToTeam(team, player);
            }}
            style={{ width: '100%', minHeight: 'var(--tap-target)' }}
          >
            <option value="">+ Add Player...</option>
            {availablePlayers.map(p => (
              <option key={p.PlayerID} value={p.PlayerID}>{p.FirstName} {p.LastName}</option>
            ))}
          </select>
        </div>
      )}
    </Card>
  );

  return (
    <div>
      <h1 className="page-title">Play Game</h1>

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-md)' }}>{error}</p>}

      {/* Game Type */}
      <Card style={{ marginBottom: 'var(--spacing-lg)' }}>
        <Select
          label="Game Type"
          options={[
            { value: 'X01', label: 'X01 (301, 501, etc.)' },
            { value: 'Cricket', label: 'Cricket' },
            { value: 'Shanghai', label: 'Shanghai' },
            { value: 'RoundTheWorld', label: 'Round the World' },
            { value: 'Killer', label: 'Killer' },
          ]}
          value={gameType}
          onChange={e => setGameType(e.target.value as GameType)}
        />

        {gameType === 'X01' && (
          <div style={{ display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap', marginTop: 'var(--spacing-md)', alignItems: 'flex-end' }}>
            <div style={{ flex: '0 0 auto' }}>
              <Select
                label="Target"
                options={[
                  { value: '301', label: '301' },
                  { value: '501', label: '501' },
                  { value: '701', label: '701' },
                  { value: '1001', label: '1001' },
                ]}
                value={x01Target}
                onChange={e => setX01Target(e.target.value)}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', minHeight: 'var(--tap-target)', paddingBottom: 2 }}>
              <input
                type="checkbox"
                checked={doubleInRequired}
                onChange={e => setDoubleInRequired(e.target.checked)}
                style={{ width: 22, height: 22 }}
              />
              <span style={{ fontWeight: 600, fontSize: '1rem' }}>Double In</span>
            </label>
          </div>
        )}

        {gameType === 'RoundTheWorld' && (
          <Select
            label="Mode"
            options={[
              { value: '1to20', label: '1 → 20' },
              { value: '20to1', label: '20 → 1' },
              { value: 'Random', label: 'Random Order' },
            ]}
            value={rtwMode}
            onChange={e => setRtwMode(e.target.value)}
          />
        )}

        {gameType === 'Killer' && (
          <>
            <Select
              label="Number of Lives"
              options={[
                { value: '3', label: '3 Lives' },
                { value: '5', label: '5 Lives' },
                { value: '7', label: '7 Lives' },
              ]}
              value={killerLives}
              onChange={e => setKillerLives(e.target.value)}
            />
            <div style={{ marginTop: 'var(--spacing-md)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', minHeight: 'var(--tap-target)' }}>
                <input
                  type="checkbox"
                  checked={killerImmunity}
                  onChange={e => setKillerImmunity(e.target.checked)}
                  style={{ width: 20, height: 20 }}
                />
                <span style={{ fontWeight: 600 }}>First Round Immunity</span>
              </label>
              <p style={{ margin: '4px 0 0 28px', fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                Players cannot be eliminated before they have thrown their first dart.
              </p>
            </div>
          </>
        )}

        {/* Team Play Toggle — not for Killer */}
        {gameType !== 'Killer' && (
          <div style={{ marginTop: 'var(--spacing-md)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', minHeight: 'var(--tap-target)' }}>
              <input
                type="checkbox"
                checked={teamPlay}
                onChange={e => setTeamPlay(e.target.checked)}
                style={{ width: 20, height: 20 }}
              />
              <span style={{ fontWeight: 600 }}>Team Play</span>
            </label>
          </div>
        )}
      </Card>

      {/* Killer: player list with target number assignment */}
      {gameType === 'Killer' ? (
        <Card style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 'var(--spacing-sm)', color: 'var(--color-primary)' }}>
            Players (min 2)
          </div>
          {teamA.players.length === 0 ? (
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>No players added yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
              {teamA.players.map((p, i) => {
                const usedTargets = Object.entries(killerTargets)
                  .filter(([pid]) => Number(pid) !== p.PlayerID)
                  .map(([, num]) => num);
                return (
                  <div key={p.PlayerID} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-sm)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-surface-hover)',
                    border: '1px solid var(--color-border)',
                  }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>{p.FirstName} {p.LastName}</span>
                    <select
                      value={killerTargets[p.PlayerID] || ''}
                      onChange={e => setKillerTargets(prev => ({
                        ...prev,
                        [p.PlayerID]: Number(e.target.value),
                      }))}
                      style={{ minHeight: 'var(--tap-target)', minWidth: 70, fontSize: '1rem', fontWeight: 700, textAlign: 'center' }}
                    >
                      <option value="">—</option>
                      {Array.from({ length: 20 }, (_, n) => n + 1)
                        .filter(n => !usedTargets.includes(n))
                        .map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                    <button
                      onClick={() => {
                        removeFromTeam('A', p.PlayerID);
                        setKillerTargets(prev => {
                          const next = { ...prev };
                          delete next[p.PlayerID];
                          return next;
                        });
                      }}
                      style={{
                        background: 'none', border: '1px solid var(--color-danger)', borderRadius: 4,
                        width: 28, height: 28, cursor: 'pointer', color: 'var(--color-danger)', fontSize: '0.85rem',
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {teamA.players.length < 8 && (
            <div style={{ marginTop: 'var(--spacing-sm)' }}>
              <select
                value=""
                onChange={e => {
                  const player = availablePlayers.find(p => p.PlayerID === Number(e.target.value));
                  if (player) addToTeam('A', player);
                }}
                style={{ width: '100%', minHeight: 'var(--tap-target)' }}
              >
                <option value="">+ Add Player...</option>
                {availablePlayers.map(p => (
                  <option key={p.PlayerID} value={p.PlayerID}>{p.FirstName} {p.LastName}</option>
                ))}
              </select>
            </div>
          )}
        </Card>
      ) : (
        <>
          {/* Player Selection Side by Side */}
          <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap', marginBottom: 'var(--spacing-lg)' }}>
            <PlayerList team="A" label={teamPlay ? 'Team A' : 'Players'} teamData={teamA} />
            {teamPlay && <PlayerList team="B" label="Team B" teamData={teamB} />}
          </div>
        </>
      )}

      {/* Add New Player / Start buttons */}
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={() => setAddPlayerModal(true)}>
          + New Player
        </Button>
        <Button
          onClick={startGame}
          disabled={!canStart()}
          style={{ flex: '1 1 200px', minHeight: 56, fontSize: '1.1rem', fontWeight: 700 }}
        >
          Start Game
        </Button>
      </div>

      {/* New Player Modal */}
      <Modal
        isOpen={addPlayerModal}
        onClose={() => setAddPlayerModal(false)}
        title="Add New Player"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddPlayerModal(false)}>Cancel</Button>
            <Button onClick={addNewPlayer}>Add Player</Button>
          </>
        }
      >
        <Input label="First Name" value={newPlayerForm.FirstName} onChange={e => setNewPlayerForm(f => ({ ...f, FirstName: e.target.value }))} />
        <Input label="Last Name" value={newPlayerForm.LastName} onChange={e => setNewPlayerForm(f => ({ ...f, LastName: e.target.value }))} />
      </Modal>
    </div>
  );
}
