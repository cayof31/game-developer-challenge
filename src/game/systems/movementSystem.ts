import type { InputState } from '../../input/inputState';
import { normalizeAngle, vectorFromAngle } from '../math';
import type { Projectile, Ship } from '../types';

/**
 * Advances one ship for `dt` seconds from its controls.
 * Rotation: turnLeft decreases the angle, turnRight increases it.
 * Motion: forward only, movement = speed × dt along the facing angle,
 * applied only while thrusting (no inertia).
 */
export function movementSystem(
  ship: Ship,
  input: InputState,
  dt: number,
  moveSpeed: number,
  rotationSpeed: number,
): void {
  const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
  if (turn !== 0) {
    ship.angle = normalizeAngle(ship.angle + turn * rotationSpeed * dt);
  }

  if (input.thrust) {
    const delta = vectorFromAngle(ship.angle, moveSpeed * dt);
    ship.position.x += delta.x;
    ship.position.y += delta.y;
  }
}

/** Integrates a projectile: movement = velocity × dt, plus its life countdown. */
export function projectileMovementSystem(projectile: Projectile, dt: number): void {
  projectile.position.x += projectile.velocity.x * dt;
  projectile.position.y += projectile.velocity.y * dt;
  projectile.life -= dt;
  if (projectile.life <= 0) {
    projectile.alive = false;
  }
}
