import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Assets } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { useGameStore } from '../../bridge/gameStore';
import { MatchPublisher } from '../../bridge/matchPublisher';
import { gameConfig, withOptions } from '../../config/gameConfig';
import { loadOptions } from '../options/optionsStorage';
import { Simulation } from '../../game/Simulation';
import { attachKeyboard, readKeyboardInput, releaseAllKeyboard } from '../../input/keyboardInput';
import { mergeInputs } from '../../input/inputState';
import { readTouchInput, releaseAllTouch } from '../../input/touchInput';
import { ArenaView } from '../../game/render/ArenaView';
import { EffectsView } from '../../game/render/EffectsView';
import { GameRenderer } from '../../game/render/GameRenderer';
import { ProjectilesView } from '../../game/render/ProjectileView';
import { ShipsView } from '../../game/render/ShipView';
import { loadGameAssets } from '../../game/render/assetLoader';
import { loadArenaAssets } from '../../game/map/mapAssets';

export type SessionPhase = 'loading' | 'error' | 'ready';

export interface GameSession {
  /** 'loading' while assets load; 'error' shows Retry; 'ready' may start combat */
  phase: SessionPhase;
  /** asset loading progress, 0..1, for the LoadingOverlay */
  progress: number;
  /** failure message; combat never starts while this is set */
  error: string | null;
  /** Retry button: reloads assets (on failure) and rebuilds the renderer */
  retry: () => void;
  /** attach to the div that hosts the Pixi canvas */
  containerRef: RefObject<HTMLDivElement | null>;
  /** suspend the running match (button, Esc/P, or page hidden); no-op unless running */
  pause: () => void;
  /** resume a paused match on an explicit action; stale input state is dropped */
  resume: () => void;
}

/**
 * Builds the match session inside an effect, Strict-Mode-safe end to end:
 *
 * - assets load through the cached loader (a double mount joins the same
 *   load instead of fetching twice);
 * - the cleanup marks the run cancelled — no state is set after unmount —
 *   and destroys the renderer, which itself tolerates destruction while its
 *   async init is still awaiting.
 */
