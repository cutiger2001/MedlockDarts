import React, { useRef } from 'react';
import { Button } from './Button';

interface ImageCaptureProps {
  value: string | null;
  onChange: (base64: string | null) => void;
}

export function ImageCapture({ value, onChange }: ImageCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ marginBottom: 'var(--spacing-md)' }}>
      <label style={{
        display: 'block',
        marginBottom: 'var(--spacing-xs)',
        fontWeight: 600,
        fontSize: '0.9rem',
      }}>
        Photo
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
        {value ? (
          <img
            src={value}
            alt="Player"
            style={{
              width: 80, height: 80, borderRadius: '50%',
              objectFit: 'cover', border: '2px solid var(--color-border)',
            }}
          />
        ) : (
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            backgroundColor: 'var(--color-background)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px dashed var(--color-border)',
            fontSize: '2rem', color: 'var(--color-text-light)',
          }}>
            👤
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
          <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
            📷 Take / Choose Photo
          </Button>
          {value && (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </div>
  );
}
