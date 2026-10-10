/**
 * Documented bounds for the two player-facing options. The Options screen
 * validates against these; gameConfig's defaults must live inside them.
 *
 * Game session time — 60 to 180 seconds:
 * 60 s is the shortest round that still lets a new player meet both enemy
 * types and score a few kills; 180 s keeps a single match short enough to
 * retry immediately. Default: 120 s (gameConfig.match.sessionTimeSec).
 *
 * Enemy spawn time (interval between spawns) — 0.5 to 10 seconds:
 * the interval must stay strictly positive (0 would spawn every fixed step
 * and flood the arena). 0.5 s is the most aggressive pacing the alive-enemy
 * cap (gameConfig.match.spawnMaxActiveEnemies) can absorb without enemies
 * stacking on top of each other; 10 s is the most relaxed setting that
 * still presents a threat inside a 60 s round. Default: 3 s
 * (gameConfig.match.spawnIntervalSec).
 */
export const SESSION_TIME_LIMITS = {
  minSec: 60,
  maxSec: 180,
} as const;

export const SPAWN_INTERVAL_LIMITS = {
  minSec: 0.5,
  maxSec: 10,
} as const;
