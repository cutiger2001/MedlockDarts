import React, { useEffect, useState } from 'react';
import { teamService } from '../services/teamService';
import { playerService } from '../services/playerService';
import type { Team, Player } from '../types';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [form, setForm] = useState({ TeamName: '', Player1ID: '', Player2ID: '' });
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [t, p] = await Promise.all([teamService.getAll(), playerService.getAll()]);
      setTeams(t);
      setPlayers(p);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditTeam(null);
    setForm({ TeamName: '', Player1ID: '', Player2ID: '' });
    setModalOpen(true);
  };

  const openEdit = (t: Team) => {
    setEditTeam(t);
    setForm({ TeamName: t.TeamName, Player1ID: String(t.Player1ID), Player2ID: String(t.Player2ID) });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.TeamName || !form.Player1ID || !form.Player2ID) {
      setError('All fields are required');
      return;
    }
    if (form.Player1ID === form.Player2ID) {
      setError('A team must have two different players');
      return;
    }
    try {
      const data = { TeamName: form.TeamName, Player1ID: Number(form.Player1ID), Player2ID: Number(form.Player2ID) };
      if (editTeam) {
        await teamService.update(editTeam.TeamID, data);
      } else {
        await teamService.create(data);
      }
      setModalOpen(false);
      setError('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this team?')) return;
    try {
      await teamService.delete(id);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const playerOptions = players.map(p => ({
    value: p.PlayerID,
    label: `${p.FirstName} ${p.LastName}${p.Nickname ? ` "${p.Nickname}"` : ''}`,
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>👥 Teams</h1>
        <Button onClick={openNew} disabled={players.length < 2}>+ Add Team</Button>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-md)' }}>{error}</p>}

      {loading ? (
        <p>Loading teams...</p>
      ) : teams.length === 0 ? (
        <Card><p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>No teams yet. Add players first, then create a team!</p></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--spacing-md)' }}>
          {teams.map(t => (
            <Card key={t.TeamID}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-primary)' }}>{t.TeamName}</div>
                  <div style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', marginTop: 4 }}>
                    {t.Player1FirstName} {t.Player1LastName} & {t.Player2FirstName} {t.Player2LastName}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>✏️</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(t.TeamID)}>🗑️</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTeam ? 'Edit Team' : 'Add Team'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </>
        }
      >
        <Input label="Team Name" value={form.TeamName} onChange={e => setForm(f => ({ ...f, TeamName: e.target.value }))} />
        <Select label="Player 1" options={playerOptions} value={form.Player1ID} onChange={e => setForm(f => ({ ...f, Player1ID: e.target.value }))} />
        <Select label="Player 2" options={playerOptions} value={form.Player2ID} onChange={e => setForm(f => ({ ...f, Player2ID: e.target.value }))} />
      </Modal>
    </div>
  );
}
