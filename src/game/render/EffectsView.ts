import { Container, Sprite, Texture } from 'pixi.js';
import type { GameEvent } from '../types';

/** Effect frames/textures, all loaded by the asset manifest. */
export interface EffectsViewTextures {
  readonly explosionFrames: readonly [Texture, Texture, Texture];
  readonly fireFrames: readonly [Texture, Texture];
  /** round white flash for hits — the cannon-ball texture, tinted white */
  readonly flash: Texture;
}

type EffectKind = 'shot' | 'explosion' | 'hit';

// Effect timing and sizing (presentation, not gameplay numbers).
const SHOT_DURATION_SEC = 0.08;
const EXPLOSION_DURATION_SEC = 0.36;
const HIT_DURATION_SEC = 0.1;
const SHOT_SCALE = 1;
const EXPLOSION_SCALE = 1.4;
const HIT_SCALE = 1.6;

// The fire frames are drawn with the flash pointing down (south) in the
// texture, like the hulls — this quarter-turn aims each flash along the
// shot direction it is spawned for: out of the bow for front shots, off
// the side for broadsides.
const TEXTURE_FLASH_ANGLE = Math.PI / 2;

interface EffectInstance {
  readonly kind: EffectKind;
  readonly container: Container;
  readonly sprite: Sprite;
  readonly frames: readonly Texture[];
  readonly durationSec: number;
  /** white fade-out (hits only) */
  readonly fade: boolean;
  elapsedSec: number;
}

/**
 * Event-driven effects, fed from the simulation's queue every frame:
 *
 * - shot → muzzle flash (fire frames) at the muzzle, pointing along the shot;
 * - explosion → the animated explosion frames at the destroyed ship;
 * - hit → a short white flash over the struck ship.
 * (enemyDestroyed and matchEnded add nothing on top for now.)
 *
 * Every effect removes itself when its time is up and returns to a per-kind
 * pool — nothing here allocates during the match.
 */
export class EffectsView {
  readonly container = new Container();
  private readonly textures: EffectsViewTextures;
  private readonly pools: Record<EffectKind, EffectInstance[]> = {
    shot: [],
    explosion: [],
    hit: [],
  };
  private readonly active: EffectInstance[] = [];

  constructor(textures: EffectsViewTextures) {
    this.textures = textures;
  }

  /** Spawns the effects for one frame worth of simulation events. */
  consume(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (!event.position) continue;
      switch (event.type) {
        case 'shot':
          this.spawn('shot', event.position, event.angle ?? 0, this.textures.fireFrames,
            SHOT_DURATION_SEC, SHOT_SCALE, false);
          break;
        case 'explosion':
          this.spawn('explosion', event.position, 0, this.textures.explosionFrames,
            EXPLOSION_DURATION_SEC, EXPLOSION_SCALE, false);
          break;
        case 'hit':
          this.spawn('hit', event.position, 0, [this.textures.flash],
            HIT_DURATION_SEC, HIT_SCALE, true);
          break;
        default:
          break; // enemyDestroyed / matchEnded: no extra effect for now
      }
    }
  }

  /** Advances every active effect; finished ones hide and go back to the pool. */
  update(deltaSec: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const effect = this.active[i];
      effect.elapsedSec += deltaSec;
      if (effect.elapsedSec >= effect.durationSec) {
        this.release(i);
        continue;
      }
      const progress = effect.elapsedSec / effect.durationSec;
      const frame = Math.min(
        effect.frames.length - 1,
        Math.floor(progress * effect.frames.length),
      );
      effect.sprite.texture = effect.frames[frame];
      if (effect.fade) effect.sprite.alpha = 1 - progress;
    }
  }

  /** Destroys every instance (active and pooled); textures stay cached. */
  destroy(): void {
    for (const effect of this.active) effect.container.destroy({ children: true });
    for (const kind of Object.keys(this.pools) as EffectKind[]) {
      for (const effect of this.pools[kind]) effect.container.destroy({ children: true });
    }
    this.active.length = 0;
    for (const kind of Object.keys(this.pools) as EffectKind[]) this.pools[kind] = [];
    this.container.destroy({ children: true });
  }

  private spawn(
    kind: EffectKind,
    position: { x: number; y: number },
    angle: number,
    frames: readonly Texture[],
    durationSec: number,
    scale: number,
    fade: boolean,
  ): void {
    const effect = this.acquire(kind, frames, durationSec, scale, fade);
    effect.elapsedSec = 0;
    effect.container.position.set(position.x, position.y);
    effect.container.rotation = angle - TEXTURE_FLASH_ANGLE;
    effect.container.visible = true;
    effect.sprite.alpha = 1;
    effect.sprite.texture = frames[0];
    this.container.addChild(effect.container);
    this.active.push(effect);
  }

  private acquire(
    kind: EffectKind,
    frames: readonly Texture[],
    durationSec: number,
    scale: number,
    fade: boolean,
  ): EffectInstance {
    const pooled = this.pools[kind].pop();
    if (pooled) return pooled;
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5);
    sprite.scale.set(scale);
    const container = new Container();
    container.addChild(sprite);
    return { kind, container, sprite, frames, durationSec, fade, elapsedSec: 0 };
  }

  private release(index: number): void {
    const [effect] = this.active.splice(index, 1);
    effect.container.visible = false;
    this.container.removeChild(effect.container);
    this.pools[effect.kind].push(effect);
  }
}
