import React, { ReactNode, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { unlockSpeechSynthesis } from '../../utils/announcer';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isGamePage = location.pathname.startsWith('/game/');
  const unlocked = useRef(false);

  const handleFirstTouch = useCallback(() => {
    if (!unlocked.current) {
      unlockSpeechSynthesis();
      unlocked.current = true;
    }
  }, []);

  return (
    <div onClick={handleFirstTouch}>
      {!isGamePage && <Header />}
      <main className={isGamePage ? 'page container game-fullscreen' : 'page container'}>
        {children}
      </main>
    </div>
  );
}
