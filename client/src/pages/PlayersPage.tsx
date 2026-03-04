import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { playerService } from '../services/playerService';
import type { Player } from '../types';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { ImageCapture } from '../components/common/ImageCapture';

export function PlayersPage() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState({ FirstName: '', LastName: '', Nickname: '', ImageData: null as string | null, ThemeColor: null as string | null });
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = showInactive
        ? await playerService.getAllIncludingInactive()
        : await playerService.getAll();
      setPlayers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [showInactive]);

  const openNew = () => {
    setEditPlayer(null);
    setForm({ FirstName: '', LastName: '', Nickname: '', ImageData: null, ThemeColor: null });
    setModalOpen(true);
  };

  const openEdit = (p: Player) => {
    setEditPlayer(p);
    setForm({ FirstName: p.FirstName, LastName: p.LastName, Nickname: p.Nickname || '', ImageData: p.ImageData, ThemeColor: p.ThemeColor || null });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.FirstName.trim()) {
      setError('First name is required');
      return;
    }
    try {
      if (editPlayer) {
        await playerService.update(editPlayer.PlayerID, form);
      } else {
        await playerService.create({
          ...form,
          ImageData: form.ImageData ?? undefined,
          ThemeColor: form.ThemeColor ?? undefined,
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
    if (!confirm('Remove this player? (Players with league history will be hidden instead of deleted)')) return;
    try {
      await playerService.delete(id);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReactivate = async (id: number) => {
    try {
      await playerService.reactivate(id);
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
      ) : players.filter(p => p.IsActive).length === 0 && !showInactive ? (
        <Card><p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>No players yet. Add your first player!</p></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-md)' }}>
          {players.filter(p => p.IsActive).map(p => (
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
                    background: p.ThemeColor || 'var(--color-primary)', color: p.ThemeColor ? '#fff' : 'var(--color-text-on-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '1.2rem',
                  }}>
                    {p.FirstName[0]}{(p.LastName || '')[0] || ''}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{p.FirstName} {p.LastName}</div>
                  {p.Nickname && <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>"{p.Nickname}"</div>}
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/stats/player/${p.PlayerID}`)} title="View Stats">📊</Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>✏️</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(p.PlayerID)}>🗑️</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Inactive/Hidden players section */}
      {showInactive && players.filter(p => !p.IsActive).length > 0 && (
        <div style={{ marginTop: 'var(--spacing-lg)' }}>
          <h3 style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', marginBottom: 'var(--spacing-sm)' }}>
            Hidden Players
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-md)' }}>
            {players.filter(p => !p.IsActive).map(p => (
              <Card key={p.PlayerID} style={{ opacity: 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: p.ThemeColor || 'var(--color-surface-hover)', color: p.ThemeColor ? '#fff' : 'var(--color-text-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '1.2rem',
                  }}>
                    {p.FirstName[0]}{(p.LastName || '')[0] || ''}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{p.FirstName} {p.LastName}</div>
                    {p.Nickname && <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>"{p.Nickname}"</div>}
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>Deactivated</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleReactivate(p.PlayerID)} title="Reactivate">♻️</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Show/hide inactive players toggle */}
      <div style={{ textAlign: 'center', marginTop: 'var(--spacing-lg)' }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowInactive(prev => !prev)}
          style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}
        >
          {showInactive ? '👁️ Hide Inactive Players' : '👁️‍🗨️ Show Hidden Players'}
        </Button>
      </div>

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
        <Input label="First Name *" value={form.FirstName} onChange={e => setForm(f => ({ ...f, FirstName: e.target.value }))} />
        <Input label="Last Name" value={form.LastName} onChange={e => setForm(f => ({ ...f, LastName: e.target.value }))} placeholder="Optional" />
        <Input label="Nickname" value={form.Nickname} onChange={e => setForm(f => ({ ...f, Nickname: e.target.value }))} placeholder="Optional" />
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--spacing-xs)', color: 'var(--color-text-light)' }}>
            Player Color
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {['#c62828', '#ad1457', '#6a1b9a', '#283593', '#0277bd', '#00695c', '#2e7d32', '#f57f17', '#e65100', '#4e342e', '#37474f', '#1565c0', '#7b1fa2', '#d84315'].map(c => (
              <button
                key={c}
                onClick={() => setForm(f => ({ ...f, ThemeColor: f.ThemeColor === c ? null : c }))}
                style={{
                  width: 36, height: 36, borderRadius: '50%', backgroundColor: c,
                  border: form.ThemeColor === c ? '3px solid #FFD700' : '2px solid var(--color-border)',
                  cursor: 'pointer', boxShadow: form.ThemeColor === c ? '0 0 0 2px #FFD700' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '0.9rem', fontWeight: 700,
                }}
              >
                {form.ThemeColor === c ? '✓' : ''}
              </button>
            ))}
          </div>
          {form.ThemeColor && (
            <button
              onClick={() => setForm(f => ({ ...f, ThemeColor: null }))}
              style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--color-text-light)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Clear color
            </button>
          )}
        </div>
        <ImageCapture value={form.ImageData} onChange={img => setForm(f => ({ ...f, ImageData: img }))} />
      </Modal>
    </div>
  );
}
