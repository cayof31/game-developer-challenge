import { gameConfig, type GameConfig } from '../config/gameConfig';
import { createInputState, type InputState } from '../input/inputState';
import { buildArena } from './arena/arena';
import { createChaser } from './entities/chaser';
import { createPlayer } from './entities/player';
import { createProjectile } from './entities/projectile';
import { createShooter } from './entities/shooter';
import { mulberry32, type Rng } from './random';
import {
  collisionSystem,
  projectileCollisionSystem,
  projectileHitsIsland,
  projectileHitsShip,
  shipsOverlap,
} from './systems/collisionSystem';
import { damageSystem } from './systems/damageSystem';
import { enemyControls } from './systems/enemyAISystem';
import { movementSystem, projectileMovementSystem } from './systems/movementSystem';
import { scoreForKill } from './systems/scoreSystem';
import { findSpawnPoint, pickEnemyKind } from './systems/spawnSystem';
import { weaponSystem, type WeaponParams } from './systems/weaponSystem';
import type { TiledMapDef } from './map/tiled';
import type { Arena, GameEvent, MatchState, Projectile, Ship, Vec2 } from './types';

/**
 * Pure match simulation (no React, no Pixi).
 *
 * Fixed timestep with an accumulator: `step(dt)` is public so tests and the
 * page clock can advance time deterministically, independent of frame rate.
 * Active game time only accumulates while the match is running.
 */
export class Simulation {
  private readonly config: GameConfig;
  private readonly fixedStep: number;
  private rng: Rng;
  private readonly arena: Arena;
  private accumulator = 0;
  private status: 'running' | 'paused' | 'ended' = 'running';
  private timeLeft: number;
  private elapsed = 0;
  private score = 0;
  private endReason: 'time' | 'death' | null = null;
  private input: InputState = createInputState();
  /** the player is id 1, so enemy ids start at 2 */
  private nextId = 2;
  private readonly player: Ship;
  private readonly ships: Ship[] = [];
  private projectiles: Projectile[] = [];
  private readonly events: GameEvent[] = [];
  private spawnTimer: number;

  constructor(map: TiledMapDef, config: GameConfig = gameConfig, seed = 0) {
    // Each match uses a snapshot of the config valid at its start.
    this.config = structuredClone(config);
    this.fixedStep = this.config.simulation.fixedStepSec;
    this.timeLeft = this.config.match.sessionTimeSec;
    // Same seed → same spawns, for reproducible tests. The arena comes from
    // the hand-authored Tiled map — no generation, no RNG.
    this.rng = mulberry32(seed);
    this.arena = buildArena(map);
    this.player = createPlayer(this.config, this.arena.playerSpawn);
    this.ships.push(this.player);
    this.spawnTimer = this.config.match.spawnIntervalSec;
  }

  /** Advances simulation time by `dt` seconds in fixed steps. */
  step(dt: number): void {
    if (this.status !== 'running' || dt <= 0) return;
    this.accumulator += dt;
    while (this.accumulator >= this.fixedStep) {
      this.accumulator -= this.fixedStep;
      this.tick(this.fixedStep);
      if (this.status !== 'running') {
        this.accumulator = 0;
        break;
      }
    }
  }

