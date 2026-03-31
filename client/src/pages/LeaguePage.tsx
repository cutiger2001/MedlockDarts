import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { seasonService } from '../services/seasonService';
import { matchService } from '../services/matchService';
import { teamService } from '../services/teamService';
import { playerService } from '../services/playerService';
import type { Season, TeamSeason, Match, Team, Player, SeasonGameFormat, GameType } from '../types';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { useSettings } from '../contexts/SettingsContext';

const MATCH_GAME_COUNT = 5;
const GAME_TYPES: { value: GameType; label: string }[] = [
  { value: 'X01', label: 'X01' },
  { value: 'Cricket', label: 'Cricket' },
  { value: 'Shanghai', label: 'Shanghai' },
  { value: 'RoundTheWorld', label: 'Round the World' },
];
const TEAM_COLORS = [
  '#c62828', '#ad1457', '#6a1b9a', '#4527a0', '#283593',
  '#1565c0', '#00838f', '#2e7d32', '#558b2f', '#f57f17',
  '#e65100', '#4e342e', '#37474f', '#000000',
];

interface ScheduleGroup {
  key: string;
  label: string;
  matches: Match[];
}

export function LeaguePage() {
  const { seasonId } = useParams();
  const navigate = useNavigate();
  const { adminUnlocked, adminPassword, lockAdmin } = useSettings();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [teamSeasons, setTeamSeasons] = useState<TeamSeason[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonModal, setSeasonModal] = useState(false);
  const [editingSeasonDetails, setEditingSeasonDetails] = useState(false);
  const [seasonForm, setSeasonForm] = useState({ SeasonName: '', StartDate: '', EndDate: '' });
  const [addTeamModal, setAddTeamModal] = useState(false);
  const [teamPlayer1, setTeamPlayer1] = useState('');
  const [teamPlayer2, setTeamPlayer2] = useState('');
  const [error, setError] = useState('');
  const [gameFormats, setGameFormats] = useState<SeasonGameFormat[]>([]);
  const [formatsDirty, setFormatsDirty] = useState(false);
  const [teamSetupModal, setTeamSetupModal] = useState(false);
  const [editingTeamSeason, setEditingTeamSeason] = useState<TeamSeason | null>(null);
  const [teamSetupForm, setTeamSetupForm] = useState({ TeamColor: '', TeamNickname: '' });
  const [addPlayerModal, setAddPlayerModal] = useState(false);
  const [newPlayerForm, setNewPlayerForm] = useState({ FirstName: '', LastName: '' });
  const [deleteSeasonModal, setDeleteSeasonModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [makeUpModal, setMakeUpModal] = useState(false);
  const [makeUpForm, setMakeUpForm] = useState({ MatchDate: '' });
  const [editingScheduleGroup, setEditingScheduleGroup] = useState<ScheduleGroup | null>(null);
  const [scheduleDateDraft, setScheduleDateDraft] = useState('');

  const hasSetupAccess = adminUnlocked;

  const handleActionError = (err: any) => {
    const message = err?.message || 'Something went wrong';
    setError(message);
    if (String(message).toLowerCase().includes('invalid setup password')) {
      lockAdmin();
    }
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return 'Date TBD';
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const loadSeasons = async () => {
    try {
      const s = await seasonService.getAll();
      setSeasons(s);
      return s;
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  };

  const loadSeasonDetails = async (id: number) => {
    try {
      setLoading(true);
      const [season, ts, m, t, gf, p] = await Promise.all([
        seasonService.getById(id),
        seasonService.getTeamSeasons(id),
        matchService.getBySeason(id),
        teamService.getAll(),
        seasonService.getGameFormats(id),
        playerService.getAll(),
      ]);
      setActiveSeason(season);
      setTeamSeasons(ts);
      setMatches(m);
      setAllTeams(t);
      setAllPlayers(p.filter((pl: Player) => pl.IsActive));
      setGameFormats(gf.length > 0 ? gf : getDefaultFormats());
      setFormatsDirty(gf.length === 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const s = await loadSeasons();
      if (seasonId) {
        await loadSeasonDetails(Number(seasonId));
      } else if (s.length > 0) {
        navigate(`/league/${s[0].SeasonID}`, { replace: true });
      } else {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  // Re-fetch data when the page regains focus (e.g. returning from a match)
  useEffect(() => {
    const handleFocus = () => {
      if (seasonId) loadSeasonDetails(Number(seasonId));
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  const createSeason = async () => {
    if (!seasonForm.SeasonName) { setError('Season name is required'); return; }
    try {
      const s = await seasonService.create(seasonForm, adminPassword);
      setSeasonModal(false);
      setSeasonForm({ SeasonName: '', StartDate: '', EndDate: '' });
      navigate(`/league/${s.SeasonID}`);
    } catch (err: any) { handleActionError(err); }
  };

  const addTeam = async () => {
    if (!teamPlayer1 || !teamPlayer2 || !activeSeason) return;
    if (teamPlayer1 === teamPlayer2) { setError('Choose two different players'); return; }
    try {
      const p1 = allPlayers.find(p => p.PlayerID === Number(teamPlayer1));
      const p2 = allPlayers.find(p => p.PlayerID === Number(teamPlayer2));
      const teamName = `${p1?.FirstName} ${p1?.LastName} & ${p2?.FirstName} ${p2?.LastName}`;
      // Find existing team with same players
      let team = allTeams.find(t =>
        (t.Player1ID === Number(teamPlayer1) && t.Player2ID === Number(teamPlayer2)) ||
        (t.Player1ID === Number(teamPlayer2) && t.Player2ID === Number(teamPlayer1))
      );
      if (!team) {
        team = await teamService.create({ TeamName: teamName, Player1ID: Number(teamPlayer1), Player2ID: Number(teamPlayer2) });
      }
      await seasonService.addTeamToSeason(activeSeason.SeasonID, team.TeamID, adminPassword);
      setAddTeamModal(false);
      setTeamPlayer1('');
      setTeamPlayer2('');
      loadSeasonDetails(activeSeason.SeasonID);
    } catch (err: any) { handleActionError(err); }
  };

  const generateSchedule = async () => {
    if (!activeSeason) return;
    try {
      const result = await seasonService.generateSchedule(activeSeason.SeasonID, adminPassword);
      alert(`Schedule generated: ${result.matchesCreated} matches created!`);
      loadSeasonDetails(activeSeason.SeasonID);
    } catch (err: any) { handleActionError(err); }
  };

  const generatePlayoffs = async () => {
    if (!activeSeason) return;
    try {
      await seasonService.generatePlayoffs(activeSeason.SeasonID, adminPassword);
      alert('Playoffs generated!');
      loadSeasonDetails(activeSeason.SeasonID);
    } catch (err: any) { handleActionError(err); }
  };

  const getDefaultFormats = (): SeasonGameFormat[] =>
    ([
      { GameType: 'X01' as GameType, X01Target: 501, DoubleInRequired: false },
      { GameType: 'X01' as GameType, X01Target: 501, DoubleInRequired: false },
      { GameType: 'Cricket' as GameType, X01Target: null, DoubleInRequired: false },
      { GameType: 'Cricket' as GameType, X01Target: null, DoubleInRequired: false },
      { GameType: 'X01' as GameType, X01Target: 301, DoubleInRequired: true },
    ]).map((format, index) => ({
      SeasonGameFormatID: 0,
      SeasonID: 0,
      GameNumber: index + 1,
      ...format,
    }));

  const updateFormat = (idx: number, patch: Partial<SeasonGameFormat>) => {
    setGameFormats(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
    setFormatsDirty(true);
  };

  const moveFormat = (idx: number, direction: -1 | 1) => {
    setGameFormats(prev => {
      const nextIndex = idx + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[nextIndex]] = [next[nextIndex], next[idx]];
      return next.map((format, index) => ({ ...format, GameNumber: index + 1 }));
    });
    setFormatsDirty(true);
  };

  const saveFormats = async () => {
    if (!activeSeason) return;
    try {
      const result = await seasonService.setGameFormats(
        activeSeason.SeasonID,
        gameFormats.map(f => ({
          GameNumber: f.GameNumber,
          GameType: f.GameType,
          X01Target: f.X01Target,
          DoubleInRequired: f.DoubleInRequired,
        })),
        adminPassword,
      );
      setGameFormats(result);
      setFormatsDirty(false);
    } catch (err: any) { handleActionError(err); }
  };

  const saveTeamSetup = async () => {
    if (!activeSeason || !editingTeamSeason) return;
    try {
      await seasonService.updateTeamSeason(activeSeason.SeasonID, editingTeamSeason.TeamSeasonID, {
        TeamColor: teamSetupForm.TeamColor || undefined,
        TeamNickname: teamSetupForm.TeamNickname || undefined,
      }, adminPassword);
      setTeamSetupModal(false);
      loadSeasonDetails(activeSeason.SeasonID);
      return true;
    } catch (err: any) { handleActionError(err); }
    return false;
  };

  const saveMakeUpRound = async () => {
    if (!activeSeason || !makeUpForm.MatchDate) {
      setError('Choose a date for the make-up week');
      return;
    }
    try {
      await seasonService.createMakeUpRound(activeSeason.SeasonID, {
        MatchDate: makeUpForm.MatchDate || undefined,
      }, adminPassword);
      setMakeUpModal(false);
      setMakeUpForm({ MatchDate: '' });
      await loadSeasonDetails(activeSeason.SeasonID);
    } catch (err: any) {
      handleActionError(err);
    }
  };

  const saveSeasonDetails = async () => {
    if (!activeSeason || !seasonForm.SeasonName.trim()) {
      setError('Season name is required');
      return;
    }
    try {
      const seasonUpdate: Partial<Season> = {
        SeasonName: seasonForm.SeasonName.trim(),
        StartDate: seasonForm.StartDate || null,
        EndDate: seasonForm.EndDate || null,
      };
      await seasonService.update(activeSeason.SeasonID, {
        ...seasonUpdate,
      }, adminPassword);
      setEditingSeasonDetails(false);
      await loadSeasons();
      await loadSeasonDetails(activeSeason.SeasonID);
    } catch (err: any) {
      handleActionError(err);
    }
  };

  const deleteSeason = async () => {
    if (!activeSeason) return;
    try {
      await seasonService.deleteSeason(activeSeason.SeasonID, adminPassword);
      setDeleteSeasonModal(false);
      setDeleteConfirmText('');
      const refreshed = await loadSeasons();
      if (refreshed.length > 0) {
        navigate(`/league/${refreshed[0].SeasonID}`);
      } else {
        navigate('/league');
        setActiveSeason(null);
        setMatches([]);
        setTeamSeasons([]);
      }
    } catch (err: any) {
      handleActionError(err);
    }
  };

  const sortedMatches = [...matches].sort((a, b) => {
    // Playoffs come first, then regular season
    if (a.IsPlayoff !== b.IsPlayoff) return Number(b.IsPlayoff) - Number(a.IsPlayoff);
    // Within playoffs, sort by round name (Semi before Final)
    if (a.IsPlayoff && b.IsPlayoff) {
      const order: Record<string, number> = { 'Semi': 1, 'Final': 2, 'Finals': 2 };
      const aOrd = order[a.PlayoffRound || ''] || 0;
      const bOrd = order[b.PlayoffRound || ''] || 0;
      if (aOrd !== bOrd) return aOrd - bOrd;
    }
    const aTime = a.MatchDate ? new Date(a.MatchDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.MatchDate ? new Date(b.MatchDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    if (a.RoundNumber !== b.RoundNumber) return a.RoundNumber - b.RoundNumber;
    return a.MatchID - b.MatchID;
  });

  const scheduleGroups = sortedMatches.reduce<ScheduleGroup[]>((acc, match) => {
    const label = match.PlayoffRound === 'MakeUp'
      ? 'Make-Up Round'
      : match.IsPlayoff
        ? `Playoff — ${match.PlayoffRound}`
        : `Round ${match.RoundNumber}`;
    const key = `${label}-${match.MatchDate || 'tbd'}`;
    const existing = acc.find(group => group.key === key);
    if (existing) {
      existing.matches.push(match);
    } else {
      acc.push({ key, label, matches: [match] });
    }
    return acc;
  }, []);

  const regularScheduleMatches = matches.filter(match => !match.IsPlayoff && match.PlayoffRound !== 'MakeUp');
  const canGeneratePlayoffs = regularScheduleMatches.length > 0 && regularScheduleMatches.every(match => match.Status === 'Completed');

  const saveScheduleDate = async () => {
    if (!activeSeason || !editingScheduleGroup || !scheduleDateDraft) {
      setError('Choose a date for this round');
      return;
    }
    try {
      const result = await seasonService.updateScheduleDates(
        activeSeason.SeasonID,
        editingScheduleGroup.matches.map(match => match.MatchID),
        scheduleDateDraft,
        adminPassword,
      );
      if (!result.updated) {
        setError('No schedule rows were updated');
        return;
      }
      setEditingScheduleGroup(null);
      setScheduleDateDraft('');
      await loadSeasonDetails(activeSeason.SeasonID);
    } catch (err: any) {
      handleActionError(err);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>🏆 League</h1>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
          {seasons.length > 0 && (
            <select
              value={activeSeason?.SeasonID || ''}
              onChange={e => navigate(`/league/${e.target.value}`)}
              style={{ minHeight: 'var(--tap-target)' }}
            >
              {seasons.map(s => <option key={s.SeasonID} value={s.SeasonID}>{s.SeasonName}</option>)}
            </select>
          )}
          {hasSetupAccess && <Button onClick={() => setSeasonModal(true)}>+ New Season</Button>}
        </div>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-md)' }}>{error}</p>}

      {!activeSeason ? (
        <Card>
          <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
            No seasons yet. Create your first season to get started!
          </p>
        </Card>
      ) : (
        <>
          {/* Status bar */}
          <Card style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
              <div>
                <strong>{activeSeason.SeasonName}</strong>
                <span style={{ marginLeft: 'var(--spacing-sm)', padding: '2px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700,
                  backgroundColor: activeSeason.Status === 'Completed' ? 'var(--color-success)' : 'var(--color-primary)',
                  color: '#fff',
                }}>
                  {activeSeason.Status}
                </span>
                <div style={{ marginTop: 'var(--spacing-xs)', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                  {activeSeason.StartDate ? `Starts ${formatDate(activeSeason.StartDate)}` : 'Start date not set'}
                  {activeSeason.EndDate ? ` • Ends ${formatDate(activeSeason.EndDate)}` : ''}
                </div>
              </div>
              {hasSetupAccess && (
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSeasonForm({
                        SeasonName: activeSeason.SeasonName || '',
                        StartDate: activeSeason.StartDate?.slice(0, 10) || '',
                        EndDate: activeSeason.EndDate?.slice(0, 10) || '',
                      });
                      setEditingSeasonDetails(true);
                    }}
                  >
                    Edit Season
                  </Button>
                  {activeSeason.Status === 'Setup' && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setAddTeamModal(true)} disabled={!hasSetupAccess}>+ Add Team</Button>
                      <Button size="sm" variant="ghost" onClick={() => setMakeUpModal(true)} disabled={!hasSetupAccess || teamSeasons.length < 2}>+ Make-Up Round</Button>
                      <Button size="sm" onClick={generateSchedule} disabled={!hasSetupAccess || teamSeasons.length < 2}>Generate Schedule</Button>
                    </>
                  )}
                  {activeSeason.Status === 'RoundRobin' && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setMakeUpModal(true)} disabled={!hasSetupAccess || teamSeasons.length < 2}>+ Make-Up Round</Button>
                      <Button size="sm" onClick={generatePlayoffs} disabled={!hasSetupAccess || !canGeneratePlayoffs}>Generate Playoffs</Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDeleteSeasonModal(true)} disabled={!hasSetupAccess}>
                    Delete Season
                  </Button>
                </div>
              )}
            </div>
            {hasSetupAccess && activeSeason.Status === 'RoundRobin' && !canGeneratePlayoffs && (
              <div style={{ marginTop: 'var(--spacing-sm)', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                Generate Playoffs becomes available after all regular schedule matches are completed.
              </div>
            )}
          </Card>

          {/* Game Format Configuration (Setup only) */}
          {activeSeason.Status === 'Setup' && hasSetupAccess && (
            <Card title="Match Game Format" style={{ marginBottom: 'var(--spacing-lg)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
                Review the exact match order below. This sequence auto-applies when new league games are started.
              </p>
              <div style={{ marginBottom: 'var(--spacing-md)', display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                {gameFormats.map(format => (
                  <div
                    key={format.GameNumber}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    G{format.GameNumber}: {format.GameType === 'X01' ? `${format.X01Target || 501}${format.DoubleInRequired ? ' DI' : ''}` : format.GameType}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {gameFormats.map((f, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-sm)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', flexWrap: 'wrap',
                  }}>
                    <span style={{ fontWeight: 700, minWidth: 70 }}>Game {f.GameNumber}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button size="sm" variant="ghost" onClick={() => moveFormat(idx, -1)} disabled={!hasSetupAccess || idx === 0}>↑</Button>
                      <Button size="sm" variant="ghost" onClick={() => moveFormat(idx, 1)} disabled={!hasSetupAccess || idx === gameFormats.length - 1}>↓</Button>
                    </div>
                    <select
                      value={f.GameType}
                      onChange={e => {
                        const gt = e.target.value as GameType;
                        updateFormat(idx, {
                          GameType: gt,
                          X01Target: gt === 'X01' ? 501 : null,
                          DoubleInRequired: false,
                        });
                      }}
                      disabled={!hasSetupAccess}
                      style={{ minHeight: 'var(--tap-target)', padding: '4px 8px', flex: '1 1 120px' }}
                    >
                      {GAME_TYPES.map(gt => (
                        <option key={gt.value} value={gt.value}>{gt.label}</option>
                      ))}
                    </select>
                    {f.GameType === 'X01' && (
                      <>
                        <select
                          value={f.X01Target || 501}
                          onChange={e => updateFormat(idx, { X01Target: Number(e.target.value) })}
                          disabled={!hasSetupAccess}
                          style={{ minHeight: 'var(--tap-target)', padding: '4px 8px', width: 80 }}
                        >
                          {[301, 501, 701, 1001].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={f.DoubleInRequired}
                            onChange={e => updateFormat(idx, { DoubleInRequired: e.target.checked })}
                            disabled={!hasSetupAccess}
                            style={{ width: 18, height: 18 }}
                          />
                          DI
                        </label>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 'var(--spacing-md)', display: 'flex', gap: 'var(--spacing-sm)' }}>
                <Button size="sm" onClick={saveFormats} disabled={!hasSetupAccess || !formatsDirty}>
                  {formatsDirty ? 'Save Formats' : 'Formats Saved'}
                </Button>
              </div>
            </Card>
          )}

          {/* Champion banner for completed season — above standings */}
          {activeSeason.Status === 'Completed' && (() => {
            // Use ChampionTeamSeasonID from DB first, fallback to finals match winner, then top of standings
            let championTs: TeamSeason | undefined;
            if (activeSeason.ChampionTeamSeasonID) {
              championTs = teamSeasons.find(ts => ts.TeamSeasonID === activeSeason.ChampionTeamSeasonID);
            }
            if (!championTs) {
              const finalsMatch = matches.find(m => m.IsPlayoff && (m.PlayoffRound === 'Finals' || m.PlayoffRound === 'Final') && m.Status === 'Completed' && m.WinnerTeamSeasonID);
              if (finalsMatch) {
                championTs = teamSeasons.find(ts => ts.TeamSeasonID === finalsMatch.WinnerTeamSeasonID);
              }
            }
            if (!championTs) return null;
            return (
              <Card style={{ marginBottom: 'var(--spacing-lg)', textAlign: 'center', border: '2px solid #FFD700', backgroundColor: 'var(--color-surface)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 'var(--spacing-xs)' }}>🏆</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: 2 }}>Season Champion</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--color-primary)' }}>
                  {championTs.TeamNickname || championTs.TeamName}
                </div>
                {championTs.TeamNickname && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>{championTs.TeamName}</div>
                )}
                {!championTs.TeamNickname && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                    {championTs.Player1FirstName} {championTs.Player1LastName} & {championTs.Player2FirstName} {championTs.Player2LastName}
                  </div>
                )}
              </Card>
            );
          })()}

          {/* Standings */}
          <Card title="Standings" style={{ marginBottom: 'var(--spacing-lg)' }}>
            {teamSeasons.length === 0 ? (
              <p style={{ color: 'var(--color-text-light)' }}>No teams registered yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>#</th>
                      <th style={{ padding: '8px' }}>Team</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Game Wins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamSeasons.map((ts, i) => (
                      <tr key={ts.TeamSeasonID} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                            {ts.TeamColor && (
                              <div style={{
                                width: 14, height: 14, borderRadius: '50%',
                                backgroundColor: ts.TeamColor, flexShrink: 0,
                                border: '1px solid var(--color-border)',
                              }} />
                            )}
                            <div>
                              <strong>{ts.TeamNickname || ts.TeamName}</strong>
                              {ts.TeamNickname && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>{ts.TeamName}</div>
                              )}
                              {!ts.TeamNickname && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                                  {ts.Player1FirstName} {ts.Player1LastName} & {ts.Player2FirstName} {ts.Player2LastName}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>{ts.GameWins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {teamSeasons.length > 0 && (
              <div style={{ marginTop: 'var(--spacing-md)', textAlign: 'center' }}>
                {hasSetupAccess && (
                  <Button size="sm" variant="ghost" onClick={() => setTeamSetupModal(true)}>⚙️ Manage Teams</Button>
                )}
              </div>
            )}
          </Card>



          {/* Schedule */}
          {scheduleGroups.length > 0 && (
            <Card title="Schedule">
              {scheduleGroups.map(group => (
                <div key={group.key} style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                    <h4 style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', marginBottom: 0 }}>
                      {group.label}
                      <span style={{ marginLeft: 'var(--spacing-sm)', fontWeight: 400 }}>
                        {formatDate(group.matches[0]?.MatchDate)}
                      </span>
                    </h4>
                    {hasSetupAccess && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingScheduleGroup(group);
                          setScheduleDateDraft(group.matches[0]?.MatchDate?.slice(0, 10) || '');
                        }}
                      >
                        Edit Date
                      </Button>
                    )}
                  </div>
                  {group.matches.map(m => (
                    <div
                      key={m.MatchID}
                      onClick={() => {
                        if (m.PlayoffRound !== 'MakeUp') navigate(`/match/${m.MatchID}`);
                      }}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        gap: 'var(--spacing-sm)',
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: m.PlayoffRound === 'MakeUp'
                          ? 'var(--color-surface)'
                          : m.Status === 'Completed' ? 'var(--color-surface-hover)' : 'transparent',
                        border: m.PlayoffRound === 'MakeUp' ? '1px dashed var(--color-border)' : '1px solid var(--color-border)',
                        marginBottom: 'var(--spacing-xs)',
                        cursor: m.PlayoffRound === 'MakeUp' ? 'default' : 'pointer',
                        minHeight: 'var(--tap-target)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{
                        flex: m.PlayoffRound === 'MakeUp' ? '1 1 100%' : 1,
                        fontWeight: m.PlayoffRound === 'MakeUp' || m.WinnerTeamSeasonID === m.HomeTeamSeasonID ? 700 : 400,
                        textAlign: m.PlayoffRound === 'MakeUp' ? 'center' : 'left',
                        color: m.PlayoffRound === 'MakeUp' ? 'var(--color-text-light)' : undefined,
                      }}>
                        {m.PlayoffRound === 'MakeUp'
                          ? 'Reserved make-up week'
                          : m.HomeTeamName}
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                        fontSize: m.Status === 'Completed' ? '1rem' : '0.75rem',
                        fontWeight: 700,
                        backgroundColor: m.Status === 'Completed' ? 'var(--color-surface)' :
                          m.Status === 'InProgress' ? 'var(--color-warning)' : 'var(--color-border)',
                        color: m.Status === 'Completed' ? 'var(--color-text)' :
                          m.Status === 'Scheduled' ? 'var(--color-text)' : '#fff',
                        minWidth: 50, textAlign: 'center',
                        display: m.PlayoffRound === 'MakeUp' ? 'none' : undefined,
                      }}>
                        {m.Status === 'Completed' ? `${m.HomeScore} – ${m.AwayScore}` :
                          m.Status === 'InProgress' ? 'LIVE' : 'vs'}
                      </span>
                      {m.PlayoffRound !== 'MakeUp' && (
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: m.WinnerTeamSeasonID === m.AwayTeamSeasonID ? 700 : 400 }}>
                        {m.AwayTeamName}
                      </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {/* New Season Modal */}
      <Modal isOpen={seasonModal} onClose={() => setSeasonModal(false)} title="New Season"
        footer={<><Button variant="ghost" onClick={() => setSeasonModal(false)}>Cancel</Button><Button onClick={createSeason}>Create</Button></>}>
        <Input label="Season Name" value={seasonForm.SeasonName} onChange={e => setSeasonForm(f => ({ ...f, SeasonName: e.target.value }))} placeholder="e.g. Spring 2026" />
        <Input label="Start Date" type="date" value={seasonForm.StartDate} onChange={e => setSeasonForm(f => ({ ...f, StartDate: e.target.value }))} />
        <Input label="End Date" type="date" value={seasonForm.EndDate} onChange={e => setSeasonForm(f => ({ ...f, EndDate: e.target.value }))} />
      </Modal>

      <Modal
        isOpen={editingSeasonDetails}
        onClose={() => setEditingSeasonDetails(false)}
        title="Edit Season"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingSeasonDetails(false)}>Cancel</Button>
            <Button onClick={saveSeasonDetails}>Save Season</Button>
          </>
        }
      >
        <Input
          label="Season Name"
          value={seasonForm.SeasonName}
          onChange={e => setSeasonForm(f => ({ ...f, SeasonName: e.target.value }))}
        />
        <Input
          label="Start Date"
          type="date"
          value={seasonForm.StartDate}
          onChange={e => setSeasonForm(f => ({ ...f, StartDate: e.target.value }))}
        />
        <Input
          label="End Date"
          type="date"
          value={seasonForm.EndDate}
          onChange={e => setSeasonForm(f => ({ ...f, EndDate: e.target.value }))}
        />
      </Modal>

      <Modal
        isOpen={deleteSeasonModal}
        onClose={() => setDeleteSeasonModal(false)}
        title="Delete Season"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteSeasonModal(false)}>Cancel</Button>
            <Button
              onClick={deleteSeason}
              disabled={deleteConfirmText !== 'DELETE'}
              style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}
            >
              Delete Season
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--color-danger)', fontWeight: 700 }}>
          This permanently deletes the season, schedule, games, and recorded scoring data.
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          Type <strong>DELETE</strong> to confirm.
        </p>
        <Input
          label="Confirmation"
          value={deleteConfirmText}
          onChange={e => setDeleteConfirmText(e.target.value)}
          placeholder="DELETE"
        />
      </Modal>

      <Modal
        isOpen={makeUpModal}
        onClose={() => setMakeUpModal(false)}
        title="Add Make-Up Round"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMakeUpModal(false)}>Cancel</Button>
            <Button onClick={saveMakeUpRound} disabled={!makeUpForm.MatchDate}>
              Save Make-Up Round
            </Button>
          </>
        }
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
          Add a reserved make-up week. Later scheduled rounds will move back by one week.
        </p>
        <div style={{ marginTop: 'var(--spacing-sm)' }}>
          <Input
            label="Make-Up Week Date"
            type="date"
            value={makeUpForm.MatchDate}
            onChange={e => setMakeUpForm(f => ({ ...f, MatchDate: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Add Team Modal — pick 2 players */}
      <Modal
        isOpen={!!editingScheduleGroup}
        onClose={() => {
          setEditingScheduleGroup(null);
          setScheduleDateDraft('');
        }}
        title={`Edit ${editingScheduleGroup?.label || 'Round'} Date`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setEditingScheduleGroup(null);
                setScheduleDateDraft('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveScheduleDate} disabled={!scheduleDateDraft}>
              Save Date
            </Button>
          </>
        }
      >
        <Input
          label="Round Date"
          type="date"
          value={scheduleDateDraft}
          onChange={e => setScheduleDateDraft(e.target.value)}
        />
      </Modal>

      <Modal isOpen={addTeamModal} onClose={() => setAddTeamModal(false)} title="Create Team"
        footer={<><Button variant="ghost" onClick={() => setAddTeamModal(false)}>Cancel</Button><Button onClick={addTeam} disabled={!teamPlayer1 || !teamPlayer2 || teamPlayer1 === teamPlayer2}>Add Team</Button></>}>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
          Select two players to form a team.
        </p>
        {(() => {
          // Collect player IDs already assigned to teams in this season
          const usedPlayerIds = new Set<number>();
          for (const ts of teamSeasons) {
            const team = allTeams.find(t => t.TeamID === ts.TeamID);
            if (team) {
              usedPlayerIds.add(team.Player1ID);
              if (team.Player2ID) usedPlayerIds.add(team.Player2ID);
            }
          }
          const availablePlayers = allPlayers.filter(p => !usedPlayerIds.has(p.PlayerID))
            .sort((a, b) => a.FirstName.localeCompare(b.FirstName) || a.LastName.localeCompare(b.LastName));
          return (
            <>
              <Select
                label="Player 1"
                options={availablePlayers
                  .filter(p => String(p.PlayerID) !== teamPlayer2)
                  .map(p => ({ value: p.PlayerID, label: `${p.FirstName} ${p.LastName}` }))}
                value={teamPlayer1}
                onChange={e => setTeamPlayer1(e.target.value)}
              />
              <div style={{ marginTop: 'var(--spacing-sm)' }}>
                <Select
                  label="Player 2"
                  options={availablePlayers
                    .filter(p => String(p.PlayerID) !== teamPlayer1)
                    .map(p => ({ value: p.PlayerID, label: `${p.FirstName} ${p.LastName}` }))}
                  value={teamPlayer2}
                  onChange={e => setTeamPlayer2(e.target.value)}
                />
              </div>
            </>
          );
        })()}
        <div style={{ marginTop: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
          <Button variant="ghost" size="sm" onClick={() => setAddPlayerModal(true)}>+ Add New Player</Button>
        </div>
      </Modal>

      {/* Quick Add Player Modal (from Create Team) */}
      <Modal isOpen={addPlayerModal} onClose={() => setAddPlayerModal(false)} title="Add Player"
        footer={<><Button variant="ghost" onClick={() => setAddPlayerModal(false)}>Cancel</Button><Button onClick={async () => {
          if (!newPlayerForm.FirstName) { setError('First name is required'); return; }
          try {
            await playerService.create({ FirstName: newPlayerForm.FirstName, LastName: newPlayerForm.LastName });
            const p = await playerService.getAll();
            setAllPlayers(p.filter((pl: Player) => pl.IsActive));
            setNewPlayerForm({ FirstName: '', LastName: '' });
            setAddPlayerModal(false);
          } catch (err: any) { setError(err.message); }
        }}>Save</Button></>}>
        <Input label="First Name *" value={newPlayerForm.FirstName} onChange={e => setNewPlayerForm(f => ({ ...f, FirstName: e.target.value }))} placeholder="First name" />
        <Input label="Last Name" value={newPlayerForm.LastName} onChange={e => setNewPlayerForm(f => ({ ...f, LastName: e.target.value }))} placeholder="Optional" />
      </Modal>

      {/* Team Setup Modal — list all teams, pick one to edit */}
      <Modal isOpen={teamSetupModal && !editingTeamSeason} onClose={() => setTeamSetupModal(false)}
        title="Manage Teams">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
          {teamSeasons.map(ts => (
            <div key={ts.TeamSeasonID}
              onClick={() => { setEditingTeamSeason(ts); setTeamSetupForm({ TeamColor: ts.TeamColor || '', TeamNickname: ts.TeamNickname || '' }); }}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: 'var(--spacing-sm) var(--spacing-md)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', minHeight: 'var(--tap-target)',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                {ts.TeamColor && <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: ts.TeamColor, border: '1px solid var(--color-border)' }} />}
                <span style={{ fontWeight: 600 }}>{ts.TeamNickname || ts.TeamName}</span>
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>⚙️</span>
            </div>
          ))}
        </div>
      </Modal>

      {/* Team Setup Edit Modal — color picker + nickname */}
      <Modal isOpen={!!editingTeamSeason} onClose={() => setEditingTeamSeason(null)}
        title={`Setup: ${editingTeamSeason?.TeamNickname || editingTeamSeason?.TeamName || 'Team'}`}
        footer={<><Button variant="ghost" onClick={() => setEditingTeamSeason(null)}>Cancel</Button><Button onClick={async () => {
          const ok = await saveTeamSetup();
          if (ok) setEditingTeamSeason(null);
        }}>Save</Button></>}>
        <Input
          label="Team Nickname"
          value={teamSetupForm.TeamNickname}
          onChange={e => setTeamSetupForm(f => ({ ...f, TeamNickname: e.target.value }))}
          placeholder="e.g. The Sharks"
        />
        <div style={{ marginTop: 'var(--spacing-md)' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: 'var(--spacing-xs)' }}>
            Team Color
          </label>
          <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
            {TEAM_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setTeamSetupForm(f => ({ ...f, TeamColor: c }))}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  backgroundColor: c, border: teamSetupForm.TeamColor === c ? '3px solid #FFD700' : '2px solid var(--color-border)',
                  cursor: 'pointer', outline: 'none',
                }}
              />
            ))}
          </div>
          {teamSetupForm.TeamColor && (
            <div style={{ marginTop: 'var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: teamSetupForm.TeamColor, border: '1px solid var(--color-border)' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>{teamSetupForm.TeamColor}</span>
              <button
                onClick={() => setTeamSetupForm(f => ({ ...f, TeamColor: '' }))}
                style={{ fontSize: '0.8rem', color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
