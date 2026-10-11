import { MAX_FRAME_DELTA_MS, type GameRenderer } from '../game/render/GameRenderer';
import type { Simulation } from '../game/Simulation';
import type { Ship } from '../game/types';

/**
 * The Playwright-facing test hook: `window.__game`, exposed ONLY when the
 * URL carries `?test=1` or the build runs with `VITE_E2E=1` — never in
 * normal use. It observes and controls the clock (the Pixi ticker stops
 * advancing on its own in test mode; only `advance()` moves it), while
 * rules, collisions, inputs and rendering stay the real production
 * pipeline: `advance()` feeds the session's own ticker callback, it never
 * steps the simulation behind the renderer's back.
 */

/**
 * One manual tick delivers exactly the renderer's own frame clamp
 * (MAX_FRAME_DELTA_MS): a larger span would be clamped away and lose
 * virtual time, a smaller one just redraws more. Chunking at the clamp
 * runs the same fixed steps as per-frame ticking while doing 6× fewer
 * real full-viewport renders — that is what makes advancing a whole
 * session feasible. Inputs are constant within an advance (keys go down
 * and up between advance calls), so gameplay physics are identical.
 */

export interface GameStateView {
  status: 'running' | 'paused' | 'ended';
  score: number;
  timeLeftSec: number;
  elapsedSec: number;
  endReason: 'time' | 'death' | null;
  player: { x: number; y: number; angle: number; hp: number; maxHp: number } | null;
  /** enemies currently alive (a shot-down ship disappears from this list) */
  enemies: Array<{ kind: 'chaser' | 'shooter'; x: number; y: number; hp: number }>;
  projectiles: Array<{ x: number; y: number; owner: 'player' | 'enemy' }>;
}

export interface GameTestHooks {
  /** Read-only view of the live simulation: position, angle, health, score, alive enemies, projectiles (with owner), time and status. */
  getState(): GameStateView;
  /** Advances the REAL pipeline by `ms` in fixed steps; the clock never moves alone. */
  advance(ms: number): void;
  /** Restarts the match's seeded PRNG — the same seed replays the same future. */
  setSeed(seed: number): void;
  /** Places an enemy `distance` px directly ahead of the player, facing back at it (test setup; built by the game's own factories). */
  placeEnemyInFront(kind: 'chaser' | 'shooter', distance: number): void;
  /** Applies the real damage rule to the player; the next fixed step ends the match by death if hp reaches 0. */
  damagePlayer(amount: number): void;
}

declare global {
  interface Window {
    __game?: GameTestHooks;
  }
}

/** Test mode only: `?test=1` in the URL or `VITE_E2E=1` in the environment. */
export function isTestMode(): boolean {
  if (import.meta.env.VITE_E2E === '1') return true;
  if (typeof location === 'undefined') return false; // Node checks
  return new URLSearchParams(location.search).get('test') === '1';
}

/**
 * Publishes `window.__game` for a live session (and stops the auto
 * clock), or removes it when the session is destroyed. Outside test mode
 * it does nothing at all.
 */
export function installGameTestHooks(
  session: { simulation: Simulation; renderer: GameRenderer } | null,
): void {
  if (!isTestMode()) return;
  if (session === null) {
    delete window.__game;
    return;
  }
  const { simulation, renderer } = session;
  // from here on the clock only moves when a test advances it
  renderer.stopAutoClock();
  window.__game = {
    getState(): GameStateView {
      const state = simulation.snapshot();
      const player = state.ships.find((ship) => ship.kind === 'player');
      return {
        status: state.status,
        score: state.score,
        timeLeftSec: state.timeLeft,
        elapsedSec: state.elapsed,
        endReason: state.endReason,
        player:
          player === undefined
            ? null
            : {
                x: player.position.x,
                y: player.position.y,
                angle: player.angle,
                hp: player.hp,
                maxHp: player.maxHp,
              },
        enemies: state.ships
          .filter(
            (ship): ship is Ship & { kind: 'chaser' | 'shooter' } =>
              ship.kind !== 'player' && ship.alive,
          )
          .map((ship) => ({
            kind: ship.kind,
            x: ship.position.x,
            y: ship.position.y,
            hp: ship.hp,
          })),
        projectiles: state.projectiles.map((projectile) => ({
          x: projectile.position.x,
          y: projectile.position.y,
          owner: projectile.owner,
        })),
      };
    },
    advance(ms: number): void {
      let remaining = ms;
      while (remaining > 0) {
        const stepMs = Math.min(MAX_FRAME_DELTA_MS, remaining);
        remaining -= stepMs;
        renderer.manualTick(stepMs);
      }
    },
    setSeed(seed: number): void {
      simulation.setSeed(seed);
    },
    placeEnemyInFront(kind: 'chaser' | 'shooter', distance: number): void {
      const player = simulation.snapshot().ships.find((ship) => ship.kind === 'player');
      if (player === undefined) return;
      simulation.placeEnemy(
        kind,
        {
          x: player.position.x + Math.cos(player.angle) * distance,
          y: player.position.y + Math.sin(player.angle) * distance,
        },
        // facing back at the player, like an enemy approaching head-on
        player.angle + Math.PI,
      );
    },
    damagePlayer(amount: number): void {
      simulation.damagePlayer(amount);
    },
  };
}

export default installGameTestHooks;
