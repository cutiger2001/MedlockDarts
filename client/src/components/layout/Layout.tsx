import React, { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isGamePage = location.pathname.startsWith('/game/');

  return (
    <>
      {!isGamePage && <Header />}
      <main className={isGamePage ? 'page container game-fullscreen' : 'page container'}>
        {children}
      </main>
    </>
  );
}
