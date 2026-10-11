import { Application, Container } from "pixi.js";
import type { Ticker } from "pixi.js";
import type { Vec2 } from "../types";
import { clampCamera, computeLetterbox } from "./viewport";
import type { ViewportTransform } from "./viewport";

/** What GameRenderer needs from a Pixi application (injectable for tests). */
export interface PixiApp {
  readonly canvas: HTMLCanvasElement;
  readonly stage: Container;
  readonly renderer: { resize(width: number, height: number): void };
  readonly ticker: {
    add(callback: (ticker: Ticker) => void): void;
    remove(callback: (ticker: Ticker) => void): void;
    /** test-mode seams: the ticker IS the clock (see stopAutoClock/manualTick) */
    stop(): void;
    update(currentTime?: number): void;
    lastTime: number;
  };
  init(options: PixiAppInitOptions): Promise<void>;
  destroy(
    rendererDestroyOptions?: { removeView?: boolean },
    options?: { children?: boolean },
  ): void;
}

export interface PixiAppInitOptions {
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: number;
  readonly antialias: boolean;
  readonly autoDensity: boolean;
  readonly resolution: number;
}

export type AppFactory = () => PixiApp;

/** The host element GameRenderer observes for size changes. */
export interface ResizeObserverHost {
  observe(element: Element): void;
  unobserve(element: Element): void;
  disconnect(): void;
}

export type ResizeObserverFactory = (
  onResize: () => void,
) => ResizeObserverHost;

export interface GameRendererOptions {
  /** element that hosts the Pixi canvas */
  readonly parent: HTMLElement;
  /** logical world size in px (from the Tiled map); the world never changes size */
  readonly worldWidth: number;
  readonly worldHeight: number;
  /** logical view window in px (config.view); the letterbox fits this to the host */
  readonly viewWidth: number;
  readonly viewHeight: number;
}

/** Deep-ocean backdrop behind the arena (presentation, not gameplay). */
const BACKGROUND_COLOR = 0x113f52;

/**
 * Longest frame time fed to the simulation in one tick (ms). After lag or a
 * tab switch the game skips forward at most this much instead of jumping —
 * the raw ticker.elapsedMS is clamped here, never trusted directly.
 */
export const MAX_FRAME_DELTA_MS = 100;

const defaultResizeObserverFactory: ResizeObserverFactory = (onResize) =>
  new ResizeObserver(onResize);

/**
 * Owns the Pixi Application with a Strict-Mode-safe lifecycle and the
 * responsive viewport.
 *
 * The simulation lives in fixed logical coordinates (the Tiled map's world); a
 * `world` container holds the whole scene. The letterbox fits the LOGICAL
 * VIEW (config.view) into the host element, and `setCamera` positions that
 * view inside the bigger world — the camera follows the player and is
 * clamped so the view never shows beyond the map edges. The canvas fills
 * the host; a ResizeObserver on the host element (not window.resize)
 * recalculates the renderer size and the world transform.
 *
 * Strict Mode races: `destroy()` may run while the async `app.init()` is
 * still awaiting — a `disposed` flag is re-checked after every await, so
 * whatever was created is torn down and nothing stays attached. The observer
 * is created only after a successful init and is always disconnected in
 * `destroy()`.
 */
export class GameRenderer {
  private readonly createApp: AppFactory;
  private readonly createResizeObserver: ResizeObserverFactory;
  private app: PixiApp | null = null;
  private worldContainer: Container | null = null;
  private observer: ResizeObserverHost | null = null;
  private host: HTMLElement | null = null;
  private viewport: ViewportTransform | null = null;
  private worldWidth = 0;
  private worldHeight = 0;
  private viewWidth = 0;
  private viewHeight = 0;
  private camera: Vec2 = { x: 0, y: 0 };
  private initFinished = false;
  private disposed = false;
  private visibleWidth = 0;
  private visibleHeight = 0;
  constructor(
    createApp: AppFactory = () => new Application(),
    createResizeObserver: ResizeObserverFactory = defaultResizeObserverFactory,
  ) {
    this.createApp = createApp;
    this.createResizeObserver = createResizeObserver;
  }

  /** Container holding the scene, in logical world coords; null before init. */
  get world(): Container | null {
    return this.initFinished && !this.disposed ? this.worldContainer : null;
  }

  /** Stage root for non-world layers, or null before init / after destroy. */
  get stage(): Container | null {
    return this.initFinished && !this.disposed
      ? (this.app?.stage ?? null)
      : null;
  }

  /**
   * Creates and initializes the Pixi application, attaches its canvas to the
   * parent, sizes it to the host and starts observing host resizes. If
   * `destroy()` ran while init was awaiting, everything created is torn down
   * right here and nothing stays attached.
   */
  async init(options: GameRendererOptions): Promise<void> {
    if (this.disposed) return; // destroyed before init even started
    const app = this.createApp();
    this.app = app;
    await app.init({
      width: options.viewWidth,
      height: options.viewHeight,
      backgroundColor: BACKGROUND_COLOR,
      antialias: true,
      autoDensity: true,
      resolution: globalThis.devicePixelRatio ?? 1,
    });
    // Cleanup may have run while init was awaiting (Strict Mode): destroy
    // what was created and leave the DOM alone.
    if (this.disposed) {
      this.teardown(app, null);
      this.app = null;
      return;
    }

    this.host = options.parent;
    this.worldWidth = options.worldWidth;
    this.worldHeight = options.worldHeight;
    this.viewWidth = options.viewWidth;
    this.viewHeight = options.viewHeight;
    // The player spawns at the world center — the first frame matches.
    this.camera = { x: options.worldWidth / 2, y: options.worldHeight / 2 };

    const world = new Container();
    app.stage.addChild(world);
    this.worldContainer = world;

    options.parent.appendChild(app.canvas);
    this.initFinished = true;

    // The observer exists only while the renderer is alive; destroy()
    // disconnects it. Observing the host element catches every size change
    // that matters (layout, fullscreen) without listening to window.
    this.observer = this.createResizeObserver(() => this.resize());
    this.observer.observe(options.parent);
    this.resize(); // immediate layout — do not wait for the first callback
  }

