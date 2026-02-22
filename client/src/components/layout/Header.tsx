import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeName } from '../../themes';

export function Header() {
  const { themeName, setTheme } = useTheme();
  const location = useLocation();

  const navItems = [
    { path: '/', label: '🏠 Home' },
    { path: '/live', label: '📺 Live' },
    { path: '/players', label: '👤 Players' },
    { path: '/league', label: '🏆 League' },
    { path: '/stats', label: '📊 Stats' },
  ];

  return (
    <header style={{
      backgroundColor: 'var(--color-primary)',
      color: 'var(--color-text-on-primary)',
      boxShadow: 'var(--shadow-md)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{ color: 'inherit', fontWeight: 700, fontSize: '1.3rem' }}>
          🎯 Darts League
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
          <select
            value={themeName}
            onChange={e => setTheme(e.target.value as ThemeName)}
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: 'inherit',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              fontSize: '0.85rem',
              minHeight: 'auto',
            }}
          >
            <option value="default" style={{ color: '#000' }}>🇺🇸 Default</option>
            <option value="dj" style={{ color: '#000' }}>💛 DJ</option>
            <option value="td" style={{ color: '#000' }}>🧡 TD</option>
          </select>
        </div>
      </div>

      <nav style={{
        maxWidth: 1200, margin: '0 auto',
        display: 'flex',
        overflowX: 'auto',
        gap: 'var(--spacing-xs)',
        padding: '0 var(--spacing-md) var(--spacing-sm)',
      }}>
        {navItems.map(item => {
          const active = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                color: 'inherit',
                padding: 'var(--spacing-sm) var(--spacing-md)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.9rem',
                fontWeight: active ? 700 : 400,
                backgroundColor: active ? 'rgba(255,255,255,0.2)' : 'transparent',
                whiteSpace: 'nowrap',
                minHeight: 'var(--tap-target)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
