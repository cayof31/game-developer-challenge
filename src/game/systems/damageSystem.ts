import type { Ship } from '../types';

/**
 * Applies damage to a ship exactly once: the projectile that dealt it is
 * marked for removal in the same step, and a ship reaching 0 hp stops
 * taking part in the simulation (alive = false).
 *
 * Returns true when this hit destroyed the ship.
 */
export function damageSystem(target: Ship, amount: number): boolean {
  if (!target.alive) return false;
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) {
    target.alive = false;
    return true;
  }
  return false;
}