  /**
   * Refits the canvas and the world transform to the host's current size.
   * Driven by the ResizeObserver; idempotent and safe at any time.
   */
  resize(): void {
    if (!this.initFinished || this.disposed) return;
    const host = this.host;
    const app = this.app;
    if (!host || !app) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width <= 0 || height <= 0) return;

    const lb = computeLetterbox(width, height, this.viewWidth, this.viewHeight);
    // the view may never be larger than the world on either axis
    const scale = Math.max(
      lb.scale,
      width / this.worldWidth,
      height / this.worldHeight,
    );
    this.viewport = { ...lb, scale, x: 0, y: 0 };
    this.visibleWidth = width / scale;
    this.visibleHeight = height / scale;
    app.renderer.resize(width, height);
    this.camera = clampCamera(
      this.camera,
      this.visibleWidth,
      this.visibleHeight,
      this.worldWidth,
      this.worldHeight,
    );
    this.applyWorldTransform();
  }

  /**
   * Centers the view on a world point (the player, every frame). The camera
   * is clamped so the view stays inside the world — near the map edges the
   * player drifts off-center instead of exposing the area beyond the edge.
   */
  setCamera(x: number, y: number): void {
    if (!this.initFinished || this.disposed) return;
    this.camera = clampCamera(
      { x, y },
      this.visibleWidth,
      this.visibleHeight,
      this.worldWidth,
      this.worldHeight,
    );
    this.applyWorldTransform();
  }

  /** Scale + position of the world container: letterbox offset plus camera. */
  private applyWorldTransform(): void {
    const world = this.worldContainer;
    const viewport = this.viewport;
    if (!world || !viewport) return;
    world.scale.set(viewport.scale);
    world.position.set(
      viewport.x + (this.visibleWidth / 2 - this.camera.x) * viewport.scale,
      viewport.y + (this.visibleHeight / 2 - this.camera.y) * viewport.scale,
    );
  }

  /**
   * Runs `onFrame(deltaSec)` on every ticker tick with the raw frame time
   * (ticker.elapsedMS) clamped to MAX_FRAME_DELTA_MS. Pixi renders right
   * after the ticker callbacks, so the frame drawn always reflects the
   * state just advanced. One loop per renderer; starting again replaces the
   * previous callback. Throws if the renderer is not ready.
   */
  startLoop(onFrame: (deltaSec: number) => void): void {
    if (!this.initFinished || this.disposed) {
      throw new Error(
        "GameRenderer.startLoop called on a renderer that is not ready",
      );
    }
    this.stopLoop();
    this.onFrame = onFrame;
    this.app?.ticker.add(this.tick);
  }

  /** Detaches the ticker callback (kept idempotent for cleanup paths). */
  stopLoop(): void {
    const ticker = this.app?.ticker;
    if (ticker) ticker.remove(this.tick);
    this.onFrame = null;
  }

  /**
   * Test-mode seams (test-support/testHooks.ts): the clock is the Pixi
   * ticker. `stopAutoClock` detaches it from requestAnimationFrame so it
   * never advances on its own; `manualTick` then runs ONE real cycle
   * delivering `deltaMs` virtual milliseconds — the frame callback (rules,
   * inputs, views) and the render all ride it, exactly as in play. The
   * virtual time starts at the ticker's own clock, so no real time leaks
   * in between calls and the result is deterministic.
   */
  private virtualTime: number | null = null;

  stopAutoClock(): void {
    this.app?.ticker.stop();
  }

  manualTick(deltaMs: number): void {
    const ticker = this.app?.ticker;
    if (!ticker || deltaMs <= 0) return;
    this.virtualTime = (this.virtualTime ?? ticker.lastTime) + deltaMs;
    ticker.update(this.virtualTime);
  }

  private onFrame: ((deltaSec: number) => void) | null = null;

  private readonly tick = (ticker: Ticker): void => {
    this.onFrame?.(Math.min(ticker.elapsedMS, MAX_FRAME_DELTA_MS) / 1000);
  };

  /**
   * Safe at any moment — before, during or after init; idempotent.
   * An init still in flight is not destroyed here: the `init()` continuation
   * sees `disposed` when it resumes and cleans up itself.
   */
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop(); // never leave a ticker callback behind
    this.observer?.disconnect();
    this.observer = null;
    if (this.app !== null && this.initFinished)
      this.teardown(this.app, this.worldContainer);
    this.app = null;
    this.worldContainer = null;
    this.host = null;
    this.viewport = null;
    this.virtualTime = null;
    this.initFinished = false;
  }

  /** Removes the canvas and display objects; cached textures survive. */
  private teardown(app: PixiApp, world: Container | null): void {
    world?.destroy({ children: true });
    app.destroy({ removeView: true }, { children: true });
  }
}
