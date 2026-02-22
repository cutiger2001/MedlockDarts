import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/HomePage';
import { PlayersPage } from './pages/PlayersPage';
import { TeamsPage } from './pages/TeamsPage';
import { LeaguePage } from './pages/LeaguePage';
import { MatchPage } from './pages/MatchPage';
import { GamePage } from './pages/GamePage';
import { StatsPage } from './pages/StatsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PlayGamePage } from './pages/PlayGamePage';
import { LiveMatchPage } from './pages/LiveMatchPage';
import './App.css';

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/play" element={<PlayGamePage />} />
              <Route path="/players" element={<PlayersPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/league" element={<LeaguePage />} />
              <Route path="/league/:seasonId" element={<LeaguePage />} />
              <Route path="/match/:matchId" element={<MatchPage />} />
              <Route path="/game/:gameId" element={<GamePage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/stats/player/:playerId" element={<StatsPage />} />
              <Route path="/live" element={<LiveMatchPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </SettingsProvider>
    </ThemeProvider>
  );
}
