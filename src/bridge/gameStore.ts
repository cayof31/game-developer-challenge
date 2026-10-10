import { create } from 'zustand';
import type { MatchView } from './matchPublisher';

export type { MatchView };

/**
 * The game → React bridge store (zustand): the HUD and dialogs subscribe
 * here; the MatchPublisher is the only writer, and it publishes on change
 * or at the time cadence — never per frame.
 */
export interface GameState extends MatchView {
  /** replace the published slice (called by the MatchPublisher) */
  applySnapshot: (snapshot: MatchView) => void;
}

export const useGameStore = create<GameState>((set) => ({
  // neutral placeholders until the first frame publishes the real state
  score: 0,
  timeLeftSec: 0,
  hp: 0,
  maxHp: 0,
  status: 'running',
  endReason: null,
  applySnapshot: (snapshot) => set(snapshot),
}));
