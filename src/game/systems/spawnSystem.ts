import type { GameConfig } from '../../config/gameConfig';
import { solidWithinRadius } from '../arena/arena';
import { clamp, distance } from '../math';
import type { Rng } from '../random';
import type { Arena, Ship, Vec2 } from '../types';

/**
 * Re-rolls candidates until one is valid; null after the attempt budget.
 *
 * Spawns are camera-relative: the candidate area is the view window around
 * the camera (clamped exactly like the renderer clamps it), grown by
 * `spawnViewMargin` and intersected with the world. Points inside the
 * visible window are rejected, so enemies always arrive from just
 * off-screen — and every candidate must be in open water (no solid island
 * cell within the ship's radius), so ships never spawn on land.
 */
export function findSpawnPoint(
  config: GameConfig,
  radius: number,
  player: Ship,
  arena: Arena,
  rng: Rng,
): Vec2 | null {
  const { width, height } = arena;
  const { width: viewWidth, height: viewHeight } = config.view;
  const margin = config.match.spawnViewMargin;
  const cameraX = clamp(player.position.x, viewWidth / 2, width - viewWidth / 2);
  const cameraY = clamp(player.position.y, viewHeight / 2, height - viewHeight / 2);
  const minX = Math.max(0, cameraX - viewWidth / 2 - margin);
  const maxX = Math.min(width, cameraX + viewWidth / 2 + margin);
  const minY = Math.max(0, cameraY - viewHeight / 2 - margin);
  const maxY = Math.min(height, cameraY + viewHeight / 2 + margin);

  for (let attempt = 0; attempt < config.match.spawnPlacementAttempts; attempt += 1) {
    const point: Vec2 = {
      x: minX + rng() * (maxX - minX),
      y: minY + rng() * (maxY - minY),
    };
    const offScreen =
      point.x < cameraX - viewWidth / 2 ||
      point.x > cameraX + viewWidth / 2 ||
      point.y < cameraY - viewHeight / 2 ||
      point.y > cameraY + viewHeight / 2;
    const farFromPlayer =
      distance(point, player.position) >= config.match.spawnMinDistanceFromPlayer;
    const inWater = !solidWithinRadius(arena, point, radius);
    if (offScreen && farFromPlayer && inWater) return point;
  }
  return null;
}

/** Picks the enemy type of this spawn from the configured weights. */
export function pickEnemyKind(config: GameConfig, rng: Rng): 'chaser' | 'shooter' {
  const total = config.match.spawnChaserWeight + config.match.spawnShooterWeight;
  return rng() * total < config.match.spawnChaserWeight ? 'chaser' : 'shooter';
}
