import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchService } from '../services/matchService';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';

const REFRESH_INTERVAL = 15_000; // 15 seconds

export function LiveMatchPage() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    try {
      const data = await matchService.getLive();
      setMatches(data);
      setLastRefresh(new Date());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  // Count game wins per team from games array
  const getScore = (match: any) => {
    const games: any[] = match.games || [];
    const home = games.filter((g: any) => g.Status === 'Completed' && g.WinnerTeamSeasonID === match.HomeTeamSeasonID).length;
    const away = games.filter((g: any) => g.Status === 'Completed' && g.WinnerTeamSeasonID === match.AwayTeamSeasonID).length;
    return { home, away };
  };

  const getActiveGame = (match: any) => {
    const games: any[] = match.games || [];
    return games.find((g: any) => g.Status === 'InProgress') || null;
  };

  const gameTypeLabel = (g: any) => {
    if (g.GameType === 'X01') return g.X01Target || '501';
    return g.GameType;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>📺 Live Matches</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
            Updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button size="sm" variant="ghost" onClick={load}>🔄 Refresh</Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>← Back</Button>
        </div>
      </div>

      {loading && <p>Loading live matches...</p>}

      {!loading && matches.length === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--color-text-light)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>🎯</div>
            <p style={{ fontSize: '1.1rem' }}>No matches in progress right now.</p>
            <p style={{ fontSize: '0.85rem', marginTop: 'var(--spacing-sm)' }}>
              Start a match from the League page to see it here.
            </p>
          </div>
        </Card>
      )}

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)',
        justifyContent: 'center',
      }}>
        {matches.map((m: any) => {
          const score = getScore(m);
          const activeGame = getActiveGame(m);
          const totalGames = (m.games || []).length;
          const cardWidth = matches.length === 1 ? '100%' : 'calc(50% - 12px)';

          return (
            <Card
              key={m.MatchID}
              style={{
                cursor: 'pointer', border: '2px solid var(--color-warning)',
                flex: `0 1 ${cardWidth}`, minWidth: 320, maxWidth: 700,
              }}
              onClick={() => navigate(`/match/${m.MatchID}`)}
            >
              {/* Season label */}
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-xs)', textAlign: 'center' }}>
                {m.SeasonName} — Round {m.RoundNumber}
                {m.IsPlayoff ? ` • ${m.PlayoffRound}` : ''}
              </div>

              {/* Team names + score */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)' }}>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                    {m.HomeTeamName}
                  </div>
                </div>
                <div style={{
                  padding: 'var(--spacing-xs) var(--spacing-md)',
                  backgroundColor: 'var(--color-warning)',
                  color: '#fff',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  fontSize: '1.4rem',
                  minWidth: 70,
                  textAlign: 'center',
                }}>
                  {score.home} – {score.away}
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-secondary)' }}>
                    {m.AwayTeamName}
                  </div>
                </div>
              </div>

              {/* Active game banner */}
              {activeGame && (
                <div style={{
                  textAlign: 'center', padding: 'var(--spacing-sm)',
                  backgroundColor: 'var(--color-surface-hover)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 'var(--spacing-sm)',
                }}>
                  <div style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-xs)' }}>
                    <span style={{ fontWeight: 700 }}>Now Playing:</span> Game {activeGame.GameNumber} — {gameTypeLabel(activeGame)}
                  </div>
                  {/* Live score within the active game */}
                  {activeGame.liveScore && activeGame.liveScore.type === 'X01' && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--spacing-md)', fontSize: '1.1rem', fontWeight: 700 }}>
                      <span style={{ color: 'var(--color-primary)' }}>{activeGame.liveScore.homeRemaining}</span>
                      <span style={{ color: 'var(--color-text-light)', fontSize: '0.8rem' }}>remaining</span>
                      <span style={{ color: 'var(--color-secondary)' }}>{activeGame.liveScore.awayRemaining}</span>
                    </div>
                  )}
                  {activeGame.liveScore && (activeGame.liveScore.type === 'Cricket' || activeGame.liveScore.type === 'Shanghai') && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--spacing-md)', fontSize: '1.1rem', fontWeight: 700 }}>
                      <span style={{ color: 'var(--color-primary)' }}>{activeGame.liveScore.homePoints}</span>
                      <span style={{ color: 'var(--color-text-light)', fontSize: '0.8rem' }}>pts</span>
                      <span style={{ color: 'var(--color-secondary)' }}>{activeGame.liveScore.awayPoints}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Games progress dots */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--spacing-xs)' }}>
                {(m.games || []).map((g: any, idx: number) => {
                  const isHome = g.WinnerTeamSeasonID === m.HomeTeamSeasonID;
                  const isAway = g.WinnerTeamSeasonID === m.AwayTeamSeasonID;
                  const bg = g.Status === 'Completed'
                    ? (isHome ? 'var(--color-primary)' : isAway ? 'var(--color-secondary)' : 'var(--color-border)')
                    : g.Status === 'InProgress' ? 'var(--color-warning)' : 'var(--color-border)';
                  return (
                    <div key={idx} style={{
                      width: 32, height: 32, borderRadius: '50%',
                      backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: g.Status === 'Completed' || g.Status === 'InProgress' ? '#fff' : 'var(--color-text-light)',
                      fontSize: '0.75rem', fontWeight: 700,
                    }}>
                      {idx + 1}
                    </div>
                  );
                })}
                {/* Empty slots */}
                {Array.from({ length: Math.max(0, 5 - totalGames) }).map((_, i) => (
                  <div key={`empty-${i}`} style={{
                    width: 32, height: 32, borderRadius: '50%',
                    border: '2px dashed var(--color-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--color-text-light)', fontSize: '0.75rem',
                  }}>
                    {totalGames + i + 1}
                  </div>
                ))}
              </div>

              {/* Game-by-game summary */}
              {(m.games || []).length > 0 && (
                <div style={{ marginTop: 'var(--spacing-sm)', fontSize: '0.78rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {(m.games || []).map((g: any, idx: number) => {
                        const isHome = g.WinnerTeamSeasonID === m.HomeTeamSeasonID;
                        const isAway = g.WinnerTeamSeasonID === m.AwayTeamSeasonID;
                        const label = g.GameType === 'X01' ? (g.X01Target || '501') : g.GameType;
                        return (
                          <tr key={idx} style={{
                            borderBottom: '1px solid var(--color-border)',
                            opacity: g.Status === 'Completed' ? 1 : 0.6,
                          }}>
                            <td style={{ padding: '3px 6px', fontWeight: 600 }}>G{idx + 1}</td>
                            <td style={{ padding: '3px 6px', color: 'var(--color-text-light)' }}>{label}</td>
                            <td style={{
                              padding: '3px 6px', textAlign: 'right', fontWeight: 700,
                              color: g.Status === 'Completed'
                                ? (isHome ? 'var(--color-primary)' : isAway ? 'var(--color-secondary)' : 'var(--color-text-light)')
                                : 'var(--color-warning)',
                            }}>
                              {g.Status === 'Completed'
                                ? (isHome ? m.HomeTeamName : isAway ? m.AwayTeamName : 'Draw')
                                : g.Status === 'InProgress' ? '▶ Playing' : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
