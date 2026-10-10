import { Container, Sprite, Texture } from 'pixi.js';
import type { Projectile } from '../types';

/** The single cannon-ball texture (alias from the asset manifest). */
export interface ProjectileViewTextures {
  readonly cannonBall: Texture;
}

// Ball tint per owner (presentation, not gameplay numbers).
const PLAYER_TINT = 0xfff2c4;
const ENEMY_TINT = 0xff8a5c;

/**
 * One projectile on screen: a single cannon-ball sprite that points along
 * its velocity. Allocation-free per update — only position, rotation and
 * tint change.
 */
export class ProjectileView {
  readonly container = new Container();
  private readonly ball: Sprite;

  constructor(texture: Texture, radius: number) {
    this.ball = new Sprite(texture);
    this.ball.anchor.set(0.5);
    this.ball.scale.set((radius * 2) / Math.max(texture.width, texture.height));
    this.container.addChild(this.ball);
  }

  /** Copies the projectile's state into the view. */
  update(projectile: Projectile): void {
    this.container.position.set(projectile.position.x, projectile.position.y);
    this.container.visible = projectile.alive;
    this.ball.rotation = Math.atan2(projectile.velocity.y, projectile.velocity.x);
    this.ball.tint = projectile.owner === 'player' ? PLAYER_TINT : ENEMY_TINT;
  }

  /** Frees this view's display objects (pooled views are kept alive). */
  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/**
 * Keeps one ProjectileView per projectile id, synchronized with the
 * simulation: `sync()` creates views for new ids, updates the existing ones
 * and pools the ones whose id left the list.
 *
 * Projectiles are the highest-churn objects on screen (a shot lives about a
 * second), so removed views go to a pool instead of the GC — the next shot
 * reuses the container.
 */
export class ProjectilesView {
  readonly container = new Container();
  private readonly views = new Map<number, ProjectileView>();
  private readonly pool: ProjectileView[] = [];
  private readonly texture: Texture;
  private readonly radius: number;

  constructor(textures: ProjectileViewTextures, radius: number) {
    this.texture = textures.cannonBall;
    this.radius = radius;
  }

  /** Number of live views, for parity with the simulation's list. */
  get size(): number {
    return this.views.size;
  }

  sync(projectiles: readonly Projectile[]): void {
    const present = new Set<number>();
    for (const projectile of projectiles) present.add(projectile.id);

    for (const [id, view] of this.views) {
      if (!present.has(id)) {
        this.container.removeChild(view.container);
        this.views.delete(id);
        this.pool.push(view); // recycle, never destroy
      }
    }

    for (const projectile of projectiles) {
      let view = this.views.get(projectile.id);
      if (!view) {
        view = this.acquire();
        this.views.set(projectile.id, view);
        this.container.addChild(view.container);
      }
      view.update(projectile);
    }
  }

  /** Destroys every view (live and pooled); textures stay cached. */
  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    for (const view of this.pool) view.destroy();
    this.views.clear();
    this.pool.length = 0;
    this.container.destroy({ children: true });
  }

  private acquire(): ProjectileView {
    return this.pool.pop() ?? new ProjectileView(this.texture, this.radius);
  }
}
