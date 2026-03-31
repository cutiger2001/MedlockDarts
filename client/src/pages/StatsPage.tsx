import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  MatchDate: string | null;
  IsPlayoff: boolean;
  PlayoffRound: string | null;
  SeasonName: string;
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
  const [teamLeaderboard, setTeamLeaderboard] = useState<any[]>([]);
  const [seasonHistory, setSeasonHistory] = useState<any[]>([]);
  const [highestInAll, setHighestInAll] = useState<any[]>([]);
  const [highestOutAll, setHighestOutAll] = useState<any[]>([]);
  const [topTeam501, setTopTeam501] = useState<any[]>([]);
  const [topTeam301, setTopTeam301] = useState<any[]>([]);
  const [topTeamMPR, setTopTeamMPR] = useState<any[]>([]);
  const [topInd501, setTopInd501] = useState<any[]>([]);
  const [topInd301, setTopInd301] = useState<any[]>([]);
  const [topIndMPR, setTopIndMPR] = useState<any[]>([]);
  const [hallOfFame, setHallOfFame] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'gamelog' | 'leaderboard' | 'history' | 'halloffame'>(playerId ? 'overview' : 'leaderboard');
  const [sortCol, setSortCol] = useState<string>('DR');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [teamSortCol, setTeamSortCol] = useState<string>('PPR');
  const [teamSortDir, setTeamSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    Promise.all([playerService.getAll(), seasonService.getAll()])
      .then(([p, s]) => {
        setPlayers(p);
        setSeasons(s);
        // Default to most recent season that has games played (not Setup, not Ad-Hoc)
        if (s.length > 0 && !selectedSeasonId) {
          const playedSeasons = s.filter(season => season.SeasonName !== 'Ad-Hoc Play' && season.Status !== 'Setup');
          const defaultSeason = playedSeasons.length > 0 ? playedSeasons[0]
            : s.filter(season => season.SeasonName !== 'Ad-Hoc Play')[0] || s[0];
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
      // Also fetch season history (all-time, no season filter)
      statsService.getPlayerSeasonHistory(Number(selectedPlayerId))
        .then(h => setSeasonHistory(h))
        .catch(() => setSeasonHistory([]));
    } else {
      setStats(null);
      setGameLog([]);
      setSeasonHistory([]);
    }
  }, [selectedPlayerId, selectedSeasonId]);

  useEffect(() => {
    if (selectedSeasonId) {
      Promise.all([
        statsService.getSeasonLeaderboard(Number(selectedSeasonId)),
        statsService.getSeasonTeamLeaderboard(Number(selectedSeasonId)),
      ])
        .then(([l, tl]) => { setLeaderboard(l); setTeamLeaderboard(tl); })
        .catch(() => { setLeaderboard([]); setTeamLeaderboard([]); });
      // Also load records for leaderboard tab (filtered by season)
      const sid = Number(selectedSeasonId);
      Promise.all([
        statsService.getHighestInScores(sid),
        statsService.getHighestOutScores(sid),
        statsService.getTopTeamAvg(501, sid),
        statsService.getTopTeamAvg(301, sid),
        statsService.getTopTeamMPR(sid),
        statsService.getTopIndividualAvg(501, sid),
        statsService.getTopIndividualAvg(301, sid),
        statsService.getTopIndividualMPR(sid),
      ])
        .then(([hi, ho, t501, t301, tmpr, i501, i301, impr]) => {
          setHighestInAll(hi); setHighestOutAll(ho);
          setTopTeam501(t501); setTopTeam301(t301); setTopTeamMPR(tmpr);
          setTopInd501(i501); setTopInd301(i301); setTopIndMPR(impr);
        })
        .catch(() => {});
    } else {
      setLeaderboard([]); setTeamLeaderboard([]);
    }
  }, [selectedSeasonId]);

  // Load Hall of Fame data (all-time, no season filter)
  useEffect(() => {
    if (activeTab === 'halloffame' && !hallOfFame) {
      statsService.getHallOfFame()
        .then(d => setHallOfFame(d))
        .catch(() => setHallOfFame(null));
    }
  }, [activeTab, hallOfFame]);

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

  // --- Compute player leaderboard with Darts Rating ---
  // DR is a multi-dimensional composite (0–100 scale) using season-relative normalization:
  //   Scoring Power (35%): First 9 average — normalized to season best
  //   Finishing (30%):     Blend of checkout PPR (≤170) + checkout % — normalized to season best
  //   Versatility (20%):   Cricket MPR — normalized to season best
  //   Clutch (15%):        Weighted clutch events per game — normalized to season best
  // Each dimension scores the player as a fraction of the season leader in that category.
  // Rank is the dense rank by PPR descending (the traditional ranking).
  const rankedLeaderboard = useMemo(() => {
    if (leaderboard.length === 0) return [];

    // First pass: compute raw component values for each player
    const rawData = leaderboard.map((p: any) => {
      const ppr = Math.round(Number(p.PPD) * 3 * 10) / 10;
      const gp = p.GamesPlayed || 1;
      const first9 = Math.round(Number(p.First9Avg || 0) * 10) / 10;
      const scoringPPR = Math.round(Number(p.ScoringPPR || 0) * 10) / 10;
      const checkoutPPR = Math.round(Number(p.CheckoutPPR || 0) * 10) / 10;
      const coHits = Number(p.CheckoutHits || 0);
      const coAttempts = Number(p.CheckoutAttempts || 0);
      const coPct = coAttempts > 0 ? Math.round((coHits / coAttempts) * 1000) / 10 : 0;
      const gamesWon = Number(p.GamesWon || 0);
      const winPct = gp > 0 ? Math.round((gamesWon / gp) * 1000) / 10 : 0;

      // Raw component scores (not yet normalized)
      const rawScoring   = first9;
      const hasCheckoutData = coAttempts > 0;
      const rawFinishing = hasCheckoutData
        ? (checkoutPPR * 0.5) + ((coPct / 100) * 90 * 0.5) // blend: PPR + %×90 (same scale)
        : null; // null = no checkout data, will be filled with season median
      const rawMPR       = Number(p.MPR || 0);
      const clutchEvents = (p.OutCount || 0) * 2 + (p.InCount || 0) * 1.5
                         + (p.CloseCount || 0) * 1.5 + (p.AllStarCount || 0);
      const rawClutch    = clutchEvents / gp;

      return {
        ...p, PPR: ppr, First9: first9, ScoringPPR: scoringPPR, CheckoutPPR: checkoutPPR,
        CheckoutPct: coPct, GamesWon: gamesWon, WinPct: winPct,
        _rawScoring: rawScoring, _rawFinishing: rawFinishing, _rawMPR: rawMPR, _rawClutch: rawClutch,
      };
    });

    // Second pass: compute median finishing for players with no checkout data
    const finishingValues = rawData
      .map(p => p._rawFinishing)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const medianFinishing = finishingValues.length > 0
      ? finishingValues[Math.floor(finishingValues.length / 2)]
      : 0;

    // Fill null finishing with median
    rawData.forEach(p => {
      if (p._rawFinishing === null) p._rawFinishing = medianFinishing;
    });

    // Third pass: find season maxima for normalization
    const maxScoring   = Math.max(...rawData.map(p => p._rawScoring), 1);
    const maxFinishing = Math.max(...rawData.map(p => p._rawFinishing), 1);
    const maxMPR       = Math.max(...rawData.map(p => p._rawMPR), 0.01);
    const maxClutch    = Math.max(...rawData.map(p => p._rawClutch), 0.01);

    // Fourth pass: normalize and compute DR
    const withDR = rawData.map(p => {
      const scoring     = (p._rawScoring / maxScoring) * 35;
      const finishing   = (p._rawFinishing / maxFinishing) * 30;
      const versatility = (p._rawMPR / maxMPR) * 20;
      const clutch      = (p._rawClutch / maxClutch) * 15;

      const dartsRating = Math.round((scoring + finishing + versatility + clutch) * 10) / 10;
      return { ...p, DartsRating: dartsRating };
    });

    // Dense rank by PPR descending
    const sorted = [...withDR].sort((a, b) => b.PPR - a.PPR);
    let rank = 1;
    sorted.forEach((p, i) => {
      if (i > 0 && p.PPR < sorted[i - 1].PPR) rank = i + 1;
      p.Rank = rank;
    });

    return withDR;
  }, [leaderboard]);

  // --- Sortable leaderboard ---
  const sortedLeaderboard = useMemo(() => {
    const data = [...rankedLeaderboard];
    const col = sortCol;
    data.sort((a, b) => {
      let va: any, vb: any;
      switch (col) {
        case 'Player': va = `${a.FirstName} ${a.LastName}`; vb = `${b.FirstName} ${b.LastName}`; return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        case 'GP': va = a.GamesPlayed; vb = b.GamesPlayed; break;
        case 'PPR': va = a.PPR; vb = b.PPR; break;
        case 'F9': va = a.First9; vb = b.First9; break;
        case '>170': va = a.ScoringPPR; vb = b.ScoringPPR; break;
        case '≤170': va = a.CheckoutPPR; vb = b.CheckoutPPR; break;
        case 'MPR': va = Number(a.MPR); vb = Number(b.MPR); break;
        case 'AS': va = a.AllStarCount || 0; vb = b.AllStarCount || 0; break;
        case 'IN': va = a.InCount || 0; vb = b.InCount || 0; break;
        case 'OUT': va = a.OutCount || 0; vb = b.OutCount || 0; break;
        case 'CL': va = a.CloseCount || 0; vb = b.CloseCount || 0; break;
        case 'CO%': va = a.CheckoutPct; vb = b.CheckoutPct; break;
        case 'W': va = a.GamesWon; vb = b.GamesWon; break;
        case 'Rank': va = a.Rank; vb = b.Rank; break;
        case 'DR': va = a.DartsRating; vb = b.DartsRating; break;
        default: va = a.DartsRating; vb = b.DartsRating; break;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return data;
  }, [rankedLeaderboard, sortCol, sortDir]);

  const sortedTeamLeaderboard = useMemo(() => {
    const data = [...teamLeaderboard];
    const col = teamSortCol;
    data.sort((a, b) => {
      let va: any, vb: any;
      switch (col) {
        case 'Team': va = a.TeamName; vb = b.TeamName; return teamSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        case 'GP': va = a.GamesPlayed; vb = b.GamesPlayed; break;
        case 'PPR': va = Number(a.PPD) * 3; vb = Number(b.PPD) * 3; break;
        case 'MPR': va = Number(a.MPR); vb = Number(b.MPR); break;
        case 'AS': va = a.AllStarCount || 0; vb = b.AllStarCount || 0; break;
        case 'GW': va = (a.Wins501 || 0) + (a.Wins301 || 0) + (a.WinsCricket || 0); vb = (b.Wins501 || 0) + (b.Wins301 || 0) + (b.WinsCricket || 0); break;
        case 'W501': va = a.Wins501 || 0; vb = b.Wins501 || 0; break;
        case 'W301': va = a.Wins301 || 0; vb = b.Wins301 || 0; break;
        case 'WCrk': va = a.WinsCricket || 0; vb = b.WinsCricket || 0; break;
        default: va = Number(a.PPD) * 3; vb = Number(b.PPD) * 3; break;
      }
      return teamSortDir === 'asc' ? va - vb : vb - va;
    });
    return data;
  }, [teamLeaderboard, teamSortCol, teamSortDir]);

  const handleSort = useCallback((col: string) => {
    setSortCol(prev => {
      if (prev === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return col; }
      // Default sort direction per column
      const defaultDesc = ['GP', 'PPR', 'F9', '>170', '≤170', 'MPR', 'AS', 'IN', 'OUT', 'CL', 'CO%', 'W', 'DR'];
      const defaultAsc = ['Rank'];
      setSortDir(defaultAsc.includes(col) ? 'asc' : defaultDesc.includes(col) ? 'desc' : 'asc');
      return col;
    });
  }, []);

  const handleTeamSort = useCallback((col: string) => {
    setTeamSortCol(prev => {
      if (prev === col) { setTeamSortDir(d => d === 'asc' ? 'desc' : 'asc'); return col; }
      const defaultDesc = ['GP', 'PPR', 'MPR', 'AS', 'GW', 'W501', 'W301', 'WCrk'];
      setTeamSortDir(defaultDesc.includes(col) ? 'desc' : 'asc');
      return col;
    });
  }, []);

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
        {(['overview', 'gamelog', 'history', 'leaderboard', 'halloffame'] as const).map(tab => (
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
            {tab === 'overview' ? 'Overview' : tab === 'gamelog' ? 'Game Log' : tab === 'history' ? 'Season History' : tab === 'leaderboard' ? 'Leaderboard' : 'Hall of Fame'}
          </button>
        ))}
      </div>

      {loading && <p>Loading stats...</p>}

      {/* Overview tab */}
      {activeTab === 'overview' && stats && (() => {
        const totalDarts = (stats.X01Darts || 0) + (stats.CricketDarts || 0) + (stats.ShanghaiDarts || 0);
        const pct = (v: number) => totalDarts > 0 ? `${((v / totalDarts) * 100).toFixed(0)}%` : '—';
        return (
          <Card title={`${stats.FirstName} ${stats.LastName}`} style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 'var(--spacing-md)', textAlign: 'center',
            }}>
              <StatBox label="Games" value={stats.TotalGames} />
              <StatBox label="PPR" value={(stats.PPD * 3).toFixed(1)} highlight />
              <StatBox label="MPR" value={stats.MPR.toFixed(2)} highlight />
              <StatBox label="INs" value={stats.InCount} sub={`Avg: ${stats.InAvg.toFixed(1)}${stats.HighestIn ? ` | Best: ${stats.HighestIn}` : ''}`} />
              <StatBox label="OUTs" value={stats.OutCount} sub={`Avg: ${stats.OutAvg.toFixed(1)}${stats.HighestOut ? ` | Best: ${stats.HighestOut}` : ''}`} />
              <StatBox label="CLOSEs" value={stats.CloseCount} />
              <StatBox label="⭐ All-Stars" value={stats.AllStarCount} highlight />
              <StatBox label="Total Darts" value={totalDarts} highlight />
              <StatBox label="X01 Darts" value={stats.X01Darts || 0} sub={pct(stats.X01Darts || 0)} />
              <StatBox label="Cricket Darts" value={stats.CricketDarts || 0} sub={pct(stats.CricketDarts || 0)} />
              <StatBox label="Shanghai Darts" value={stats.ShanghaiDarts || 0} sub={pct(stats.ShanghaiDarts || 0)} />
            </div>
          </Card>
        );
      })()}

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
                    <th style={{ padding: '6px 8px' }}>Season</th>
                    <th style={{ padding: '6px 8px' }}>Date</th>
                    <th style={{ padding: '6px 8px' }}>Rd</th>
                    <th style={{ padding: '6px 8px' }}>G#</th>
                    <th style={{ padding: '6px 8px' }}>Type</th>
                    <th style={{ padding: '6px 8px' }}>PPR</th>
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
                        <td style={{ padding: '6px 8px', fontSize: '0.8rem' }}>{g.SeasonName}</td>
                        <td style={{ padding: '6px 8px', fontSize: '0.8rem' }}>
                          {g.MatchDate ? new Date(g.MatchDate).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '6px 8px' }}>{g.IsPlayoff ? (g.PlayoffRound || 'PO') : g.RoundNumber}</td>
                        <td style={{ padding: '6px 8px' }}>{g.GameNumber}</td>
                        <td style={{ padding: '6px 8px' }}>
                          {g.GameType === 'X01' ? `${g.X01Target || ''}` : g.GameType}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {g.PPD != null ? (Number(g.PPD) * 3).toFixed(1) : '—'}
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

      {/* Season History tab */}
      {activeTab === 'history' && (
        <Card title="Season History">
          {!selectedPlayerId ? (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center' }}>Select a player to view their season history.</p>
          ) : seasonHistory.length === 0 ? (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center' }}>No season data found for this player.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Season</th>
                    <th style={{ padding: '8px' }}>GP</th>
                    <th style={{ padding: '8px' }}>W</th>
                    <th style={{ padding: '8px' }}>PPR</th>
                    <th style={{ padding: '8px' }}>MPR</th>
                    <th style={{ padding: '8px' }}>⭐</th>
                    <th style={{ padding: '8px' }}>IN</th>
                    <th style={{ padding: '8px' }}>OUT</th>
                    <th style={{ padding: '8px' }}>CL</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonHistory.map((h: any) => (
                    <tr
                      key={h.SeasonID}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        cursor: 'pointer',
                        backgroundColor: selectedSeasonId === String(h.SeasonID) ? 'var(--color-surface-hover)' : 'transparent',
                      }}
                      onClick={() => { setSelectedSeasonId(String(h.SeasonID)); setActiveTab('overview'); }}
                    >
                      <td style={{ padding: '8px', fontWeight: 600 }}>{h.SeasonName}</td>
                      <td style={{ padding: '8px' }}>{h.GamesPlayed}</td>
                      <td style={{ padding: '8px' }}>{h.Wins}</td>
                      <td style={{ padding: '8px', fontWeight: 700, color: 'var(--color-primary)' }}>
                        {(Number(h.PPD) * 3).toFixed(1)}
                      </td>
                      <td style={{ padding: '8px', fontWeight: 700, color: 'var(--color-secondary)' }}>
                        {Number(h.MPR).toFixed(2)}
                      </td>
                      <td style={{ padding: '8px', color: '#FFD700', fontWeight: 700 }}>{h.AllStarCount || 0}</td>
                      <td style={{ padding: '8px' }}>{h.InCount}</td>
                      <td style={{ padding: '8px' }}>{h.OutCount}</td>
                      <td style={{ padding: '8px' }}>{h.CloseCount}</td>
                    </tr>
                  ))}
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

          {/* Player Leaderboard */}
          {sortedLeaderboard.length > 0 && (
            <Card title="Player Leaderboard" style={{ marginBottom: 'var(--spacing-lg)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>#</th>
                      <SortTh col="Player" label="Player" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="GP" label="GP" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="PPR" label="PPR" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="F9" label="F9" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col=">170" label=">170" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="≤170" label="≤170" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="MPR" label="MPR" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="AS" label="⭐" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="IN" label="IN" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="OUT" label="OUT" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="CL" label="CL" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="CO%" label="CO%" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="W" label="W" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="Rank" label="Rank" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                      <SortTh col="DR" label="DR" activeCol={sortCol} dir={sortDir} onClick={handleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeaderboard.map((p: any, i: number) => (
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
                          {p.PPR.toFixed(1)}
                        </td>
                        <td style={{ padding: '8px', fontWeight: 600, color: 'var(--color-primary)', opacity: 0.8 }}>
                          {p.First9 > 0 ? p.First9.toFixed(1) : '—'}
                        </td>
                        <td style={{ padding: '8px', fontSize: '0.85rem' }}>
                          {p.ScoringPPR > 0 ? p.ScoringPPR.toFixed(1) : '—'}
                        </td>
                        <td style={{ padding: '8px', fontSize: '0.85rem' }}>
                          {p.CheckoutPPR > 0 ? p.CheckoutPPR.toFixed(1) : '—'}
                        </td>
                        <td style={{ padding: '8px', fontWeight: 700, color: 'var(--color-secondary)' }}>
                          {Number(p.MPR).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', color: '#FFD700', fontWeight: 700 }}>{p.AllStarCount || 0}</td>
                        <td style={{ padding: '8px' }}>{p.InCount}</td>
                        <td style={{ padding: '8px' }}>{p.OutCount}</td>
                        <td style={{ padding: '8px' }}>{p.CloseCount}</td>
                        <td style={{ padding: '8px', fontWeight: 600, color: p.CheckoutPct >= 30 ? 'var(--color-success, #4caf50)' : p.CheckoutPct > 0 ? 'var(--color-text)' : 'var(--color-text-light)' }}>
                          {p.CheckoutPct > 0 ? `${p.CheckoutPct.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{p.GamesWon}</td>
                        <td style={{ padding: '8px', color: 'var(--color-text-light)' }}>{p.Rank}</td>
                        <td style={{ padding: '8px', fontWeight: 700, color: 'var(--color-primary)' }}>{p.DartsRating.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Team Leaderboard */}
          {sortedTeamLeaderboard.length > 0 && (
            <Card title="Team Leaderboard" style={{ marginBottom: 'var(--spacing-lg)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>#</th>
                      <SortTh col="Team" label="Team" activeCol={teamSortCol} dir={teamSortDir} onClick={handleTeamSort} />
                      <SortTh col="GP" label="GP" activeCol={teamSortCol} dir={teamSortDir} onClick={handleTeamSort} />
                      <SortTh col="PPR" label="PPR" activeCol={teamSortCol} dir={teamSortDir} onClick={handleTeamSort} />
                      <SortTh col="MPR" label="MPR" activeCol={teamSortCol} dir={teamSortDir} onClick={handleTeamSort} />
                      <SortTh col="AS" label="⭐" activeCol={teamSortCol} dir={teamSortDir} onClick={handleTeamSort} />
                      <SortTh col="GW" label="GW" activeCol={teamSortCol} dir={teamSortDir} onClick={handleTeamSort} />
                      <SortTh col="W501" label="W501" activeCol={teamSortCol} dir={teamSortDir} onClick={handleTeamSort} />
                      <SortTh col="W301" label="W301" activeCol={teamSortCol} dir={teamSortDir} onClick={handleTeamSort} />
                      <SortTh col="WCrk" label="WCrk" activeCol={teamSortCol} dir={teamSortDir} onClick={handleTeamSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTeamLeaderboard.map((t: any, i: number) => (
                      <tr key={t.TeamSeasonID} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: '8px' }}>{t.TeamName}</td>
                        <td style={{ padding: '8px' }}>{t.GamesPlayed}</td>
                        <td style={{ padding: '8px', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {(Number(t.PPD) * 3).toFixed(1)}
                        </td>
                        <td style={{ padding: '8px', fontWeight: 700, color: 'var(--color-secondary)' }}>
                          {Number(t.MPR).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', color: '#FFD700', fontWeight: 700 }}>{t.AllStarCount || 0}</td>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{(t.Wins501 || 0) + (t.Wins301 || 0) + (t.WinsCricket || 0)}</td>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{t.Wins501 || 0}</td>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{t.Wins301 || 0}</td>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{t.WinsCricket || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Records Section */}
          {selectedSeasonId && (
            <>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 'var(--spacing-lg) 0 var(--spacing-md)', color: 'var(--color-text)' }}>🏆 Season Records</h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--spacing-md)' }}>
                {/* Highest IN Scores */}
                <Card title="Highest IN Scores">
                  <RecordTable
                    headers={['Player', 'Score', 'Game', 'Date']}
                    rows={highestInAll.map((r: any) => [
                      `${r.FirstName} ${r.LastName}`,
                      r.InScore,
                      r.GameType === 'X01' ? `${r.X01Target}` : r.GameType,
                      r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—',
                    ])}
                  />
                </Card>

                {/* Highest OUT Scores */}
                <Card title="Highest OUT Scores">
                  <RecordTable
                    headers={['Player', 'Score', 'Game', 'Date']}
                    rows={highestOutAll.map((r: any) => [
                      `${r.FirstName} ${r.LastName}`,
                      r.OutScore,
                      r.GameType === 'X01' ? `${r.X01Target}` : r.GameType,
                      r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—',
                    ])}
                  />
                </Card>

                {/* Top 10 Team 501 Avg */}
                <Card title="Top 10 Team 501 Avg">
                  <RecordTable
                    headers={['Team', 'Avg', 'Date']}
                    rows={topTeam501.map((r: any) => [
                      r.TeamName,
                      Number(r.TeamAvg).toFixed(1),
                      r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—',
                    ])}
                  />
                </Card>

                {/* Top 10 Team 301 Avg */}
                <Card title="Top 10 Team 301 Avg">
                  <RecordTable
                    headers={['Team', 'Avg', 'Date']}
                    rows={topTeam301.map((r: any) => [
                      r.TeamName,
                      Number(r.TeamAvg).toFixed(1),
                      r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—',
                    ])}
                  />
                </Card>

                {/* Top 10 Team Cricket MPR */}
                <Card title="Top 10 Team Cricket MPR">
                  <RecordTable
                    headers={['Team', 'MPR', 'Date']}
                    rows={topTeamMPR.map((r: any) => [
                      r.TeamName,
                      Number(r.TeamMPR).toFixed(2),
                      r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—',
                    ])}
                  />
                </Card>

                {/* Top 10 Individual 501 Avg */}
                <Card title="Top 10 Individual 501 Avg">
                  <RecordTable
                    headers={['Player', 'Avg', 'Date']}
                    rows={topInd501.map((r: any) => [
                      `${r.FirstName} ${r.LastName}`,
                      Number(r.PlayerAvg).toFixed(1),
                      r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—',
                    ])}
                  />
                </Card>

                {/* Top 10 Individual 301 Avg */}
                <Card title="Top 10 Individual 301 Avg">
                  <RecordTable
                    headers={['Player', 'Avg', 'Date']}
                    rows={topInd301.map((r: any) => [
                      `${r.FirstName} ${r.LastName}`,
                      Number(r.PlayerAvg).toFixed(1),
                      r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—',
                    ])}
                  />
                </Card>

                {/* Top 10 Individual Cricket MPR */}
                <Card title="Top 10 Individual Cricket MPR">
                  <RecordTable
                    headers={['Player', 'MPR', 'Date']}
                    rows={topIndMPR.map((r: any) => [
                      `${r.FirstName} ${r.LastName}`,
                      Number(r.PlayerMPR).toFixed(2),
                      r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—',
                    ])}
                  />
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {/* Hall of Fame tab */}
      {activeTab === 'halloffame' && (
        <>
          {!hallOfFame ? (
            <Card><p style={{ color: 'var(--color-text-light)', textAlign: 'center' }}>Loading Hall of Fame...</p></Card>
          ) : (
            <>
              <p style={{ textAlign: 'center', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-lg)', fontSize: '0.9rem' }}>
                All-time records across all league seasons (excludes Ad-Hoc play)
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--spacing-md)' }}>
                <Card title="⭐ Most All-Stars in a Season">
                  <HoFTable headers={['Player', 'Season', 'Count']} rows={(hallOfFame.mostAllStarsSeason || []).map((r: any) => [`${r.FirstName} ${r.LastName}`, r.SeasonName, r.AllStarCount])} />
                </Card>
                <Card title="🎯 Most OUTs in a Season">
                  <HoFTable headers={['Player', 'Season', 'Count']} rows={(hallOfFame.mostOutsSeason || []).map((r: any) => [`${r.FirstName} ${r.LastName}`, r.SeasonName, r.OutCount])} />
                </Card>
                <Card title="🔒 Most CLOSEs in a Season">
                  <HoFTable headers={['Player', 'Season', 'Count']} rows={(hallOfFame.mostClosesSeason || []).map((r: any) => [`${r.FirstName} ${r.LastName}`, r.SeasonName, r.CloseCount])} />
                </Card>
                <Card title="🎯 Highest IN Score">
                  <HoFTable headers={['Player', 'Score', 'Season', 'Date']} rows={(hallOfFame.highestIn || []).map((r: any) => [`${r.FirstName} ${r.LastName}`, r.InScore, r.SeasonName, r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—'])} />
                </Card>
                <Card title="🏆 Highest OUT Score">
                  <HoFTable headers={['Player', 'Score', 'Season', 'Date']} rows={(hallOfFame.highestOut || []).map((r: any) => [`${r.FirstName} ${r.LastName}`, r.OutScore, r.SeasonName, r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—'])} />
                </Card>
                <Card title="📊 Most Team Points in a Season">
                  <HoFTable headers={['Team', 'Season', 'Points']} rows={(hallOfFame.mostTeamPoints || []).map((r: any) => [r.TeamName, r.SeasonName, r.PointsFor])} />
                </Card>
                <Card title="🎯 Top Team 501 Game Avg">
                  <HoFTable headers={['Team', 'Avg', 'Date']} rows={(hallOfFame.topTeam501 || []).map((r: any) => [r.TeamName, Number(r.TeamAvg).toFixed(1), r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—'])} />
                </Card>
                <Card title="🎯 Top Team 301 Game Avg">
                  <HoFTable headers={['Team', 'Avg', 'Date']} rows={(hallOfFame.topTeam301 || []).map((r: any) => [r.TeamName, Number(r.TeamAvg).toFixed(1), r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—'])} />
                </Card>
                <Card title="🏏 Top Team Cricket MPR (Game)">
                  <HoFTable headers={['Team', 'MPR', 'Date']} rows={(hallOfFame.topTeamCricketMPR || []).map((r: any) => [r.TeamName, Number(r.TeamMPR).toFixed(2), r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—'])} />
                </Card>
                <Card title="🎯 Top Individual 501 Avg">
                  <HoFTable headers={['Player', 'Avg', 'Date']} rows={(hallOfFame.topIndividual501 || []).map((r: any) => [`${r.FirstName} ${r.LastName}`, Number(r.PlayerAvg).toFixed(1), r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—'])} />
                </Card>
                <Card title="🎯 Top Individual 301 Avg">
                  <HoFTable headers={['Player', 'Avg', 'Date']} rows={(hallOfFame.topIndividual301 || []).map((r: any) => [`${r.FirstName} ${r.LastName}`, Number(r.PlayerAvg).toFixed(1), r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—'])} />
                </Card>
                <Card title="🏏 Top Individual Cricket MPR">
                  <HoFTable headers={['Player', 'MPR', 'Date']} rows={(hallOfFame.topIndividualCricketMPR || []).map((r: any) => [`${r.FirstName} ${r.LastName}`, Number(r.PlayerMPR).toFixed(2), r.MatchDate ? new Date(r.MatchDate).toLocaleDateString() : '—'])} />
                </Card>
                <Card title="📈 Highest Individual 501 Season Avg">
                  <HoFTable headers={['Player', 'Season', 'Avg']} rows={(hallOfFame.highest501SeasonAvg || []).map((r: any) => [`${r.FirstName} ${r.LastName}`, r.SeasonName, Number(r.SeasonAvg).toFixed(1)])} />
                </Card>
                <Card title="📈 Highest Team 501 Season Avg">
                  <HoFTable headers={['Team', 'Season', 'Avg']} rows={(hallOfFame.highestTeam501SeasonAvg || []).map((r: any) => [r.TeamName, r.SeasonName, Number(r.SeasonAvg).toFixed(1)])} />
                </Card>
                <Card title="📈 Highest Team 301 Season Avg">
                  <HoFTable headers={['Team', 'Season', 'Avg']} rows={(hallOfFame.highestTeam301SeasonAvg || []).map((r: any) => [r.TeamName, r.SeasonName, Number(r.SeasonAvg).toFixed(1)])} />
                </Card>
                <Card title="📈 Highest Team Cricket Season MPR">
                  <HoFTable headers={['Team', 'Season', 'MPR']} rows={(hallOfFame.highestTeamCricketSeasonMPR || []).map((r: any) => [r.TeamName, r.SeasonName, Number(r.SeasonMPR).toFixed(2)])} />
                </Card>
              </div>
            </>
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

function RecordTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p style={{ color: 'var(--color-text-light)', textAlign: 'center', fontSize: '0.85rem' }}>No records yet.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>#</th>
            {headers.map(h => <th key={h} style={{ padding: '6px 8px' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{i + 1}</td>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '6px 8px', fontWeight: j === 1 ? 700 : 400, color: j === 1 ? 'var(--color-primary)' : undefined }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoFTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p style={{ color: 'var(--color-text-light)', textAlign: 'center', fontSize: '0.85rem' }}>No records yet.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', width: 32 }}>#</th>
            {headers.map(h => <th key={h} style={{ padding: '6px 8px' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: i === 0 ? 'rgba(255, 215, 0, 0.08)' : 'transparent' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600, color: i === 0 ? '#FFD700' : undefined }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '6px 8px',
                  fontWeight: j === headers.length - 1 ? 700 : 400,
                  color: j === headers.length - 1 ? 'var(--color-primary)' : undefined,
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortTh({ col, label, activeCol, dir, onClick }: {
  col: string; label: string; activeCol: string; dir: 'asc' | 'desc'; onClick: (col: string) => void;
}) {
  const isActive = activeCol === col;
  return (
    <th
      style={{
        padding: '8px',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        color: isActive ? 'var(--color-primary)' : undefined,
      }}
      onClick={() => onClick(col)}
    >
      {label} {isActive ? (dir === 'asc' ? '▲' : '▼') : ''}
    </th>
  );
}
