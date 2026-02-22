import React, { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  title?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function Card({ children, title, style, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        padding: 'var(--spacing-lg)',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'box-shadow 0.15s',
        ...style,
      }}
    >
      {title && (
        <h3 style={{
          fontSize: '1.1rem',
          fontWeight: 600,
          marginBottom: 'var(--spacing-md)',
          color: 'var(--color-primary)',
        }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
