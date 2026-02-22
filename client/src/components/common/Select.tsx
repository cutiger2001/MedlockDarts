import React, { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
  error?: string;
}

export function Select({ label, options, error, id, style, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div style={{ marginBottom: 'var(--spacing-md)', ...style }}>
      {label && (
        <label
          htmlFor={selectId}
          style={{
            display: 'block',
            marginBottom: 'var(--spacing-xs)',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          {label}
        </label>
      )}
      <select id={selectId} style={{ width: '100%' }} {...props}>
        <option value="">Select...</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: '4px' }}>
          {error}
        </p>
      )}
    </div>
  );
}
