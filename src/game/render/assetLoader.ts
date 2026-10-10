import { Assets } from 'pixi.js';

/** One asset addressed by a descriptive alias. */
export interface AssetEntry {
  readonly alias: string;
  readonly src: string;
}

/** Progress of an active load, from 0 (nothing) to 1 (everything in memory). */
export type AssetLoadProgress = (fraction: number) => void;

/** Outcome of a load attempt. The match only starts on 'loaded'. */
export type AssetLoadResult =
  | { readonly status: 'loaded' }
  | { readonly status: 'error'; readonly message: string };

const ASSETS = '/assets'; // public/assets, served at /assets by Vite

/**
 * Every asset the match needs: ships, projectiles, tiles, effects and HUD.
 * Files live in public/assets with self-describing names; the alias mirrors
 * the file so the renderer always knows what it is grabbing.
 */
export const GAME_MANIFEST: readonly AssetEntry[] = [
  // Ships
  // Hulls per kind and damage state: intact (100-66%), damaged (66-33%),
  // critical (<33%) — the pack's damage variants share each sprite canvas.
  { alias: 'ship-player', src: `${ASSETS}/png/default/ships/ship_1.png` },
  { alias: 'ship-player-damaged', src: `${ASSETS}/png/default/ships/ship_7.png` },
  { alias: 'ship-player-critical', src: `${ASSETS}/png/default/ships/ship_13.png` },
  { alias: 'ship-chaser', src: `${ASSETS}/png/default/ships/dinghy_small_1.png` },
  { alias: 'ship-chaser-damaged', src: `${ASSETS}/png/default/ships/dinghy_small_2.png` },
  { alias: 'ship-chaser-critical', src: `${ASSETS}/png/default/ships/dinghy_small_3.png` },
  { alias: 'ship-shooter', src: `${ASSETS}/png/default/ships/ship_12.png` },
  { alias: 'ship-shooter-damaged', src: `${ASSETS}/png/default/ships/ship_18.png` },
  { alias: 'ship-shooter-critical', src: `${ASSETS}/png/default/ships/ship_24.png` },
  // Projectiles
  { alias: 'projectile-cannon-ball', src: `${ASSETS}/png/default/ship_parts/cannon_ball.png` },
  // Effects: animation frames
  { alias: 'effect-explosion-1', src: `${ASSETS}/png/default/effects/explosion_1.png` },
  { alias: 'effect-explosion-2', src: `${ASSETS}/png/default/effects/explosion_2.png` },
  { alias: 'effect-explosion-3', src: `${ASSETS}/png/default/effects/explosion_3.png` },
  { alias: 'effect-fire-1', src: `${ASSETS}/png/default/effects/fire_1.png` },
  { alias: 'effect-fire-2', src: `${ASSETS}/png/default/effects/fire_2.png` },
  // HUD
  { alias: 'hud-counter-panel', src: `${ASSETS}/png/default/ui/hud/counter_panel.png` },
  { alias: 'hud-health-frame', src: `${ASSETS}/png/default/ui/hud/health_frame.png` },
  { alias: 'hud-health-fill-green', src: `${ASSETS}/png/default/ui/hud/health_fill_green.png` },
  { alias: 'hud-health-fill-amber', src: `${ASSETS}/png/default/ui/hud/health_fill_amber.png` },
  { alias: 'hud-health-fill-red', src: `${ASSETS}/png/default/ui/hud/health_fill_red.png` },
  { alias: 'hud-enemy-health-frame', src: `${ASSETS}/png/default/ui/hud/enemy_health_frame.png` },
  { alias: 'hud-enemy-health-fill-green', src: `${ASSETS}/png/default/ui/hud/enemy_health_fill_green.png` },
  { alias: 'hud-enemy-health-fill-red', src: `${ASSETS}/png/default/ui/hud/enemy_health_fill_red.png` },
  { alias: 'hud-icon-heart', src: `${ASSETS}/png/default/ui/hud/icon_heart.png` },
  { alias: 'hud-icon-score', src: `${ASSETS}/png/default/ui/hud/icon_score.png` },
  { alias: 'hud-icon-time', src: `${ASSETS}/png/default/ui/hud/icon_time.png` },
];

/** How the loader fetches the manifest; injectable for tests. */
export type LoadFn = (
  manifest: readonly AssetEntry[],
  onProgress: AssetLoadProgress,
) => Promise<unknown>;

/**
 * Wraps a load function with the match's loading policy:
 *
 * - Loads once: while (and after) a load is active every call joins the same
 *   promise — restarting a match never reloads or destroys textures.
 * - Forwards progress (0..1) to every subscriber, including late joiners.
 * - Never rejects: resolves `{ status: 'error' }` and clears the cache so the
 *   next call (the Retry button) starts a fresh attempt.
 */
export function createAssetLoader(
  load: LoadFn,
): (onProgress?: AssetLoadProgress) => Promise<AssetLoadResult> {
  let pending: Promise<AssetLoadResult> | null = null;
  let done = false;
  let listeners: AssetLoadProgress[] = [];
  const report = (fraction: number): void => {
    for (const listener of [...listeners]) listener(fraction);
  };

  return (onProgress?: AssetLoadProgress): Promise<AssetLoadResult> => {
    if (pending) {
      if (onProgress) {
        if (done) onProgress(1); // already in memory → nothing to wait for
        else listeners.push(onProgress);
      }
      return pending;
    }
    done = false;
    listeners = onProgress ? [onProgress] : [];
    pending = load(GAME_MANIFEST, report).then<AssetLoadResult, AssetLoadResult>(
      () => {
        done = true;
        report(1);
        listeners = [];
        return { status: 'loaded' };
      },
      (error: unknown) => {
        pending = null; // failed → the next call starts a new attempt
        listeners = [];
        return { status: 'error', message: error instanceof Error ? error.message : String(error) };
      },
    );
    return pending;
  };
}

/**
 * Loads every match asset into Pixi's texture cache. Textures stay cached for
 * the whole session: create a new Simulation freely, the assets are not
 * re-fetched and not destroyed.
 */
export const loadGameAssets: (onProgress?: AssetLoadProgress) => Promise<AssetLoadResult> =
  createAssetLoader((manifest, onProgress) => Assets.load([...manifest], onProgress));
