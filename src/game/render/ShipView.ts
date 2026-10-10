import { Container, Sprite, Texture } from 'pixi.js';
import type { Ship } from '../types';

/** Hull textures for one kind: the pack's damage states, healthy → wrecked. */
export interface ShipHullTextures {
  readonly intact: Texture;
  readonly damaged: Texture;
  readonly critical: Texture;
}

/** Hull textures, keyed by ship kind (aliases from the asset manifest). */
export interface ShipViewTextures {
  readonly player: ShipHullTextures;
  readonly chaser: ShipHullTextures;
  readonly shooter: ShipHullTextures;
}

/** Collision radii from the config, used to fit each hull to its hitbox. */
export interface ShipViewRadii {
  readonly player: number;
  readonly chaser: number;
  readonly shooter: number;
}

type ShipKind = Ship['kind'];

// Over-ship health bar (presentation, not gameplay numbers).
const BAR_WIDTH = 44;
const BAR_HEIGHT = 6;
const BAR_OFFSET = 10;
const BAR_BACKGROUND = 0x14202b;
const BAR_GREEN = 0x3ecf5c;
const BAR_AMBER = 0xf2b632;
const BAR_RED = 0xe23b3b;
const BAR_AMBER_THRESHOLD = 0.6;
const BAR_RED_THRESHOLD = 0.3;

// Hull deterioration bands: intact at 100-66%, damaged texture at 66-33%,
// critical texture below 33% (presentation, not gameplay numbers).
const DAMAGED_BAND = 0.66;
const CRITICAL_BAND = 0.33;

// Every hull texture in the pack is drawn with the bow pointing down
// (south) at rotation 0, while the simulation measures heading with
// 0 = east and moves the ship along (cos a, sin a). This quarter-turn
// keeps the drawn bow always leading the direction the ship travels.
const TEXTURE_BOW_ANGLE = Math.PI / 2;

/**
 * One ship on screen: the hull sprite (which rotates with the ship) plus a
 * health bar floating above it that never rotates — it is a sibling of the
 * hull, not a child, so a turning ship keeps an axis-aligned readable bar.
 */
export class ShipView {
  readonly container = new Container();
  private readonly hull: Sprite;
  private readonly healthFill: Sprite;
  private readonly textures: ShipHullTextures;
  private currentBand: 'intact' | 'damaged' | 'critical' = 'intact';

  constructor(textures: ShipHullTextures, radius: number) {
    this.textures = textures;
    // Fit the hull inside the collision circle without distorting it. The
    // damage-state variants share the same canvas per kind, so this fit
    // stays valid when the texture is swapped below.
    this.hull = new Sprite(textures.intact);
    this.hull.anchor.set(0.5);
    this.hull.scale.set((radius * 2) / Math.max(textures.intact.width, textures.intact.height));
    this.container.addChild(this.hull);

    const bar = new Container();
    bar.position.set(0, -(radius + BAR_OFFSET));
    const background = new Sprite(Texture.WHITE);
    background.anchor.set(0.5);
    background.width = BAR_WIDTH;
    background.height = BAR_HEIGHT;
    background.tint = BAR_BACKGROUND;
    this.healthFill = new Sprite(Texture.WHITE);
    this.healthFill.anchor.set(0, 0.5);
    this.healthFill.x = -BAR_WIDTH / 2;
    this.healthFill.height = BAR_HEIGHT;
    this.healthFill.width = BAR_WIDTH;
    bar.addChild(background, this.healthFill);
    this.container.addChild(bar);
  }

  /** Copies the ship's state into the view; allocation-free per call. */
  update(ship: Ship): void {
    this.container.position.set(ship.position.x, ship.position.y);
    this.container.visible = ship.alive; // corpses wait for their sinking effect
    this.hull.rotation = ship.angle - TEXTURE_BOW_ANGLE;
    const ratio = ship.maxHp > 0 ? ship.hp / ship.maxHp : 0;
    this.healthFill.width = BAR_WIDTH * ratio;
    this.healthFill.tint =
      ratio > BAR_AMBER_THRESHOLD ? BAR_GREEN : ratio > BAR_RED_THRESHOLD ? BAR_AMBER : BAR_RED;
    // Deterioration: swap the hull to the damage state of its health band,
    // and only when the band actually changes.
    const band =
      ratio >= DAMAGED_BAND ? 'intact' : ratio >= CRITICAL_BAND ? 'damaged' : 'critical';
    if (band !== this.currentBand) {
      this.currentBand = band;
      this.hull.texture = this.textures[band];
    }
  }

  /** Frees this view's display objects (pooled views are kept alive). */
  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/**
 * Keeps one ShipView per ship id, synchronized with the simulation:
 * every `sync()` creates views for new ids, updates the existing ones and
 * destroys the ones whose id left the list.
 *
 * Removed views go to a per-kind pool instead of the GC — enemies spawn
 * continuously through the match, so recycled containers keep the frame
 * loop allocation-free.
 */
export class ShipsView {
  readonly container = new Container();
  private readonly views = new Map<number, ShipView>();
  private readonly kinds = new Map<number, ShipKind>();
  private readonly pool: Record<ShipKind, ShipView[]> = { player: [], chaser: [], shooter: [] };
  private readonly textures: ShipViewTextures;
  private readonly radii: ShipViewRadii;

  constructor(textures: ShipViewTextures, radii: ShipViewRadii) {
    this.textures = textures;
    this.radii = radii;
  }

  /** Number of live views, for parity with the simulation's ship list. */
  get size(): number {
    return this.views.size;
  }

  sync(ships: readonly Ship[]): void {
    const present = new Set<number>();
    for (const ship of ships) present.add(ship.id);

    for (const [id, view] of this.views) {
      if (!present.has(id)) {
        this.container.removeChild(view.container);
        this.views.delete(id);
        this.pool[this.kinds.get(id) ?? 'chaser'].push(view); // recycle, never destroy
        this.kinds.delete(id);
      }
    }

    for (const ship of ships) {
      let view = this.views.get(ship.id);
      if (!view) {
        view = this.acquire(ship.kind);
        this.views.set(ship.id, view);
        this.kinds.set(ship.id, ship.kind);
        this.container.addChild(view.container);
      }
      view.update(ship);
    }
  }

  /** Destroys every view (live and pooled); textures stay cached. */
  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    for (const kind of Object.keys(this.pool) as ShipKind[]) {
      for (const view of this.pool[kind]) view.destroy();
    }
    this.views.clear();
    this.kinds.clear();
    for (const kind of Object.keys(this.pool) as ShipKind[]) this.pool[kind] = [];
    this.container.destroy({ children: true });
  }

  private acquire(kind: ShipKind): ShipView {
    return this.pool[kind].pop() ?? new ShipView(this.textures[kind], this.radii[kind]);
  }
}
