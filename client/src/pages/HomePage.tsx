import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/common/Card';

export function HomePage() {
  const actions = [
    { to: '/play', icon: '🎯', label: 'Play A Game', desc: 'Start a quick game', primary: true },
    { to: '/live', icon: '📺', label: 'Live', desc: 'Watch in-progress matches', primary: false },
    { to: '/league', icon: '🏆', label: 'League', desc: 'Seasons, schedules & matches', primary: false },
    { to: '/stats', icon: '📊', label: 'Statistics', desc: 'Player & team stats', primary: false },
    { to: '/players', icon: '👤', label: 'Players', desc: 'Manage players and profiles', primary: false },
    { to: '/settings', icon: '⚙️', label: 'Settings', desc: 'App preferences', primary: false },
  ];

  return (
    <div>
      <h1 className="page-title">🎯 Darts League</h1>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 'var(--spacing-lg)',
      }}>
        {actions.map(a => (
          <Link key={a.to} to={a.to} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Card style={{
              textAlign: 'center',
              padding: 'var(--spacing-xl)',
              transition: 'transform 0.15s, box-shadow 0.15s',
              border: a.primary ? '2px solid var(--color-primary)' : undefined,
            }}>
              <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>{a.icon}</div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                {a.label}
              </h2>
              <p style={{ color: 'var(--color-text-light)', marginTop: 'var(--spacing-xs)' }}>
                {a.desc}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
