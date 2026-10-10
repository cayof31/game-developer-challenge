import { clampToArena, isInsideArena, solidWithinRadius } from '../arena/arena';
import { distance } from '../math';
import type { Arena, Projectile, Ship } from '../types';

/**
 * Resolves one ship against the world for the current step:
 * 1. pushes it out of any solid island cell it overlaps, along the contact
 *    normal (least-penetration axis when the center sits inside a cell);
 * 2. clamps it to the arena bounds (after the push, so it can never leave).
 */
export function collisionSystem(ship: Ship, arena: Arena, radius: number): void {
  const tileSize = arena.tileSize;
  const col0 = Math.max(0, Math.floor((ship.position.x - radius) / tileSize));
  const col1 = Math.min(arena.cols - 1, Math.floor((ship.position.x + radius) / tileSize));
  const row0 = Math.max(0, Math.floor((ship.position.y - radius) / tileSize));
  const row1 = Math.min(arena.rows - 1, Math.floor((ship.position.y + radius) / tileSize));
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) {
      if (arena.collision[row * arena.cols + col] !== 1) continue;
      const left = col * tileSize;
      const top = row * tileSize;
      const closestX = Math.min(Math.max(ship.position.x, left), left + tileSize);
      const closestY = Math.min(Math.max(ship.position.y, top), top + tileSize);
      const dx = ship.position.x - closestX;
      const dy = ship.position.y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq >= radius * radius) continue;
      if (distSq > 0) {
        const dist = Math.sqrt(distSq);
        ship.position.x = closestX + (dx / dist) * radius;
        ship.position.y = closestY + (dy / dist) * radius;
      } else {
        // Center inside the cell → push along the axis of least penetration.
        const penLeft = ship.position.x - left;
        const penRight = left + tileSize - ship.position.x;
        const penTop = ship.position.y - top;
        const penBottom = top + tileSize - ship.position.y;
        const min = Math.min(penLeft, penRight, penTop, penBottom);
        if (min === penLeft) ship.position.x = left - radius;
        else if (min === penRight) ship.position.x = left + tileSize + radius;
        else if (min === penTop) ship.position.y = top - radius;
        else ship.position.y = top + tileSize + radius;
      }
    }
  }

  const clamped = clampToArena(arena, ship.position, radius);
  ship.position.x = clamped.x;
  ship.position.y = clamped.y;
}

/** Projectiles that leave the arena are marked for removal. */
export function projectileCollisionSystem(projectile: Projectile, arena: Arena): void {
  if (!isInsideArena(arena, projectile.position)) {
    projectile.alive = false;
  }
}

/** True when two ships touch (contact damage, blocking). */
export function shipsOverlap(
  a: Ship,
  b: Ship,
  radiusA: number,
  radiusB: number,
): boolean {
  return distance(a.position, b.position) < radiusA + radiusB;
}

/** First alive ship of the opposite side the projectile overlaps, if any. */
export function projectileHitsShip(
  projectile: Projectile,
  ships: readonly Ship[],
  projectileRadius: number,
  shipRadius: (ship: Ship) => number,
): Ship | null {
  for (const ship of ships) {
    if (!ship.alive) continue;
    const oppositeSide =
      projectile.owner === 'player' ? ship.kind !== 'player' : ship.kind === 'player';
    if (!oppositeSide) continue;
    if (distance(projectile.position, ship.position) < shipRadius(ship) + projectileRadius) {
      return ship;
    }
  }
  return null;
}

/** True when the projectile overlaps any solid island cell. */
export function projectileHitsIsland(
  projectile: Projectile,
  arena: Arena,
  projectileRadius: number,
): boolean {
  return solidWithinRadius(arena, projectile.position, projectileRadius);
}
