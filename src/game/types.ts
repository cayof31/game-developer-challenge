import type { TiledLayer } from './map/tiled';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Ship {
  id: number;
  kind: 'player' | 'chaser' | 'shooter';
  position: Vec2;
  /** radians; 0 points along +x */
  angle: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** seconds until the next front/main shot is allowed */
  shootCooldown: number;
  /** seconds until the next broadside is allowed */
  sideCooldown: number;
}

export interface Projectile {
  id: number;
  owner: 'player' | 'enemy';
  position: Vec2;
  velocity: Vec2;
  damage: number;
  /** seconds of life remaining before it expires */
  life: number;
  alive: boolean;
}

/**
 * The fixed logical world, built from the Tiled map: bounds, draw-ordered
 * layers and the collision grid (1 = solid island cell).
 */
export interface Arena {
  readonly width: number;
  readonly height: number;
  readonly cols: number;
  readonly rows: number;
  readonly tileSize: number;
  /** point where the player ship starts (world center) */
  readonly playerSpawn: Vec2;
  /** map layers in draw order (bottom to top) */
  readonly layers: readonly TiledLayer[];
  /** cols×rows grid: 1 = solid island cell (map layer 3), 0 = water */
  readonly collision: Uint8Array;
}

export interface MatchState {
  status: 'running' | 'paused' | 'ended';
  /** seconds left until the match ends by time */
  timeLeft: number;
  /** active seconds elapsed since the match started */
  elapsed: number;
  score: number;
  endReason: 'time' | 'death' | null;
  /** the world this match takes place in: bounds, map layers, collision grid */
  arena: Arena;
  ships: Ship[];
  projectiles: Projectile[];
}

/**
 * Edge-triggered effects for the renderer (animations and sounds).
 * Emitted by the simulation and drained once per frame through
 * Simulation.drainEvents() — never repeated, never guessed.
 */
export interface GameEvent {
  type: 'shot' | 'hit' | 'explosion' | 'enemyDestroyed' | 'matchEnded';
  /** shot: muzzle position; hit: impact point; explosion/enemyDestroyed: ship position */
  position?: Vec2;
  /** shot: muzzle direction */
  angle?: number;
  /** shot: who fired (picks the sound) */
  owner?: 'player' | 'enemy';
  /** hit: target ship; explosion/enemyDestroyed: destroyed ship */
  shipId?: number;
  /** hit: damage applied */
  amount?: number;
  /** matchEnded: why the match stopped */
  reason?: 'time' | 'death';
}
