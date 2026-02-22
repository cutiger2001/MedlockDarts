import React, { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, style, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div style={{ marginBottom: 'var(--spacing-md)', ...style }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            marginBottom: 'var(--spacing-xs)',
            fontWeight: 600,
            fontSize: '0.9rem',
            color: 'var(--color-text)',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          width: '100%',
          borderColor: error ? 'var(--color-danger)' : undefined,
        }}
        {...props}
      />
      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: '4px' }}>
          {error}
        </p>
      )}
    </div>
  );
}
