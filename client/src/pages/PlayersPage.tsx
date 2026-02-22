import React, { useEffect, useState } from 'react';
import { playerService } from '../services/playerService';
import type { Player } from '../types';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { ImageCapture } from '../components/common/ImageCapture';

export function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState({ FirstName: '', LastName: '', Nickname: '', ImageData: null as string | null });
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const data = await playerService.getAll();
      setPlayers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditPlayer(null);
    setForm({ FirstName: '', LastName: '', Nickname: '', ImageData: null });
    setModalOpen(true);
  };

  const openEdit = (p: Player) => {
    setEditPlayer(p);
    setForm({ FirstName: p.FirstName, LastName: p.LastName, Nickname: p.Nickname || '', ImageData: p.ImageData });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.FirstName || !form.LastName) {
      setError('First and last name are required');
      return;
    }
    try {
      if (editPlayer) {
        await playerService.update(editPlayer.PlayerID, form);
      } else {
        await playerService.create({
          ...form,
          ImageData: form.ImageData ?? undefined,
        });
      }
      setModalOpen(false);
      setError('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this player?')) return;
    try {
      await playerService.delete(id);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>👤 Players</h1>
        <Button onClick={openNew}>+ Add Player</Button>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-md)' }}>{error}</p>}

      {loading ? (
        <p>Loading players...</p>
      ) : players.length === 0 ? (
        <Card><p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>No players yet. Add your first player!</p></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-md)' }}>
          {players.map(p => (
            <Card key={p.PlayerID}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                {p.ImageData ? (
                  <img src={p.ImageData} alt={p.FirstName} style={{
                    width: 56, height: 56, borderRadius: '50%', objectFit: 'cover',
                    border: '2px solid var(--color-border)',
                  }} />
                ) : (
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '1.2rem',
                  }}>
                    {p.FirstName[0]}{p.LastName[0]}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{p.FirstName} {p.LastName}</div>
                  {p.Nickname && <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>"{p.Nickname}"</div>}
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>✏️</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(p.PlayerID)}>🗑️</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editPlayer ? 'Edit Player' : 'Add Player'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </>
        }
      >
        <Input label="First Name" value={form.FirstName} onChange={e => setForm(f => ({ ...f, FirstName: e.target.value }))} />
        <Input label="Last Name" value={form.LastName} onChange={e => setForm(f => ({ ...f, LastName: e.target.value }))} />
        <Input label="Nickname" value={form.Nickname} onChange={e => setForm(f => ({ ...f, Nickname: e.target.value }))} placeholder="Optional" />
        <ImageCapture value={form.ImageData} onChange={img => setForm(f => ({ ...f, ImageData: img }))} />
      </Modal>
    </div>
  );
}
