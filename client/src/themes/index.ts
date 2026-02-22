// Theme token definitions
export interface ThemeTokens {
  name: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryDark: string;
  accent: string;
  background: string;
  surface: string;
  surfaceHover: string;
  text: string;
  textLight: string;
  textOnPrimary: string;
  textOnSecondary: string;
  border: string;
  success: string;
  danger: string;
  warning: string;
}

// Default: USA flag colors with neutral grey background
export const defaultTheme: ThemeTokens = {
  name: 'Default',
  primary: '#002868',       // Old Glory Blue
  primaryDark: '#001a44',
  primaryLight: '#0a3d8f',
  secondary: '#BF0A30',     // Old Glory Red
  secondaryDark: '#8c0723',
  accent: '#FFFFFF',
  background: '#e8e8e8',    // Neutral grey
  surface: '#FFFFFF',
  surfaceHover: '#f5f5f5',
  text: '#1a1a1a',
  textLight: '#666666',
  textOnPrimary: '#FFFFFF',
  textOnSecondary: '#FFFFFF',
  border: '#d0d0d0',
  success: '#2e7d32',
  danger: '#c62828',
  warning: '#f57f17',
};

// DJ: Notre Dame colors
export const djTheme: ThemeTokens = {
  name: 'DJ',
  primary: '#0C2340',       // Notre Dame Navy
  primaryDark: '#081729',
  primaryLight: '#1a3a5c',
  secondary: '#C99700',     // Notre Dame Gold
  secondaryDark: '#9a7500',
  accent: '#AE9142',        // Metallic Gold
  background: '#f0ede6',
  surface: '#FFFFFF',
  surfaceHover: '#f8f6f0',
  text: '#1a1a1a',
  textLight: '#555555',
  textOnPrimary: '#FFFFFF',
  textOnSecondary: '#0C2340',
  border: '#d4cfc2',
  success: '#2e7d32',
  danger: '#c62828',
  warning: '#f57f17',
};

// TD: Clemson colors
export const tdTheme: ThemeTokens = {
  name: 'TD',
  primary: '#F56600',       // Clemson Orange
  primaryDark: '#c45200',
  primaryLight: '#ff8533',
  secondary: '#522D80',     // Regalia (Purple)
  secondaryDark: '#3d2160',
  accent: '#F56600',
  background: '#f5f0f8',
  surface: '#FFFFFF',
  surfaceHover: '#fdf5ee',
  text: '#1a1a1a',
  textLight: '#555555',
  textOnPrimary: '#FFFFFF',
  textOnSecondary: '#FFFFFF',
  border: '#d4cdd8',
  success: '#2e7d32',
  danger: '#c62828',
  warning: '#f57f17',
};

export const themes = {
  default: defaultTheme,
  dj: djTheme,
  td: tdTheme,
} as const;

export type ThemeName = keyof typeof themes;

export function applyTheme(theme: ThemeTokens): void {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-primary-dark', theme.primaryDark);
  root.style.setProperty('--color-primary-light', theme.primaryLight);
  root.style.setProperty('--color-secondary', theme.secondary);
  root.style.setProperty('--color-secondary-dark', theme.secondaryDark);
  root.style.setProperty('--color-accent', theme.accent);
  root.style.setProperty('--color-background', theme.background);
  root.style.setProperty('--color-surface', theme.surface);
  root.style.setProperty('--color-surface-hover', theme.surfaceHover);
  root.style.setProperty('--color-text', theme.text);
  root.style.setProperty('--color-text-light', theme.textLight);
  root.style.setProperty('--color-text-on-primary', theme.textOnPrimary);
  root.style.setProperty('--color-text-on-secondary', theme.textOnSecondary);
  root.style.setProperty('--color-border', theme.border);
  root.style.setProperty('--color-success', theme.success);
  root.style.setProperty('--color-danger', theme.danger);
  root.style.setProperty('--color-warning', theme.warning);
}
