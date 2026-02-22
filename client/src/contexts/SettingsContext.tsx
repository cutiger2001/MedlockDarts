import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface AppSettings {
  /** X01 scoring mode: 'dart' = dart-by-dart, 'turn' = enter total per turn */
  x01ScoringMode: 'dart' | 'turn';
  /** Quick-entry buttons for turn-based X01 scoring */
  fastEntryScores: number[];
}

const DEFAULT_SETTINGS: AppSettings = {
  x01ScoringMode: 'dart',
  fastEntryScores: [26, 40, 41, 43, 60, 100],
};

const STORAGE_KEY = 'darts-app-settings';

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
