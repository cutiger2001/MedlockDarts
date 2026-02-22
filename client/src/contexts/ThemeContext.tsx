import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { themes, applyTheme, ThemeName, ThemeTokens } from '../themes';

interface ThemeContextType {
  themeName: ThemeName;
  theme: ThemeTokens;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'darts-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as ThemeName) || 'default';
  });

  const theme = themes[themeName];

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, themeName);
  }, [themeName, theme]);

  const setTheme = (name: ThemeName) => setThemeName(name);

  return (
    <ThemeContext.Provider value={{ themeName, theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