  /** Suspends timer, cooldowns and simulation. No time is accumulated. */
  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  /**
   * Resumes a paused match on a player action. Control state captured
   * while paused is dropped, so held keys or queued shots from the paused
   * period cannot leak into the resumed combat.
   */
  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.input = createInputState();
  }

  /** Replaces the player's control state (from keyboard or touch). */
  setInput(input: InputState): void {
    this.input = { ...input };
  }

  /** Test hook: restarts the match's PRNG — the same seed replays the same future. */
  setSeed(seed: number): void {
    this.rng = mulberry32(seed);
  }

  /**
   * Test hook: places an enemy built by the REAL factories at an exact
   * position and facing. Positioning only — AI, weapons, collisions and
   * scoring keep running through the regular pipeline.
   */
  placeEnemy(kind: 'chaser' | 'shooter', position: Vec2, angle: number): void {
    this.ships.push(
      kind === 'chaser'
        ? createChaser(this.config, position, this.nextId++, angle)
        : createShooter(this.config, position, this.nextId++, angle),
    );
  }

  /**
   * Test hook: applies the REAL damage rule to the player — hp drops
   * through damageSystem, and the next fixed step runs the same death
   * check as any enemy hit ends the match by, no shortcuts.
   */
  damagePlayer(amount: number): void {
    damageSystem(this.player, amount);
  }

  /**
   * Drains the effect-event queue (shots, hits, explosions…).
   * The renderer calls this once per frame and plays animations/sounds.
   */
  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  /**
   * Read-only view for the renderer and the HUD.
   * Entity objects are shared references — do not mutate them.
   */
  snapshot(): MatchState {
    return {
      status: this.status,
      timeLeft: this.timeLeft,
      elapsed: this.elapsed,
      score: this.score,
      endReason: this.endReason,
      arena: this.arena,
      ships: [...this.ships],
      projectiles: [...this.projectiles],
    };
  }

  private tick(dt: number): void {
    this.elapsed += dt;
    this.timeLeft -= dt;

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.end('time');
      return;
    }

    for (const ship of this.ships) {
      if (!ship.alive) continue;
      const controls =
        ship.kind === 'player' ? this.input : enemyControls(ship, this.player, this.config);
      const movement = this.shipMovement(ship);
      movementSystem(ship, controls, dt, movement.moveSpeed, movement.rotationSpeed);
      if (ship.kind === 'player') {
        weaponSystem(ship, controls, dt, this.weaponParams(), this.spawnPlayerProjectile);
      } else if (ship.kind === 'shooter') {
        weaponSystem(ship, controls, dt, this.enemyWeaponParams(), this.spawnEnemyProjectile);
      }
      collisionSystem(ship, this.arena, this.shipRadius(ship));
    }

    // Chasers explode on contact with the player, damaging it once.
    if (this.player.alive) {
      for (const ship of this.ships) {
        if (!ship.alive || ship.kind !== 'chaser') continue;
        if (shipsOverlap(ship, this.player, this.shipRadius(ship), this.shipRadius(this.player))) {
          const killedPlayer = damageSystem(this.player, this.config.chaser.collisionDamage);
          ship.alive = false; // the chaser explodes with the impact
          this.events.push({ type: 'explosion', position: { ...ship.position }, shipId: ship.id });
          if (killedPlayer) {
            this.events.push({
              type: 'explosion',
              position: { ...this.player.position },
              shipId: this.player.id,
            });
          }
        }
      }
    }

    for (const projectile of this.projectiles) {
      projectileMovementSystem(projectile, dt);
      projectileCollisionSystem(projectile, this.arena);
      if (!projectile.alive) continue;

      const target = projectileHitsShip(
        projectile,
        this.ships,
        this.config.projectile.radius,
        (ship) => this.shipRadius(ship),
      );
      if (target) {
        this.events.push({
          type: 'hit',
          position: { ...projectile.position },
          amount: projectile.damage,
          shipId: target.id,
        });
        // Damage lands once: the projectile is removed in the same step.
        const killed = damageSystem(target, projectile.damage);
        if (killed) {
          const points = scoreForKill(this.config, projectile, target);
          this.score += points;
          this.events.push({
            type: 'explosion',
            position: { ...target.position },
            shipId: target.id,
          });
          if (points > 0) {
            this.events.push({
              type: 'enemyDestroyed',
              position: { ...target.position },
              shipId: target.id,
            });
          }
        }
        projectile.alive = false;
        continue;
      }
      if (projectileHitsIsland(projectile, this.arena, this.config.projectile.radius)) {
        this.events.push({ type: 'hit', position: { ...projectile.position } });
        projectile.alive = false;
      }
    }
    // Remove projectiles that expired, left the arena or hit something.
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.config.match.spawnIntervalSec;
      this.trySpawnEnemy();
    }

    if (this.player.hp <= 0) {
      this.end('death');
    }
  }

  /** Spawns one enemy if the cap allows and a valid point is found. */
  private trySpawnEnemy(): void {
    const aliveEnemies = this.ships.filter(
      (ship) => ship.alive && ship.kind !== 'player',
    ).length;
    if (aliveEnemies >= this.config.match.spawnMaxActiveEnemies) return;

    const kind = pickEnemyKind(this.config, this.rng);
    const radius = kind === 'chaser' ? this.config.chaser.radius : this.config.shooter.radius;
    const point = findSpawnPoint(this.config, radius, this.player, this.arena, this.rng);
    if (!point) return; // no valid spot within the attempt budget → skip this interval

    const facing = Math.atan2(
      this.player.position.y - point.y,
      this.player.position.x - point.x,
    );
    this.ships.push(
      kind === 'chaser'
        ? createChaser(this.config, point, this.nextId++, facing)
        : createShooter(this.config, point, this.nextId++, facing),
    );
  }

  private readonly spawnPlayerProjectile = (position: Vec2, angle: number): void => {
    this.projectiles.push(
      createProjectile(this.nextId++, 'player', position, angle, this.config.projectile.player),
    );
    this.events.push({ type: 'shot', position: { ...position }, angle, owner: 'player' });
  };

  private readonly spawnEnemyProjectile = (position: Vec2, angle: number): void => {
    this.projectiles.push(
      createProjectile(this.nextId++, 'enemy', position, angle, this.config.projectile.enemy),
    );
    this.events.push({ type: 'shot', position: { ...position }, angle, owner: 'enemy' });
  };

  private weaponParams(): WeaponParams {
    return {
      frontCooldownSec: this.config.player.frontCooldownSec,
      sideCooldownSec: this.config.player.sideCooldownSec,
      sideShotCount: this.config.player.sideShotCount,
      sideShotOffset: this.config.player.sideShotOffset,
      muzzleDistance: this.config.player.radius + this.config.projectile.radius,
    };
  }

  private enemyWeaponParams(): WeaponParams {
    return {
      frontCooldownSec: this.config.shooter.fireCooldownSec,
      // enemies have no broadside: sideShotCount keeps the volley empty
      sideCooldownSec: 0,
      sideShotCount: 0,
      sideShotOffset: 0,
      muzzleDistance: this.config.shooter.radius + this.config.projectile.radius,
    };
  }

  private shipRadius(ship: Ship): number {
    switch (ship.kind) {
      case 'player':
        return this.config.player.radius;
      case 'chaser':
        return this.config.chaser.radius;
      case 'shooter':
        return this.config.shooter.radius;
    }
  }

  private shipMovement(ship: Ship): { moveSpeed: number; rotationSpeed: number } {
    switch (ship.kind) {
      case 'player':
        return {
          moveSpeed: this.config.player.moveSpeed,
          rotationSpeed: this.config.player.rotationSpeed,
        };
      case 'chaser':
        return {
          moveSpeed: this.config.chaser.moveSpeed,
          rotationSpeed: this.config.chaser.rotationSpeed,
        };
      case 'shooter':
        return {
          moveSpeed: this.config.shooter.moveSpeed,
          rotationSpeed: this.config.shooter.rotationSpeed,
        };
    }
  }

  private end(reason: 'time' | 'death'): void {
    this.status = 'ended';
    this.endReason = reason;
    this.accumulator = 0;
    this.events.push({ type: 'matchEnded', reason });
  }
}
