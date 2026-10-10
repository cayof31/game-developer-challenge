import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App.tsx';
import { useGameStore } from './bridge/gameStore';
import { gameConfig } from './config/gameConfig';

declare global {
  interface Window {
    __store: typeof useGameStore;
    __gameConfig: typeof gameConfig;
  }
}

// Harness surface (throwaway): the store for status assertions and the
// config for the math that drives the ship (speeds, radii, view).
window.__store = useGameStore;
window.__gameConfig = gameConfig;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
