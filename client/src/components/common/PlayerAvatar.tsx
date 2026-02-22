import React from 'react';

interface PlayerAvatarProps {
  imageData: string | null | undefined;
  name: string;
  size?: number;
}

/**
 * Displays a player's image (circle) if available, otherwise shows initials.
 */
export function PlayerAvatar({ imageData, name, size = 48 }: PlayerAvatarProps) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  if (imageData) {
    const src = imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`;
    return (
      <img
        src={src}
        alt={name}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', border: '2px solid var(--color-border)',
        }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: 'var(--color-surface-hover)',
      border: '2px solid var(--color-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.35, color: 'var(--color-text-light)',
    }}>
      {initials}
    </div>
  );
}
