import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface AppSettings {
  /** X01 scoring mode: 'dart' = dart-by-dart, 'turn' = enter total per turn */
  x01ScoringMode: 'dart' | 'turn';
  /** Quick-entry buttons for turn-based X01 scoring */
  fastEntryScores: number[];
}

const DEFAULT_SETTINGS: AppSettings = {
  x01ScoringMode: 'turn',
  fastEntryScores: [26, 40, 41, 43, 60, 100],
};

const STORAGE_KEY = 'darts-app-settings';
const ADMIN_PASSWORD_KEY = 'darts-admin-password';

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  adminUnlocked: boolean;
  adminPassword: string;
  unlockAdmin: (password: string) => void;
  lockAdmin: () => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
  adminUnlocked: false,
  adminPassword: '',
  unlockAdmin: () => {},
  lockAdmin: () => {},
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

  const [adminPassword, setAdminPassword] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_PASSWORD_KEY) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      if (adminPassword) localStorage.setItem(ADMIN_PASSWORD_KEY, adminPassword);
      else localStorage.removeItem(ADMIN_PASSWORD_KEY);
    } catch { /* ignore */ }
  }, [adminPassword]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  };

  const unlockAdmin = (password: string) => {
    setAdminPassword(password);
  };

  const lockAdmin = () => {
    setAdminPassword('');
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        adminUnlocked: adminPassword.trim().length > 0,
        adminPassword,
        unlockAdmin,
        lockAdmin,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
