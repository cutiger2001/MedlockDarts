import React from 'react';

interface PlayerAvatarProps {
  imageData: string | null | undefined;
  name: string;
  size?: number;
  themeColor?: string | null;
  style?: React.CSSProperties;
}

/**
 * Displays a player's image (circle) if available, otherwise shows initials
 * with the player's chosen theme color (or a default).
 */
export function PlayerAvatar({ imageData, name, size = 48, themeColor, style }: PlayerAvatarProps) {
  const initials = name.split(' ').map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
  const bgColor = themeColor || 'var(--color-surface-hover)';
  // Determine text color based on background brightness
  const textColor = themeColor ? '#fff' : 'var(--color-text-light)';

  if (imageData) {
    const src = imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`;
    return (
      <img
        src={src}
        alt={name}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', border: '2px solid var(--color-border)',
          ...style,
        }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: bgColor,
      border: '2px solid var(--color-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.35, color: textColor,
      ...style,
    }}>
      {initials}
    </div>
  );
}
