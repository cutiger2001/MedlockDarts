import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useSettings } from '../contexts/SettingsContext';

export function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const [newScore, setNewScore] = useState('');

  const addFastScore = () => {
    const val = Number(newScore);
    if (!val || val < 0 || val > 180 || settings.fastEntryScores.includes(val)) return;
    updateSettings({ fastEntryScores: [...settings.fastEntryScores, val].sort((a, b) => a - b) });
    setNewScore('');
  };

  const removeFastScore = (score: number) => {
    updateSettings({ fastEntryScores: settings.fastEntryScores.filter(s => s !== score) });
  };

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      {/* X01 Scoring Mode */}
      <Card title="X01 Scoring Mode" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
          Choose how scores are entered during X01 games.
        </p>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
          <Button
            variant={settings.x01ScoringMode === 'dart' ? 'primary' : 'ghost'}
            onClick={() => updateSettings({ x01ScoringMode: 'dart' })}
            style={{ flex: '1 1 150px', minHeight: 60 }}
          >
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Individual Dart</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: 2 }}>
              Select each dart segment
            </div>
          </Button>
          <Button
            variant={settings.x01ScoringMode === 'turn' ? 'primary' : 'ghost'}
            onClick={() => updateSettings({ x01ScoringMode: 'turn' })}
            style={{ flex: '1 1 150px', minHeight: 60 }}
          >
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Turn Total</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: 2 }}>
              Enter round score via number pad
            </div>
          </Button>
        </div>
      </Card>

      {/* Fast Entry Scores */}
      <Card title="Fast Entry Scores" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
          Quick-tap buttons shown in turn-total scoring mode.
        </p>
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap', marginBottom: 'var(--spacing-md)' }}>
          {settings.fastEntryScores.map(s => (
            <div key={s} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
              fontWeight: 700, fontSize: '1rem',
            }}>
              {s}
              <button
                onClick={() => removeFastScore(s)}
                style={{
                  background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
                  fontSize: '1rem', padding: '0 2px', opacity: 0.7,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <input
            type="number"
            value={newScore}
            onChange={e => setNewScore(e.target.value)}
            placeholder="Add score..."
            min={0}
            max={180}
            style={{ width: 120, minHeight: 'var(--tap-target)' }}
            onKeyDown={e => e.key === 'Enter' && addFastScore()}
          />
          <Button size="sm" onClick={addFastScore}>Add</Button>
        </div>
      </Card>
    </div>
  );
}
