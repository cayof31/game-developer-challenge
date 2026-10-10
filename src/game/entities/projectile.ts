import { vectorFromAngle } from '../math';
import type { Projectile, Vec2 } from '../types';

/**
 * A projectile is born with its velocity locked to `angle` × speed and its
 * life countdown starting at `lifeSec` (range = speed × lifeSec).
 */
export function createProjectile(
  id: number,
  owner: Projectile['owner'],
  position: Vec2,
  angle: number,
  spec: { speed: number; damage: number; lifeSec: number },
): Projectile {
  return {
    id,
    owner,
    position: { ...position },
    velocity: vectorFromAngle(angle, spec.speed),
    damage: spec.damage,
    life: spec.lifeSec,
    alive: true,
  };
}
