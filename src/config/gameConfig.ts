/**
 * Single source of truth for every gameplay number.
 * Systems must read from here — no loose numbers in logic.
 *
 * Match rules read a snapshot of this config taken when the match starts,
 * so later edits only apply to new matches.
 */
export interface GameConfig {
  match: {
    /** Options: "Game session time". Active play duration, seconds (60–180). */
    sessionTimeSec: number;
    /** Options: "Enemy spawn time". Seconds between spawns; must be > 0. */
    spawnIntervalSec: number;
    /** spawn points are rejected unless at least this far from the player (px) */
    spawnMinDistanceFromPlayer: number;
    /** cap of alive enemies at the same time */
    spawnMaxActiveEnemies: number;
    /** relative chance weights of each enemy type */
    spawnChaserWeight: number;
    spawnShooterWeight: number;
    /** spawn gives up on a point after this many rejected candidates */
    spawnPlacementAttempts: number;
    /** spawn candidates land outside the view, up to this far beyond its edge (px) */
    spawnViewMargin: number;
    /** points awarded per enemy destroyed by the player */
    pointsPerKill: number;
  };
  player: {
    maxHp: number;
    radius: number;
    /** px/s */
    moveSpeed: number;
    /** rad/s */
    rotationSpeed: number;
    /** seconds between front shots */
    frontCooldownSec: number;
    /** seconds between broadsides */
    sideCooldownSec: number;
    /** projectiles per broadside */
    sideShotCount: number;
    /** spacing between parallel broadside shots (px) */
    sideShotOffset: number;
  };
  projectile: {
    radius: number;
    player: {
      /** px/s */
      speed: number;
      damage: number;
      /** seconds of flight; range = speed * lifeSec */
      lifeSec: number;
    };
    enemy: {
      speed: number;
      damage: number;
      lifeSec: number;
    };
  };
  chaser: {
    maxHp: number;
    radius: number;
    moveSpeed: number;
    rotationSpeed: number;
    /** damage applied once on collision with the player, then it explodes */
    collisionDamage: number;
  };
  shooter: {
    maxHp: number;
    radius: number;
    moveSpeed: number;
    rotationSpeed: number;
    /** max distance to start/keep attacking the player (px) */
    attackRange: number;
    /** seconds between enemy shots */
    fireCooldownSec: number;
  };
  view: {
    /** logical window the letterbox fits to the screen (px); the camera shows
     *  this much of the world at once. The world must be at least this big. */
    width: number;
    height: number;
  };
  simulation: {
    /** fixed timestep of the simulation loop (seconds) */
    fixedStepSec: number;
  };
}

export const gameConfig: GameConfig = {
  match: {
    sessionTimeSec: 120,
    spawnIntervalSec: 3,
    spawnMinDistanceFromPlayer: 420,
    spawnMaxActiveEnemies: 8,
    spawnChaserWeight: 0.6,
    spawnShooterWeight: 0.4,
    spawnPlacementAttempts: 20,
    spawnViewMargin: 240,
    pointsPerKill: 1,
  },
  player: {
    maxHp: 100,
    radius: 24,
    moveSpeed: 240,
    rotationSpeed: 2.8,
    frontCooldownSec: 0.4,
    sideCooldownSec: 1.4,
    sideShotCount: 3,
    sideShotOffset: 26,
  },
  projectile: {
    radius: 7,
    player: {
      speed: 460,
      damage: 25,
      lifeSec: 1.1,
    },
    enemy: {
      speed: 340,
      damage: 15,
      lifeSec: 2,
    },
  },
  chaser: {
    maxHp: 50,
    radius: 22,
    moveSpeed: 200,
    rotationSpeed: 2.2,
    collisionDamage: 25,
  },
  shooter: {
    maxHp: 40,
    radius: 22,
    moveSpeed: 150,
    rotationSpeed: 1.8,
    attackRange: 420,
    fireCooldownSec: 1.6,
  },
  view: {
    width: 1920,
    height: 1080,
  },
  simulation: {
    fixedStepSec: 1 / 60,
  },
};

/** The player-facing option values (the Options screen's two fields). */
export interface GameOptionValues {
  sessionTimeSec: number;
  spawnIntervalSec: number;
}

/**
 * The base config with the player's saved options applied — the single
 * entry point where "Options" reach a match. Pure and immutable: the
 * base config is untouched, the result is a copy with only the two
 * option fields replaced.
 */
export function withOptions(base: GameConfig, options: GameOptionValues): GameConfig {
  return {
    ...base,
    match: {
      ...base.match,
      sessionTimeSec: options.sessionTimeSec,
      spawnIntervalSec: options.spawnIntervalSec,
    },
  };
}