export function useGameSession(): GameSession {
  const [phase, setPhase] = useState<SessionPhase>('loading');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const simulationRef = useRef<Simulation | null>(null);
  const viewsRef = useRef<{
    arena: ArenaView;
    ships: ShipsView;
    projectiles: ProjectilesView;
    effects: EffectsView;
  } | null>(null);

  useEffect(() => {
    let cancelled = false; // set by cleanup: nothing may touch state after it

    void (async () => {
      try {
        const result = await loadGameAssets((fraction) => {
          if (!cancelled) setProgress(fraction);
        });
        if (cancelled) return;
        if (result.status === 'error') {
          setError(result.message);
          setPhase('error');
          return;
        }
        // The hand-authored map: world size, collision grid and the tile
        // textures the ArenaView draws (cached for the whole session).
        const arenaAssets = await loadArenaAssets();
        if (cancelled) return;
        if (arenaAssets.status === 'error') {
          setError(arenaAssets.message);
          setPhase('error');
          return;
        }
        const parent = containerRef.current;
        if (!parent) {
          setError('Canvas host is not mounted');
          setPhase('error');
          return;
        }
        // The saved options decide this run's match rules; every new
        // match (Play, Play Again, Restart) reads them again.
        const config = withOptions(gameConfig, loadOptions());
        const renderer = new GameRenderer();
        rendererRef.current = renderer;
        await renderer.init({
          parent,
          worldWidth: arenaAssets.map.widthPx,
          worldHeight: arenaAssets.map.heightPx,
          viewWidth: config.view.width,
          viewHeight: config.view.height,
        });
        if (cancelled) {
          renderer.destroy(); // cleanup raced the init → second, safe destroy
          return;
        }

        // The session: a fresh simulation (own seed) plus the views that
        // read its state every frame. Views live under the renderer's world
        // container, so the teardown frees their display objects too.
        const simulation = new Simulation(
          arenaAssets.map,
          config,
          Math.floor(Math.random() * 0xffffffff),
        );
        simulationRef.current = simulation;
        const state = simulation.snapshot();
        const arenaView = new ArenaView(arenaAssets.texturesByGid, state.arena);
        const shipsView = new ShipsView(
          {
            player: {
              intact: Assets.get<Texture>('ship-player'),
              damaged: Assets.get<Texture>('ship-player-damaged'),
              critical: Assets.get<Texture>('ship-player-critical'),
            },
            chaser: {
              intact: Assets.get<Texture>('ship-chaser'),
              damaged: Assets.get<Texture>('ship-chaser-damaged'),
              critical: Assets.get<Texture>('ship-chaser-critical'),
            },
            shooter: {
              intact: Assets.get<Texture>('ship-shooter'),
              damaged: Assets.get<Texture>('ship-shooter-damaged'),
              critical: Assets.get<Texture>('ship-shooter-critical'),
            },
          },
          {
            player: config.player.radius,
            chaser: config.chaser.radius,
            shooter: config.shooter.radius,
          },
        );
        const projectilesView = new ProjectilesView(
          { cannonBall: Assets.get<Texture>('projectile-cannon-ball') },
          config.projectile.radius,
        );
        const effectsView = new EffectsView({
          explosionFrames: [
            Assets.get<Texture>('effect-explosion-1'),
            Assets.get<Texture>('effect-explosion-2'),
            Assets.get<Texture>('effect-explosion-3'),
          ],
          fireFrames: [Assets.get<Texture>('effect-fire-1'), Assets.get<Texture>('effect-fire-2')],
          flash: Assets.get<Texture>('projectile-cannon-ball'),
        });
        viewsRef.current = {
          arena: arenaView,
          ships: shipsView,
          projectiles: projectilesView,
          effects: effectsView,
        };
        renderer.world?.addChild(
          arenaView.container,
          shipsView.container,
          projectilesView.container,
          effectsView.container,
        );

        // The bridge: the publisher decides when the per-frame snapshot
        // reaches the React store (on change, or the ~250 ms clock cadence).
        const publisher = new MatchPublisher((view) => {
          useGameStore.getState().applySnapshot(view);
        });
        // Publish the fresh state right away, so no stale paused/ended
        // status from a previous run is visible when React renders 'ready'.
        publisher.push(simulation.snapshot(), 0);

        // One ticker tick = advance the fixed-step simulation, drain the
        // event queue into effects, then the render reads the fresh state;
        // Pixi draws right after the callbacks. Keyboard and touch merge
        // into the player first so held controls drive it this very frame.
        renderer.startLoop((deltaSec) => {
          simulation.setInput(mergeInputs(readKeyboardInput(), readTouchInput()));
          simulation.step(deltaSec);
          const snapshot = simulation.snapshot();
          // Camera follows the player (the sim spawns it at the world
          // center); the renderer clamps it at the world edges.
          const player = snapshot.ships.find((ship) => ship.kind === 'player');
          if (player) renderer.setCamera(player.position.x, player.position.y);
          shipsView.sync(snapshot.ships);
          projectilesView.sync(snapshot.projectiles);
          publisher.push(snapshot, deltaSec);
          effectsView.consume(simulation.drainEvents());
          effectsView.update(deltaSec);
        });

        setPhase('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      // Views first (frees their pools), then the renderer (ticker off,
      // observer disconnected, canvas removed, world torn down).
      viewsRef.current?.arena.destroy();
      viewsRef.current?.ships.destroy();
      viewsRef.current?.projectiles.destroy();
      viewsRef.current?.effects.destroy();
      viewsRef.current = null;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      simulationRef.current = null;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setPhase('loading');
    setProgress(0);
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  // Game keys are captured only while this session is the active gameplay
  // context: attached when combat is ready, removed when it stops being
  // ready (retry) or the match screen unmounts. The gate keeps the pause
  // dialog's keyboard (Enter/Space on its buttons) untouched.
  useEffect(() => {
    if (phase !== 'ready') return;
    return attachKeyboard(window, () => useGameStore.getState().status === 'running');
  }, [phase]);

  const pause = useCallback(() => {
    simulationRef.current?.pause();
    // every held control releases with the pause: no touch button or key
    // can stay stuck down afterwards
    releaseAllTouch();
    releaseAllKeyboard();
  }, []);

  const resume = useCallback(() => {
    // resume() is the player's explicit action — the simulation also drops
    // any control state captured while the match was paused.
    simulationRef.current?.resume();
  }, []);

  return { phase, progress, error, retry, containerRef, pause, resume };
}
