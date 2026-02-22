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

const MATCH_GAME_COUNT = 5;
const GAME_TYPES: { value: GameType; label: string }[] = [
  { value: 'X01', label: 'X01' },
  { value: 'Cricket', label: 'Cricket' },
  { value: 'Shanghai', label: 'Shanghai' },
  { value: 'RoundTheWorld', label: 'Round the World' },
];

export function LeaguePage() {
  const { seasonId } = useParams();
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [teamSeasons, setTeamSeasons] = useState<TeamSeason[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonModal, setSeasonModal] = useState(false);
  const [seasonForm, setSeasonForm] = useState({ SeasonName: '', StartDate: '', EndDate: '' });
  const [addTeamModal, setAddTeamModal] = useState(false);
  const [teamPlayer1, setTeamPlayer1] = useState('');
  const [teamPlayer2, setTeamPlayer2] = useState('');
  const [error, setError] = useState('');
  const [gameFormats, setGameFormats] = useState<SeasonGameFormat[]>([]);
  const [formatsDirty, setFormatsDirty] = useState(false);

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
      const s = await seasonService.create(seasonForm);
      setSeasonModal(false);
      setSeasonForm({ SeasonName: '', StartDate: '', EndDate: '' });
      navigate(`/league/${s.SeasonID}`);
    } catch (err: any) { setError(err.message); }
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
      await seasonService.addTeamToSeason(activeSeason.SeasonID, team.TeamID);
      setAddTeamModal(false);
      setTeamPlayer1('');
      setTeamPlayer2('');
      loadSeasonDetails(activeSeason.SeasonID);
    } catch (err: any) { setError(err.message); }
  };

  const generateSchedule = async () => {
    if (!activeSeason) return;
    try {
      const result = await seasonService.generateSchedule(activeSeason.SeasonID);
      alert(`Schedule generated: ${result.matchesCreated} matches created!`);
      loadSeasonDetails(activeSeason.SeasonID);
    } catch (err: any) { setError(err.message); }
  };

  const generatePlayoffs = async () => {
    if (!activeSeason) return;
    try {
      await seasonService.generatePlayoffs(activeSeason.SeasonID);
      alert('Playoffs generated!');
      loadSeasonDetails(activeSeason.SeasonID);
    } catch (err: any) { setError(err.message); }
  };

  const getDefaultFormats = (): SeasonGameFormat[] =>
    Array.from({ length: MATCH_GAME_COUNT }, (_, i) => ({
      SeasonGameFormatID: 0,
      SeasonID: 0,
      GameNumber: i + 1,
      GameType: i % 2 === 0 ? 'X01' as GameType : 'Cricket' as GameType,
      X01Target: i % 2 === 0 ? 501 : null,
      DoubleInRequired: false,
    }));

  const updateFormat = (idx: number, patch: Partial<SeasonGameFormat>) => {
    setGameFormats(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
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
      );
      setGameFormats(result);
      setFormatsDirty(false);
    } catch (err: any) { setError(err.message); }
  };

  // Group matches by round
  const matchesByRound = matches.reduce<Record<number, Match[]>>((acc, m) => {
    (acc[m.RoundNumber] = acc[m.RoundNumber] || []).push(m);
    return acc;
  }, {});

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
          <Button onClick={() => setSeasonModal(true)}>+ New Season</Button>
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
              </div>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                {activeSeason.Status === 'Setup' && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setAddTeamModal(true)}>+ Add Team</Button>
                    <Button size="sm" onClick={generateSchedule} disabled={teamSeasons.length < 2}>Generate Schedule</Button>
                  </>
                )}
                {activeSeason.Status === 'RoundRobin' && (
                  <Button size="sm" onClick={generatePlayoffs}>Generate Playoffs</Button>
                )}
              </div>
            </div>
          </Card>

          {/* Game Format Configuration (Setup only) */}
          {activeSeason.Status === 'Setup' && (
            <Card title="Match Game Format" style={{ marginBottom: 'var(--spacing-lg)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
                Configure the {MATCH_GAME_COUNT} games for each match. This format will auto-apply when starting new games.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {gameFormats.map((f, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-sm)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', flexWrap: 'wrap',
                  }}>
                    <span style={{ fontWeight: 700, minWidth: 70 }}>Game {f.GameNumber}</span>
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
                          style={{ minHeight: 'var(--tap-target)', padding: '4px 8px', width: 80 }}
                        >
                          {[301, 501, 701, 1001].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={f.DoubleInRequired}
                            onChange={e => updateFormat(idx, { DoubleInRequired: e.target.checked })}
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
                <Button size="sm" onClick={saveFormats} disabled={!formatsDirty}>
                  {formatsDirty ? 'Save Formats' : 'Formats Saved'}
                </Button>
              </div>
            </Card>
          )}

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
                          <strong>{ts.TeamName}</strong>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                            {ts.Player1FirstName} {ts.Player1LastName} & {ts.Player2FirstName} {ts.Player2LastName}
                          </div>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>{ts.GameWins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Schedule */}
          {Object.keys(matchesByRound).length > 0 && (
            <Card title="Schedule">
              {Object.entries(matchesByRound).map(([round, roundMatches]) => (
                <div key={round} style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <h4 style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', marginBottom: 'var(--spacing-sm)' }}>
                    {roundMatches[0]?.IsPlayoff ? `Playoff — ${roundMatches[0]?.PlayoffRound}` : `Round ${round}`}
                  </h4>
                  {roundMatches.map(m => (
                    <div
                      key={m.MatchID}
                      onClick={() => navigate(`/match/${m.MatchID}`)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: m.Status === 'Completed' ? 'var(--color-surface-hover)' : 'transparent',
                        border: '1px solid var(--color-border)',
                        marginBottom: 'var(--spacing-xs)',
                        cursor: 'pointer',
                        minHeight: 'var(--tap-target)',
                      }}
                    >
                      <span style={{ flex: 1, fontWeight: m.WinnerTeamSeasonID === m.HomeTeamSeasonID ? 700 : 400 }}>
                        {m.HomeTeamName}
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
                      }}>
                        {m.Status === 'Completed' ? `${m.HomeScore} – ${m.AwayScore}` :
                          m.Status === 'InProgress' ? 'LIVE' : 'vs'}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: m.WinnerTeamSeasonID === m.AwayTeamSeasonID ? 700 : 400 }}>
                        {m.AwayTeamName}
                      </span>
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

      {/* Add Team Modal — pick 2 players */}
      <Modal isOpen={addTeamModal} onClose={() => setAddTeamModal(false)} title="Create Team"
        footer={<><Button variant="ghost" onClick={() => setAddTeamModal(false)}>Cancel</Button><Button onClick={addTeam} disabled={!teamPlayer1 || !teamPlayer2 || teamPlayer1 === teamPlayer2}>Add Team</Button></>}>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
          Select two players to form a team.
        </p>
        <Select
          label="Player 1"
          options={allPlayers.filter(p => String(p.PlayerID) !== teamPlayer2).map(p => ({ value: p.PlayerID, label: `${p.FirstName} ${p.LastName}` }))}
          value={teamPlayer1}
          onChange={e => setTeamPlayer1(e.target.value)}
        />
        <div style={{ marginTop: 'var(--spacing-sm)' }}>
          <Select
            label="Player 2"
            options={allPlayers.filter(p => String(p.PlayerID) !== teamPlayer1).map(p => ({ value: p.PlayerID, label: `${p.FirstName} ${p.LastName}` }))}
            value={teamPlayer2}
            onChange={e => setTeamPlayer2(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
