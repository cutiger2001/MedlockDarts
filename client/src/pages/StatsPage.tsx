import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { statsService } from '../services/statsService';
import { playerService } from '../services/playerService';
import { seasonService } from '../services/seasonService';
import type { Player, Season, PlayerStats } from '../types';
import { Card } from '../components/common/Card';
import { Select } from '../components/common/Select';

interface GameLogEntry {
  GameID: number;
  GameType: string;
  GameNumber: number;
  X01Target: number | null;
  GameStatus: string;
  WinnerTeamSeasonID: number | null;
  MatchID: number;
  RoundNumber: number;
  TeamSeasonID: number;
  PPD: number | null;
  MPR: number | null;
  TotalDarts: number;
  TotalScore: number;
  HadDoubleIn: number;
  HadGameOut: number;
  HadClose: number;
}

export function StatsPage() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState(playerId || '');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [gameLog, setGameLog] = useState<GameLogEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'gamelog' | 'leaderboard'>('leaderboard');

  useEffect(() => {
    Promise.all([playerService.getAll(), seasonService.getAll()])
      .then(([p, s]) => {
        setPlayers(p);
        setSeasons(s);
        // Default to most recent season (last in list)
        if (s.length > 0 && !selectedSeasonId) {
          // Filter out Ad-Hoc Play season, pick most recent real season; fallback to last
          const realSeasons = s.filter(season => season.SeasonName !== 'Ad-Hoc Play');
          const defaultSeason = realSeasons.length > 0 ? realSeasons[realSeasons.length - 1] : s[s.length - 1];
          setSelectedSeasonId(String(defaultSeason.SeasonID));
        }
      });
  }, []);

  useEffect(() => {
    if (selectedPlayerId) {
      setLoading(true);
      const seasonId = selectedSeasonId ? Number(selectedSeasonId) : undefined;
      Promise.all([
        statsService.getPlayerStats(Number(selectedPlayerId), seasonId),
        statsService.getPlayerGameLog(Number(selectedPlayerId), seasonId),
      ])
        .then(([s, gl]) => { setStats(s); setGameLog(gl); })
        .catch(() => { setStats(null); setGameLog([]); })
        .finally(() => setLoading(false));
    } else {
      setStats(null);
      setGameLog([]);
    }
  }, [selectedPlayerId, selectedSeasonId]);

  useEffect(() => {
    if (selectedSeasonId) {
      statsService.getSeasonLeaderboard(Number(selectedSeasonId))
        .then(l => setLeaderboard(l))
        .catch(() => setLeaderboard([]));
    } else {
      setLeaderboard([]);
    }
  }, [selectedSeasonId]);

  // Filter players based on leaderboard data when a season is selected
  const filteredPlayers = useMemo(() => {
    if (selectedSeasonId && leaderboard.length > 0) {
      const leaderboardIds = new Set(leaderboard.map((l: any) => l.PlayerID));
      return players.filter(p => leaderboardIds.has(p.PlayerID));
    }
    return players;
  }, [players, leaderboard, selectedSeasonId]);

  const playerOptions = filteredPlayers.map(p => ({
    value: p.PlayerID,
    label: `${p.FirstName} ${p.LastName}`,
  }));

  const seasonOptions = seasons.map(s => ({
    value: s.SeasonID,
    label: s.SeasonName,
  }));

  return (
    <div>
      <h1 className="page-title">📊 Statistics</h1>

      <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap', marginBottom: 'var(--spacing-lg)' }}>
        <div style={{ flex: '1 1 200px' }}>
          <Select label="Player" options={playerOptions} value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <Select label="Season" options={seasonOptions} value={selectedSeasonId} onChange={e => setSelectedSeasonId(e.target.value)} />
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 'var(--spacing-lg)', borderBottom: '2px solid var(--color-border)' }}>
        {(['overview', 'gamelog', 'leaderboard'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              border: 'none',
              borderBottom: activeTab === tab ? '3px solid var(--color-primary)' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-light)',
              fontWeight: activeTab === tab ? 700 : 500,
              fontSize: '0.95rem',
              cursor: 'pointer',
              minHeight: 'var(--tap-target)',
            }}
          >
            {tab === 'overview' ? 'Overview' : tab === 'gamelog' ? 'Game Log' : 'Leaderboard'}
          </button>
        ))}
      </div>

      {loading && <p>Loading stats...</p>}

      {/* Overview tab */}
      {activeTab === 'overview' && stats && (
        <Card title={`${stats.FirstName} ${stats.LastName}`} style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 'var(--spacing-md)', textAlign: 'center',
          }}>
            <StatBox label="Games" value={stats.TotalGames} />
            <StatBox label="Avg (PPD×3)" value={(stats.PPD * 3).toFixed(1)} highlight />
            <StatBox label="PPD" value={stats.PPD.toFixed(2)} />
            <StatBox label="MPR" value={stats.MPR.toFixed(2)} highlight />
            <StatBox label="INs" value={stats.InCount} sub={`Avg: ${stats.InAvg.toFixed(1)}`} />
            <StatBox label="OUTs" value={stats.OutCount} sub={`Avg: ${stats.OutAvg.toFixed(1)}`} />
            <StatBox label="CLOSEs" value={stats.CloseCount} />
            <StatBox label="⭐ All-Stars" value={stats.AllStarCount} highlight />
            <StatBox label="X01 Darts" value={stats.X01Darts || 0} />
            <StatBox label="Cricket Darts" value={stats.CricketDarts || 0} />
          </div>
        </Card>
      )}

      {activeTab === 'overview' && !stats && !loading && selectedPlayerId && (
        <Card><p style={{ color: 'var(--color-text-light)', textAlign: 'center' }}>No stats available for this player.</p></Card>
      )}

      {/* Game Log tab */}
      {activeTab === 'gamelog' && (
        <Card title="Game Log">
          {gameLog.length === 0 ? (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center' }}>
              {selectedPlayerId ? 'No completed games found.' : 'Select a player to view their game log.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Rd</th>
                    <th style={{ padding: '6px 8px' }}>G#</th>
                    <th style={{ padding: '6px 8px' }}>Type</th>
                    <th style={{ padding: '6px 8px' }}>PPD</th>
                    <th style={{ padding: '6px 8px' }}>MPR</th>
                    <th style={{ padding: '6px 8px' }}>Darts</th>
                    <th style={{ padding: '6px 8px' }}>Score</th>
                    <th style={{ padding: '6px 8px' }}>W</th>
                    <th style={{ padding: '6px 8px' }}>⭐</th>
                    <th style={{ padding: '6px 8px' }}>IN</th>
                    <th style={{ padding: '6px 8px' }}>OUT</th>
                    <th style={{ padding: '6px 8px' }}>CL</th>
                  </tr>
                </thead>
                <tbody>
                  {gameLog.map(g => {
                    const won = g.WinnerTeamSeasonID === g.TeamSeasonID;
                    return (
                      <tr
                        key={g.GameID}
                        style={{
                          borderBottom: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          backgroundColor: won ? 'rgba(76, 175, 80, 0.08)' : 'transparent',
                        }}
                        onClick={() => navigate(`/game/${g.GameID}`)}
                      >
                        <td style={{ padding: '6px 8px' }}>{g.RoundNumber}</td>
                        <td style={{ padding: '6px 8px' }}>{g.GameNumber}</td>
                        <td style={{ padding: '6px 8px' }}>
                          {g.GameType === 'X01' ? `${g.X01Target || ''}` : g.GameType}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {g.PPD != null ? Number(g.PPD).toFixed(2) : '—'}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--color-secondary)' }}>
                          {g.MPR != null ? Number(g.MPR).toFixed(2) : '—'}
                        </td>
                        <td style={{ padding: '6px 8px' }}>{g.TotalDarts || '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{g.TotalScore || '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {won ? '✅' : ''}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', color: '#FFD700', fontWeight: 700 }}>
                          {(g as any).AllStarCount > 0 ? `⭐${(g as any).AllStarCount}` : ''}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {g.HadDoubleIn ? '✓' : ''}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {g.HadGameOut ? '✓' : ''}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {g.HadClose ? '✓' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Leaderboard tab */}
      {activeTab === 'leaderboard' && (
        <>
          {!selectedSeasonId && (
            <Card><p style={{ color: 'var(--color-text-light)', textAlign: 'center' }}>Select a season to view the leaderboard.</p></Card>
          )}
          {leaderboard.length > 0 && (
            <Card title="Season Leaderboard">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>#</th>
                      <th style={{ padding: '8px' }}>Player</th>
                      <th style={{ padding: '8px' }}>GP</th>
                      <th style={{ padding: '8px' }}>PPD</th>
                      <th style={{ padding: '8px' }}>Avg</th>
                      <th style={{ padding: '8px' }}>MPR</th>
                      <th style={{ padding: '8px' }}>⭐</th>
                      <th style={{ padding: '8px' }}>IN</th>
                      <th style={{ padding: '8px' }}>OUT</th>
                      <th style={{ padding: '8px' }}>CL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((p: any, i: number) => (
                      <tr
                        key={p.PlayerID}
                        style={{
                          borderBottom: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          backgroundColor: selectedPlayerId === String(p.PlayerID) ? 'var(--color-surface-hover)' : 'transparent',
                        }}
                        onClick={() => { setSelectedPlayerId(String(p.PlayerID)); setActiveTab('overview'); }}
                      >
                        <td style={{ padding: '8px', fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: '8px' }}>{p.FirstName} {p.LastName}</td>
                        <td style={{ padding: '8px' }}>{p.GamesPlayed}</td>
                        <td style={{ padding: '8px', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {Number(p.PPD).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px' }}>
                          {(Number(p.PPD) * 3).toFixed(1)}
                        </td>
                        <td style={{ padding: '8px', fontWeight: 700, color: 'var(--color-secondary)' }}>
                          {Number(p.MPR).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', color: '#FFD700', fontWeight: 700 }}>{p.AllStarCount || 0}</td>
                        <td style={{ padding: '8px' }}>{p.InCount}</td>
                        <td style={{ padding: '8px' }}>{p.OutCount}</td>
                        <td style={{ padding: '8px' }}>{p.CloseCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, sub, highlight }: { label: string; value: string | number; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      padding: 'var(--spacing-md)',
      borderRadius: 'var(--radius-md)',
      backgroundColor: highlight ? 'var(--color-primary)' : 'var(--color-background)',
      color: highlight ? 'var(--color-text-on-primary)' : 'var(--color-text)',
    }}>
      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, opacity: 0.8 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{sub}</div>}
    </div>
  );
}
